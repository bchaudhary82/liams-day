// Checkpoint 1 tests — storage, the two functions, and the guarantees that
// matter most: ordering never drifts, the two snacks never merge, and a
// write from one client is visible to another.
//
// Run: npm test

import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { localDate, addDays, TZ, useContext, storeName } from '../netlify/functions/_store.js';

const PORT = 8899;
const BASE = `http://127.0.0.1:${PORT}`;
const PIN = '4821';

let passed = 0; let failed = 0;
const results = [];

function check(name, ok, detail = '') {
  if (ok) { passed += 1; results.push(`  PASS  ${name}`); }
  else { failed += 1; results.push(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
}

const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

async function waitForServer(tries = 60) {
  for (let i = 0; i < tries; i += 1) {
    try {
      const r = await fetch(`${BASE}/api/day`);
      if (r.ok) return true;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
}

const get = (qs = '') => fetch(`${BASE}/api/day${qs}`).then(async (r) => ({
  status: r.status, body: await r.json(),
}));

const save = (payload, pin = PIN) => fetch(`${BASE}/api/save`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-pin': pin },
  body: JSON.stringify(payload),
}).then(async (r) => ({ status: r.status, body: await r.json() }));

/* ---------------------------------------------------------------- setup */

const storeFile = path.join(os.tmpdir(), `liams-day-test-${Date.now()}.json`);

const server = spawn(process.execPath, ['dev-server.js'], {
  env: {
    ...process.env,
    PORT: String(PORT),
    EDIT_PIN: PIN,
    LIAMS_DAY_LOCAL_STORE: storeFile,
  },
  stdio: ['ignore', 'ignore', 'inherit'],
});

const cleanup = async () => {
  server.kill();
  await fs.rm(storeFile, { force: true });
  await fs.rm(`${storeFile}.tmp`, { force: true });
};

if (!await waitForServer()) {
  console.error('Dev server never came up.');
  await cleanup();
  process.exit(1);
}

/* ----------------------------------------------------------- 1. the day */

const DATE = '2026-08-20';

// A deliberately non-alphabetical order. If anything sorts, this catches it.
const BREAKFAST = ['f-yogurt', 'f-banana', 'f-toast', 'f-cheese',
  'f-apple', 'f-egg', 'f-milk', 'f-oats'];

const planA = {
  breakfast: [...BREAKFAST],
  amSnack: ['f-apple'],
  lunch: ['f-pasta', 'f-peas'],
  pmSnack: ['f-cheese', 'f-cracker'],
  dinner: ['d-curry'],
  notes: ['n-diaper', 'n-fluids', 'n-vitd'],
  chores: ['c-laundry', 'c-vacuum'],
};

const library = {
  food: [...new Set([...BREAKFAST, 'f-pasta', 'f-peas', 'f-cracker'])]
    .map((id) => ({ id, en: id.replace('f-', ''), zh: '' })),
  dinner: [{ id: 'd-curry', en: 'Curry', zh: '咖喱' }],
  notes: [{ id: 'n-diaper', en: 'Change diaper every 2 hours', zh: '' },
    { id: 'n-fluids', en: 'Constant fluids', zh: '' },
    { id: 'n-vitd', en: 'Vitamin D drops in the morning', zh: '' }],
  chores: [{ id: 'c-laundry', en: "Liam's laundry", zh: '' },
    { id: 'c-vacuum', en: 'Vacuum upstairs', zh: '' }],
};

const contacts = [
  { label: 'Mum', phone: '555-0100' },
  { label: 'Dad', phone: '555-0101' },
];

const w1 = await save({ date: DATE, plan: planA, library, contacts });
check('save accepts a valid write with the right PIN', w1.status === 200, `got ${w1.status}`);
check('save returns an updatedAt stamp', Boolean(w1.body.updatedAt));

/* ------------------------------------------------- 2. cross-client read */
// This is the whole point: client A wrote, client B (a separate fetch, no
// shared memory) must see it. Sync failure is what killed the last product.

const r1 = await get(`?date=${DATE}`);
check('a second client reads back the plan', r1.status === 200);
check('breakfast order is byte-identical to what was written',
  eq(r1.body.plan.breakfast, BREAKFAST),
  `got ${JSON.stringify(r1.body.plan.breakfast)}`);
check('library came back with the plan', r1.body.library.food.length === 11,
  `got ${r1.body.library?.food?.length}`);
check('contacts came back with the plan', eq(r1.body.contacts, contacts));

/* --------------------------------------------------- 3. poll semantics */

const p1 = await get(`?date=${DATE}&since=${encodeURIComponent(r1.body.updatedAt)}`);
check('poll with a current stamp reports unchanged', p1.body.unchanged === true);

await new Promise((r) => setTimeout(r, 5));
const planB = { ...planA, lunch: ['f-pasta', 'f-peas', 'f-carrot'] };
const w2 = await save({ date: DATE, plan: planB, library });
const p2 = await get(`?date=${DATE}&since=${encodeURIComponent(r1.body.updatedAt)}`);
check('poll with a stale stamp returns the new plan',
  p2.body.unchanged !== true && eq(p2.body.plan.lunch, planB.lunch));
check('updatedAt advanced after the second write',
  w2.body.updatedAt !== w1.body.updatedAt);

/* -------------------------------------------------------- 4. the PIN */

const bad = await save({ date: DATE, plan: { breakfast: ['HACKED'] } }, '0000');
check('wrong PIN is rejected', bad.status === 401, `got ${bad.status}`);
const afterBad = await get(`?date=${DATE}`);
check('rejected write left the stored plan untouched',
  eq(afterBad.body.plan.breakfast, BREAKFAST));
const noPin = await save({ date: DATE, plan: { breakfast: ['HACKED'] } }, '');
check('empty PIN is rejected', noPin.status === 401);

/* ------------------------------------- 5. ordering integrity, 25 reads */
// Acceptance test #1 from the spec.

let drift = 0;
for (let i = 0; i < 25; i += 1) {
  const r = await get(`?date=${DATE}`);
  if (!eq(r.body.plan.breakfast, BREAKFAST)) drift += 1;
}
check('25 consecutive reads show zero ordering drift', drift === 0, `${drift} drifted`);

/* ------------------------------------------- 6. the two snacks stay apart */
// Acceptance test #2. This is the failure that made Susan return the device.

const snackDate = '2026-08-21';
await save({
  date: snackDate,
  plan: { ...planA, amSnack: ['f-apple', 'f-yogurt'], pmSnack: [] },
  library,
});
const s1 = await get(`?date=${snackDate}`);
check('adding to AM snack leaves PM snack empty',
  eq(s1.body.plan.amSnack, ['f-apple', 'f-yogurt']) && eq(s1.body.plan.pmSnack, []));

await save({
  date: snackDate,
  plan: { ...planA, amSnack: ['f-apple', 'f-yogurt'], pmSnack: ['f-cheese'] },
  library,
});
const s2 = await get(`?date=${snackDate}`);
check('adding to PM snack leaves AM snack exactly as it was',
  eq(s2.body.plan.amSnack, ['f-apple', 'f-yogurt']) && eq(s2.body.plan.pmSnack, ['f-cheese']));
check('the two snacks are separate keys, never merged',
  s2.body.plan.amSnack.length === 2 && s2.body.plan.pmSnack.length === 1);

/* --------------------------------------------- 7. duplicates are allowed */
// Susan may legitimately want the same food in breakfast and lunch. A
// dedupe would silently eat it.

const dupDate = '2026-08-22';
await save({ date: dupDate, plan: { ...planA, lunch: ['f-apple', 'f-apple'] }, library });
const dup = await get(`?date=${dupDate}`);
check('a repeated item is preserved, not deduped', eq(dup.body.plan.lunch, ['f-apple', 'f-apple']));

/* ---------------------------------------------------------- 8. bad input */

const badDate = await save({ date: 'tomorrow', plan: planA });
check('a malformed date is rejected', badDate.status === 400);
const junk = await save({ date: '2026-08-23', plan: { breakfast: [1, null, 'f-ok', {}] }, library });
check('non-string items are dropped, valid ones kept', junk.status === 200);
const junkRead = await get('?date=2026-08-23');
check('only the valid item survived', eq(junkRead.body.plan.breakfast, ['f-ok']));

/* ------------------------------------------------------- 9. empty day */

const empty = await get('?date=2026-12-25');
check('an unplanned date returns an empty plan, not an error', empty.status === 200
  && eq(empty.body.plan.breakfast, []) && empty.body.dayUpdatedAt === null);

/* -------------------------------------------------------- 10. timezone */

check('timezone is Mountain', TZ === 'America/Edmonton');
check('localDate returns YYYY-MM-DD', /^\d{4}-\d{2}-\d{2}$/.test(localDate()));

// 03:00 UTC on Aug 20 is still Aug 19 in Mountain. A UTC-based date would
// say the 20th and show Melody the wrong day.
check('a late-evening Mountain moment resolves to the correct local date',
  localDate(new Date('2026-08-20T03:00:00Z')) === '2026-08-19',
  `got ${localDate(new Date('2026-08-20T03:00:00Z'))}`);

// Across the November DST change, "tomorrow" must still be one calendar day.
check('addDays crosses the DST boundary correctly',
  addDays('2026-11-01', 1) === '2026-11-02' && addDays('2026-03-07', 1) === '2026-03-08',
  `got ${addDays('2026-11-01', 1)} / ${addDays('2026-03-07', 1)}`);
check('addDays rolls over month ends', addDays('2026-08-31', 1) === '2026-09-01');


/* ------------------------------------------- 11. PIN check writes nothing */
// Regression: an earlier version proved the PIN by writing the day back to
// itself, stamping an empty plan with a fresh timestamp. That made a real
// save look like a failure on the board.

const vDate = '2026-09-09';
await save({ date: vDate, plan: { ...planA, breakfast: ['f-yogurt'] }, library });
const beforeVerify = await get(`?date=${vDate}`);

const v = await fetch(`${BASE}/api/save`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-pin': PIN },
  body: JSON.stringify({ verify: true }),
}).then(async (r) => ({ status: r.status, body: await r.json() }));
check('a verify call with the right PIN succeeds', v.status === 200 && v.body.verified === true);

const badV = await fetch(`${BASE}/api/save`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-pin': '9999' },
  body: JSON.stringify({ verify: true }),
});
check('a verify call with the wrong PIN is refused', badV.status === 401);

const afterVerify = await get(`?date=${vDate}`);
check('verifying the PIN does not touch the stored plan',
  eq(afterVerify.body.plan, beforeVerify.body.plan));
check('verifying the PIN does not bump the timestamp',
  afterVerify.body.updatedAt === beforeVerify.body.updatedAt,
  `${beforeVerify.body.updatedAt} -> ${afterVerify.body.updatedAt}`);

/* ------------------------------------------------ 12. standing notes (v2) */
// v1 kept notes inside each day, so they vanished overnight and on every
// day Susan didn't plan (weekends). v2 keeps them until she removes them.

const NOTE_DAY = '2026-11-16';     // a Monday
const OTHER_DAY = '2026-11-18';    // never planned

const un = await get(`?date=${OTHER_DAY}`);
check('an unplanned day still shows the standing notes',
  eq(un.body.plan.notes, planA.notes), JSON.stringify(un.body.plan.notes));

const v2save = await save({
  date: NOTE_DAY,
  plan: { ...planA, notes: ['n-fluids'] },            // one-off, this day only
  standingNotes: ['n-vitd', 'n-diaper'],              // every day, in this order
  library,
});
check('a v2 save with separate standing notes is accepted', v2save.status === 200);

const nd = await get(`?date=${NOTE_DAY}`);
check('the planned day shows standing notes first, then its one-off note, in order',
  eq(nd.body.plan.notes, ['n-vitd', 'n-diaper', 'n-fluids']), JSON.stringify(nd.body.plan.notes));
check('standing and one-off notes come back separately for the planner',
  eq(nd.body.standingNotes, ['n-vitd', 'n-diaper']) && eq(nd.body.dayNotes, ['n-fluids']));

const od = await get(`?date=${OTHER_DAY}`);
check('another day shows only the standing notes',
  eq(od.body.plan.notes, ['n-vitd', 'n-diaper']), JSON.stringify(od.body.plan.notes));

// A board left open on OTHER_DAY must notice a standing-note change.
const stampBefore = od.body.updatedAt;
await new Promise((r) => setTimeout(r, 5));
await save({ date: NOTE_DAY, plan: { ...planA, notes: [] }, standingNotes: ['n-vitd'], library });
const poll = await get(`?date=${OTHER_DAY}&since=${encodeURIComponent(stampBefore)}`);
check('a board polling any day picks up a standing-note change',
  poll.body.unchanged !== true && eq(poll.body.plan.notes, ['n-vitd']));

// An OLD planner (v1 code, page left open from before the update) sends one
// combined notes list and no standingNotes. It must not wipe or double them.
await save({ date: NOTE_DAY, plan: { ...planA, notes: ['n-vitd', 'n-fluids'] }, library });
const afterOld = await get(`?date=${OTHER_DAY}`);
check('a save from an old planner copy becomes the standing notes',
  eq(afterOld.body.plan.notes, ['n-vitd', 'n-fluids']), JSON.stringify(afterOld.body.plan.notes));
const afterOldDay = await get(`?date=${NOTE_DAY}`);
check('an old-planner save does not show notes twice',
  eq(afterOldDay.body.plan.notes, ['n-vitd', 'n-fluids']), JSON.stringify(afterOldDay.body.plan.notes));
check('meals are untouched by the notes change',
  eq(afterOldDay.body.plan.breakfast, BREAKFAST));

/* -------------------------------------------- 13. copy last plan (v2) */
// v1 "same as yesterday" copied literally yesterday — Sunday, on a Monday.

await save({ date: '2026-10-02', plan: { ...planA, lunch: ['f-peas'] }, standingNotes: ['n-vitd'], library });
const lb = await get('?latestBefore=2026-10-05');
check('copy-last-plan skips an empty weekend and finds Friday',
  lb.body.date === '2026-10-02' && eq(lb.body.plan.lunch, ['f-peas']), lb.body.date);
const none = await get('?latestBefore=2025-01-01');
check('copy-last-plan reports nothing found instead of erroring', none.body.date === null);

const sum = await get('?summary=1&from=2026-10-01&days=5');
check('the week summary lists each day in order',
  eq(sum.body.days.map((d) => d.date),
    ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05']));
check('the week summary marks which days have a plan',
  sum.body.days[1].items > 0 && sum.body.days[2].items === 0);

/* ------------------------------------------ 14. preview storage isolation */
useContext({ deploy: { context: 'deploy-preview' } });
check('a preview deploy uses its own separate store', storeName() === 'liams-day-preview');
useContext({ deploy: { context: 'branch-deploy' } });
check('a branch deploy uses its own separate store', storeName() === 'liams-day-preview');
useContext({ deploy: { context: 'production' } });
check('production keeps the original store name', storeName() === 'liams-day');
useContext(null);
check('an unknown context falls back to the original store', storeName() === 'liams-day');

/* --------------------------------------- 15. migration from v1 notes */
// The live site has notes stored inside each day and no standing list yet.
// Straight after the update, today's board and every unplanned day must
// still show the notes Susan already set up.
{
  const PORT2 = 8898;
  const legacyFile = path.join(os.tmpdir(), `liams-day-legacy-${Date.now()}.json`);
  const legacyDay = addDays(localDate(), -3);
  await fs.writeFile(legacyFile, JSON.stringify({
    library,
    [`day:${legacyDay}`]: {
      plan: { ...planA, notes: ['n-diaper', 'n-vitd'] },
      updatedAt: '2026-11-10T14:00:00.000Z',
    },
  }));
  const s2 = spawn(process.execPath, ['dev-server.js'], {
    env: { ...process.env, PORT: String(PORT2), EDIT_PIN: PIN, LIAMS_DAY_LOCAL_STORE: legacyFile },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  let up = false;
  for (let i = 0; i < 60 && !up; i += 1) {
    try { up = (await fetch(`http://127.0.0.1:${PORT2}/api/day`)).ok; } catch { /* wait */ }
    if (!up) await new Promise((r) => setTimeout(r, 100));
  }
  const t = await fetch(`http://127.0.0.1:${PORT2}/api/day?date=${localDate()}`).then((r) => r.json());
  check("after the update, today shows the notes from Susan's last planned day",
    eq(t.plan.notes, ['n-diaper', 'n-vitd']) && t.notesSource === 'migrated',
    JSON.stringify(t.plan.notes));
  const l = await fetch(`http://127.0.0.1:${PORT2}/api/day?date=${legacyDay}`).then((r) => r.json());
  check('an old saved day does not show its notes twice',
    eq(l.plan.notes, ['n-diaper', 'n-vitd']), JSON.stringify(l.plan.notes));
  check('an old saved day keeps its meals exactly', eq(l.plan.breakfast, BREAKFAST));
  s2.kill();
  await fs.rm(legacyFile, { force: true });
}

/* ------------------------------------------------------------- report */

await cleanup();
console.log(`\n  Checkpoint 1 — storage and functions\n`);
console.log(results.join('\n'));
console.log(`\n  ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
