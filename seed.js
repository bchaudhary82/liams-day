// Loads the starter library, contacts and a sample day into whichever store
// is active. Local by default; pass a URL + PIN to seed a deployed site.
//
//   node seed.js                                  → local file store
//   node seed.js https://liams-day.netlify.app 4821  → the live site

import { promises as fs } from 'node:fs';
import { writeKey, KEY_LIBRARY, KEY_CONTACTS, dayKey, localDate } from './netlify/functions/_store.js';

const seed = JSON.parse(await fs.readFile(new URL('./seed.json', import.meta.url), 'utf8'));
const date = process.env.SEED_DATE || localDate();
const [target, pin] = process.argv.slice(2);

if (target) {
  const res = await fetch(`${target.replace(/\/$/, '')}/api/save`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-pin': pin || '' },
    body: JSON.stringify({ date, plan: seed.plan, library: seed.library, contacts: seed.contacts }),
  });
  console.log(res.ok ? `Seeded ${target} for ${date}` : `Failed: ${res.status} ${await res.text()}`);
  process.exit(res.ok ? 0 : 1);
}

await writeKey(KEY_LIBRARY, seed.library);
await writeKey(KEY_CONTACTS, seed.contacts);
await writeKey(dayKey(date), { plan: seed.plan, updatedAt: new Date().toISOString() });
console.log(`Seeded local store for ${date}`);
