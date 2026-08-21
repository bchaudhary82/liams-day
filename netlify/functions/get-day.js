// GET /api/day?date=YYYY-MM-DD&since=<updatedAt>
//
// Reads the plan for a date, plus the item library and contacts needed to
// render it. Open to anyone — this is what Melody's tablet calls, and her
// board has no login by design.
//
// If `since` matches the stored updatedAt, replies {unchanged:true} so the
// once-a-minute poll costs almost nothing.

import {
  readKey, dayKey, KEY_LIBRARY, KEY_CONTACTS,
  emptyPlan, localDate, isValidDate, json,
} from './_store.js';
import { STARTER_LIBRARY } from './_starter.js';

export default async (req) => {
  const url = new URL(req.url);
  const requested = url.searchParams.get('date');
  const since = url.searchParams.get('since');

  const date = isValidDate(requested) ? requested : localDate();

  let day;
  try {
    day = await readKey(dayKey(date));
  } catch (err) {
    return json({ error: 'storage_unavailable', detail: String(err) }, 503);
  }

  const updatedAt = day?.updatedAt || null;

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

  return json({
    date,
    plan: day?.plan || emptyPlan(),
    updatedAt,
    library: hasLibrary ? library : STARTER_LIBRARY,
    contacts: contacts || [],   // deliberately empty until Susan adds her own
  });
};

export const config = { path: '/api/day' };
