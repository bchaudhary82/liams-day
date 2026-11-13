// GET /api/day?date=YYYY-MM-DD&since=<updatedAt>
//
// Reads the plan for a date, plus the item library and contacts needed to
// render it. Open to anyone — this is what Melody's tablet calls, and her
// board has no login by design.
//
// If `since` matches the stored updatedAt, replies {unchanged:true} so the
// once-a-minute poll costs almost nothing.
//
// Two extra read-only modes for the planner (v2):
//   ?summary=1&from=YYYY-MM-DD&days=8   which upcoming days already have a plan
//   ?latestBefore=YYYY-MM-DD            the most recent day with something saved
//
// NOTES (v2): standing notes live in their own key and show every day until
// Susan removes them. One-off notes still live inside the day. For anything
// still running v1 code (an old board, a planner left open in Safari),
// plan.notes is the two lists combined — exactly what v1 expects to see.

import {
  readKey, dayKey, KEY_LIBRARY, KEY_CONTACTS, KEY_STANDING_NOTES,
  emptyPlan, localDate, addDays, isValidDate, json, useContext, storeName, SLOTS,
} from './_store.js';
import { STARTER_LIBRARY } from './_starter.js';

const MIGRATION_LOOKBACK = 21;   // days
const COPY_LOOKBACK = 21;        // days

const itemCount = (plan) => SLOTS.reduce((n, k) => n + (plan?.[k]?.length || 0), 0);

/**
 * The standing notes. Before Susan's first v2 save there is no stored list,
 * so borrow the notes from her most recent day that had any. That way the
 * notes she already set up keep showing — on every day, including the
 * Monday after a weekend — from the moment v2 goes live.
 */
export async function readStanding() {
  const saved = await readKey(KEY_STANDING_NOTES);
  if (saved && Array.isArray(saved.ids)) {
    return { ids: saved.ids, updatedAt: saved.updatedAt || null, source: 'saved' };
  }
  const today = localDate();
  for (let i = 0; i <= MIGRATION_LOOKBACK; i += 1) {
    const day = await readKey(dayKey(addDays(today, -i)));
    const notes = day?.plan?.notes;
    if (Array.isArray(notes) && notes.length) {
      return { ids: [...notes], updatedAt: null, source: 'migrated' };
    }
  }
  return { ids: [], updatedAt: null, source: 'none' };
}

/** Standing first, then any one-off notes not already among them. */
export function mergeNotes(standingIds, dayIds) {
  const standing = new Set(standingIds);
  return [...standingIds, ...dayIds.filter((id) => !standing.has(id))];
}

const later = (a, b) => (!a ? b : !b ? a : (a > b ? a : b));

async function summary(url) {
  const from = isValidDate(url.searchParams.get('from'))
    ? url.searchParams.get('from') : localDate();
  const n = Math.min(Math.max(Number(url.searchParams.get('days')) || 8, 1), 14);
  const days = [];
  for (let i = 0; i < n; i += 1) {
    const date = addDays(from, i);
    const day = await readKey(dayKey(date));
    days.push({ date, updatedAt: day?.updatedAt || null, items: itemCount(day?.plan) });
  }
  return json({ days, store: storeName() });
}

async function latestBefore(date) {
  for (let i = 1; i <= COPY_LOOKBACK; i += 1) {
    const d = addDays(date, -i);
    const day = await readKey(dayKey(d));
    if (day?.plan && itemCount(day.plan) > 0) {
      return json({ date: d, plan: day.plan, updatedAt: day.updatedAt || null });
    }
  }
  return json({ date: null });
}

export default async (req, context) => {
  useContext(context);
  const url = new URL(req.url);

  try {
    if (url.searchParams.has('summary')) return await summary(url);
    const before = url.searchParams.get('latestBefore');
    if (before !== null) {
      return await latestBefore(isValidDate(before) ? before : localDate());
    }
  } catch (err) {
    return json({ error: 'storage_unavailable', detail: String(err) }, 503);
  }

  const requested = url.searchParams.get('date');
  const since = url.searchParams.get('since');
  const date = isValidDate(requested) ? requested : localDate();

  let day; let standing;
  try {
    [day, standing] = await Promise.all([readKey(dayKey(date)), readStanding()]);
  } catch (err) {
    return json({ error: 'storage_unavailable', detail: String(err) }, 503);
  }

  // One stamp covering both the day and the standing notes, so a tablet
  // left open still notices when Susan edits a standing note.
  const dayUpdatedAt = day?.updatedAt || null;
  const updatedAt = later(dayUpdatedAt, standing.updatedAt);

  // Nothing has changed since the caller last looked.
  if (since && updatedAt && since === updatedAt) {
    return json({ unchanged: true, date, updatedAt });
  }

  const [library, contacts] = await Promise.all([
    readKey(KEY_LIBRARY),
    readKey(KEY_CONTACTS),
  ]);

  // On a brand-new site nothing is stored yet. Hand back the bundled starter
  // list so Susan has something to tap on her first visit — no seeding step,
  // no terminal. Her first save replaces this with her own library.
  const hasLibrary = library && Object.values(library).some((a) => a?.length);

  const plan = day?.plan || emptyPlan();
  const dayNotes = Array.isArray(plan.notes) ? plan.notes : [];

  return json({
    date,
    plan: { ...plan, notes: mergeNotes(standing.ids, dayNotes) },
    standingNotes: standing.ids,
    dayNotes: dayNotes.filter((id) => !standing.ids.includes(id)),
    notesSource: standing.source,
    updatedAt,
    dayUpdatedAt,
    library: hasLibrary ? library : STARTER_LIBRARY,
    contacts: contacts || [],   // deliberately empty until Susan adds her own
    store: storeName(),
  });
};

export const config = { path: '/api/day' };
