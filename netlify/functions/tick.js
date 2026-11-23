// POST /api/tick   body: { date, id, done }
//
// Melody ticks a household job off on Liam's tablet. No PIN: the board has
// no login by design, and this can only do one narrow thing — mark a job
// that is already on that day's list as done or not done. It can't add,
// remove or change anything else, and it can't touch a future day.
//
// Ticks are never cleared automatically. If a job isn't finished, it stays
// open and carries forward to the next days (see get-day.js) until ticked.

import {
  readKey, writeKey, dayKey, localDate, addDays, isValidDate, json, useContext,
} from './_store.js';

const LOOKBACK = 14;   // days a tick may reach back

export default async (req, context) => {
  useContext(context);
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  let body;
  try { body = await req.json(); } catch { return json({ error: 'bad_json' }, 400); }
  const { date, id } = body || {};
  const done = body?.done === true;

  if (!isValidDate(date) || typeof id !== 'string' || !id) return json({ error: 'bad_request' }, 400);
  const today = localDate();
  if (date > today || date < addDays(today, -LOOKBACK)) return json({ error: 'out_of_range' }, 400);

  try {
    const day = await readKey(dayKey(date));
    const plan = day?.plan;
    if (!plan || !Array.isArray(plan.chores) || !plan.chores.includes(id)) {
      return json({ error: 'not_a_job_on_that_day' }, 404);
    }
    const current = Array.isArray(plan.done) ? plan.done : [];
    const next = done
      ? (current.includes(id) ? current : [...current, id])
      : current.filter((x) => x !== id);
    const updatedAt = new Date().toISOString();
    await writeKey(dayKey(date), { ...day, plan: { ...plan, done: next }, updatedAt });
    return json({ ok: true, date, id, done, updatedAt });
  } catch (err) {
    return json({ error: 'storage_write_failed', detail: String(err) }, 503);
  }
};

export const config = { path: '/api/tick' };
