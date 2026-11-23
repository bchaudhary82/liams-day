// POST /api/time-off   header: x-pin   body: { allowances, entries }
//
// Melody's time off, kept by Susan. Shown read-only on Liam's tablet.
// Days are counted in the planner (weekdays in the range, or a half day)
// and stored with each entry, so the tally never depends on a calendar
// calculation done twice in two places.

import { writeKey, KEY_TIME_OFF, isValidDate, json, useContext, pinOk } from './_store.js';

export const TYPES = ['vacation', 'sick', 'stat', 'unpaid', 'other'];

export function sanitiseTimeOff(body) {
  const a = body?.allowances || {};
  const num = (v, d) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Math.min(Number(v), 365) : d);
  const allowances = { vacation: num(a.vacation, 10), sick: num(a.sick, 5) };
  const entries = (Array.isArray(body?.entries) ? body.entries : [])
    .filter((e) => e && isValidDate(e.start) && TYPES.includes(e.type))
    .map((e) => {
      const end = isValidDate(e.end) && e.end >= e.start ? e.end : e.start;
      const days = Math.round(num(e.days, 1) * 2) / 2;   // whole or half days
      return {
        id: typeof e.id === 'string' && e.id ? e.id.slice(0, 40) : `t${Date.now().toString(36)}`,
        start: e.start, end, type: e.type, days,
        note: typeof e.note === 'string' ? e.note.trim().slice(0, 120) : '',
      };
    })
    .slice(0, 400);
  return { allowances, entries };
}

export default async (req, context) => {
  useContext(context);
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  if (!pinOk(req)) return json({ error: 'bad_pin' }, 401);
  let body;
  try { body = await req.json(); } catch { return json({ error: 'bad_json' }, 400); }
  const updatedAt = new Date().toISOString();
  try {
    await writeKey(KEY_TIME_OFF, { ...sanitiseTimeOff(body), updatedAt });
  } catch (err) {
    return json({ error: 'storage_write_failed', detail: String(err) }, 503);
  }
  return json({ ok: true, updatedAt });
};

export const config = { path: '/api/time-off' };
