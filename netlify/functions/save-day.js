// POST /api/day   header: x-pin: <4 digits>
// body: { date, plan, library?, contacts? }
//
// The only path that writes. The PIN is checked here, on the server, because
// this is the whole reason these functions exist: the storage credentials
// must never be sent to a browser. Melody's board is public, so anything the
// browser holds is effectively published.

import {
  readKey, writeKey, dayKey, KEY_LIBRARY, KEY_CONTACTS,
  sanitisePlan, isValidDate, json,
} from './_store.js';

const PIN = process.env.EDIT_PIN || '';

function pinOk(req) {
  const supplied = req.headers.get('x-pin') || '';
  if (!PIN) return false;            // no PIN configured = locked, not open
  if (supplied.length !== PIN.length) return false;
  // Constant-time-ish compare so the response time can't leak the PIN.
  let diff = 0;
  for (let i = 0; i < PIN.length; i += 1) {
    diff |= supplied.charCodeAt(i) ^ PIN.charCodeAt(i);
  }
  return diff === 0;
}

function sanitiseLibrary(input) {
  const out = { food: [], dinner: [], notes: [], chores: [] };
  if (!input || typeof input !== 'object') return out;
  for (const pool of Object.keys(out)) {
    const arr = input[pool];
    if (!Array.isArray(arr)) continue;
    out[pool] = arr
      .filter((it) => it && typeof it === 'object'
        && typeof it.id === 'string' && it.id
        && typeof it.en === 'string' && it.en.trim())
      .map((it) => ({
        id: it.id,
        en: it.en.trim().slice(0, 200),
        zh: typeof it.zh === 'string' ? it.zh.trim().slice(0, 200) : '',
      }));
  }
  return out;
}

function sanitiseContacts(input) {
  if (!Array.isArray(input)) return null;
  return input
    .filter((c) => c && typeof c === 'object' && typeof c.label === 'string')
    .map((c) => ({
      label: String(c.label).trim().slice(0, 60),
      phone: String(c.phone ?? '').trim().slice(0, 40),
    }))
    .slice(0, 12);
}

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  if (!pinOk(req)) return json({ error: 'bad_pin' }, 401);

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'bad_json' }, 400);
  }

  const { date } = body || {};
  if (!isValidDate(date)) return json({ error: 'bad_date' }, 400);

  // One timestamp for this write. The board compares against it to decide
  // whether anything changed.
  const updatedAt = new Date().toISOString();

  try {
    // Library first: if Susan typed a brand-new food, it must exist before
    // the plan that references it is stored.
    if (body.library) await writeKey(KEY_LIBRARY, sanitiseLibrary(body.library));

    const contacts = sanitiseContacts(body.contacts);
    if (contacts) await writeKey(KEY_CONTACTS, contacts);

    await writeKey(dayKey(date), {
      plan: sanitisePlan(body.plan),   // order preserved exactly, see _store.js
      updatedAt,
    });
  } catch (err) {
    return json({ error: 'storage_write_failed', detail: String(err) }, 503);
  }

  return json({ ok: true, date, updatedAt });
};

// Distinct path from get-day so routing is unambiguous.
export const config = { path: '/api/save' };
