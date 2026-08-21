// Storage adapter for Liam's Day.
//
// In production this talks to Netlify Blobs. When running outside Netlify
// (local dev, automated tests) it falls back to a JSON file on disk so the
// exact same function code can be exercised without a Netlify account.
//
// Nothing in here sorts, dedupes, or merges anything. See ORDERING below.

import { getStore } from '@netlify/blobs';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const STORE_NAME = 'liams-day';
const LOCAL_FILE = process.env.LIAMS_DAY_LOCAL_STORE
  || path.join(process.cwd(), '.local-store.json');

// Netlify sets these at runtime. Their absence means we're local.
const onNetlify = Boolean(process.env.NETLIFY || process.env.NETLIFY_BLOBS_CONTEXT);

/* ---------------------------------------------------------------- local */

async function localReadAll() {
  try {
    return JSON.parse(await fs.readFile(LOCAL_FILE, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return {};
    throw err;
  }
}

async function localWriteAll(all) {
  // Write to a temp file then rename, so a crash mid-write can't leave a
  // half-written plan on disk.
  const tmp = `${LOCAL_FILE}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(all, null, 2), 'utf8');
  await fs.rename(tmp, LOCAL_FILE);
}

/* --------------------------------------------------------------- public */

export async function readKey(key) {
  if (onNetlify) {
    const store = getStore(STORE_NAME);
    return await store.get(key, { type: 'json' });
  }
  const all = await localReadAll();
  return key in all ? all[key] : null;
}

export async function writeKey(key, value) {
  if (onNetlify) {
    const store = getStore(STORE_NAME);
    await store.setJSON(key, value);
    return;
  }
  const all = await localReadAll();
  all[key] = value;
  await localWriteAll(all);
}

/* ----------------------------------------------------------------- keys */

export const KEY_LIBRARY = 'library';
export const KEY_CONTACTS = 'contacts';
export const dayKey = (date) => `day:${date}`;

/* ------------------------------------------------------------- timezone */

// Susan is in Mountain Time. "Today" must be her local date, never UTC —
// a UTC date rolls over at 6pm Mountain, which is exactly when she plans.
export const TZ = 'America/Edmonton';

export function localDate(now = new Date()) {
  // en-CA formats as YYYY-MM-DD, which is what we store.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}

export function localHour(now = new Date()) {
  return Number(new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, hour: '2-digit', hour12: false,
  }).format(now));
}

export function addDays(date, n) {
  // date is 'YYYY-MM-DD'. Do the arithmetic at midday UTC so a DST shift
  // can never bump us onto the wrong calendar day.
  const [y, m, d] = date.split('-').map(Number);
  const t = Date.UTC(y, m - 1, d, 12, 0, 0);
  const next = new Date(t + n * 86400000);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(next);
}

/* --------------------------------------------------------------- shapes */

// The four meal slots plus the three list sections. amSnack and pmSnack are
// SEPARATE KEYS and no code path may ever combine them — merging the two
// snacks is one of the two failures that killed the device this replaces.
export const SLOTS = [
  'breakfast', 'amSnack', 'lunch', 'pmSnack', 'dinner', 'notes', 'chores',
];

export function emptyPlan() {
  const plan = {};
  for (const slot of SLOTS) plan[slot] = [];
  return plan;
}

/**
 * ORDERING: the array order IS the display order.
 *
 * This function copies arrays through verbatim. It does not sort, does not
 * dedupe, does not merge slots, does not reorder. It only drops values that
 * aren't strings, so malformed input can't poison a plan. If you are ever
 * tempted to add a .sort() or a Set here, don't — that is precisely the bug
 * that made the previous product unusable.
 */
export function sanitisePlan(input) {
  const plan = emptyPlan();
  if (!input || typeof input !== 'object') return plan;
  for (const slot of SLOTS) {
    const arr = input[slot];
    if (!Array.isArray(arr)) continue;
    plan[slot] = arr.filter((id) => typeof id === 'string' && id.length > 0);
  }
  return plan;
}

export function isValidDate(date) {
  return typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date);
}

/* ----------------------------------------------------------- responses */

export const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  },
});
