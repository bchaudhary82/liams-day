// v2 tests — the wrong-day saves found in the live data, replayed with a
// fake clock, plus standing notes and the week strip.
//
// Real cases this guards against (from the Nov 10 log check):
//   Mon Sep 7 10:04pm  — Tuesday's plan saved onto Monday
//   Mon Oct 26 12:15am — Monday's plan saved onto Tuesday (after midnight)
//   Mon Nov 9 11:05pm  — planner left open since daytime, saved onto Monday

import { chromium } from 'playwright';

const BASE = `http://127.0.0.1:${process.env.PORT || 8890}`;
const PIN = process.env.EDIT_PIN || '4821';
const EXE = '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome';

let passed = 0; let failed = 0; const out = [];
const check = (n, ok, d = '') => {
  if (ok) { passed += 1; out.push(`  PASS  ${n}`); }
  else { failed += 1; out.push(`  FAIL  ${n}${d ? ` — ${d}` : ''}`); }
};

const browser = await chromium.launch({ executablePath: EXE });
const day = (d) => fetch(`${BASE}/api/day?date=${d}`).then((r) => r.json());

/** A phone-sized planner, unlocked, with the clock set to `at` (UTC ISO). */
async function plannerAt(at) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.clock.install({ time: new Date(at) });
  await ctx.addInitScript((p) => localStorage.setItem('liams-day-pin', p), PIN);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/edit.html`, { waitUntil: 'load' });
  await page.waitForSelector('#app section', { timeout: 8000 });
  await page.waitForFunction(() => document.querySelectorAll('#daypick button').length > 0);
  return { ctx, page };
}

async function addFood(page, section, name) {
  const sec = page.locator('#app section').filter({ has: page.locator('h2', { hasText: section }) }).first();
  await sec.locator('.add').click();
  await page.fill('#newitem', name);
  await page.click('.newrow button');
  await page.click('.close');
}

const foods = (body, key = 'breakfast') => body.plan[key]
  .map((id) => body.library.food.find((f) => f.id === id)?.en);

/* ---------------------------------------- 1. evening save onto "today" */
// Monday Nov 9, 10:30pm Mountain (MST, UTC-7).
{
  const { ctx, page } = await plannerAt('2026-11-10T05:30:00Z');
  check('at 10:30pm the planner opens on tomorrow, by name',
    (await page.textContent('#head')).trim() === "Tuesday's plan",
    await page.textContent('#head'));

  const chips = await page.$$eval('#daypick button', (b) => b.map((x) => x.textContent.replace(/\s+/g, ' ').trim()));
  check('the week strip shows today plus seven days', chips.length === 8, String(chips.length));
  check('each day is labelled with its real weekday and date',
    chips[0].includes('Today') && chips[0].includes('Mon') && chips[0].includes('9')
    && chips[1].includes('Tomorrow') && chips[1].includes('Tue') && chips[1].includes('10'),
    chips.slice(0, 2).join(' / '));
  check('the save button names the day',
    (await page.textContent('#savebtn')).trim() === "Save Tuesday's plan");

  // Recreate Sep 7 / Nov 9: she ends up on Monday and builds Tuesday's plan.
  await page.click('#daypick button[data-date="2026-11-09"]');
  await page.waitForFunction(() => date === '2026-11-09');
  check('choosing today in the evening shows a warning line',
    await page.isVisible('#warnline') && (await page.textContent('#warnline')).includes('Tuesday'));
  await addFood(page, 'Breakfast', 'Evening test porridge');
  await page.click('#savebtn');
  await page.waitForSelector('#ask.on', { timeout: 3000 });
  check('saving to today in the evening asks first',
    (await page.textContent('#ask-yes')).includes('Save to Tuesday instead'));
  await page.click('#ask-yes');
  await page.waitForSelector('#toast.on', { timeout: 5000 });
  check('the confirmation names the day it went to',
    (await page.textContent('#toast-msg')).startsWith('Saved Tuesday'),
    await page.textContent('#toast-msg'));
  const tue = await day('2026-11-10'); const mon = await day('2026-11-09');
  check('the plan landed on Tuesday', foods(tue).includes('Evening test porridge'));
  check('Monday was not touched', !foods(mon).includes('Evening test porridge'));
  check('the header follows the switch to Tuesday',
    (await page.textContent('#head')).trim() === "Tuesday's plan");
  await page.waitForTimeout(300);
  check('the saved day gets a dot in the week strip',
    await page.isVisible('#daypick button[data-date="2026-11-10"] .dot.on'));

  // Saying "no, really today" is respected and not asked twice.
  await page.click('#daypick button[data-date="2026-11-09"]');
  await page.waitForFunction(() => date === '2026-11-09');
  await addFood(page, 'Lunch', 'Deliberate Monday edit');
  await page.click('#savebtn');
  await page.waitForSelector('#ask.on');
  await page.click('#ask-no');
  await page.waitForSelector('#toast.on');
  check('"No, save to Monday" saves to Monday',
    foods(await day('2026-11-09'), 'lunch').includes('Deliberate Monday edit'));
  await page.waitForTimeout(4500);
  await page.click('#savebtn');
  await page.waitForTimeout(400);
  check('once confirmed, the same day is not questioned again', !(await page.isVisible('#ask.on')));
  await ctx.close();
}

/* -------------------------------------------- 2. just after midnight */
// Monday Oct 26, 12:15am Mountain (MDT, UTC-6). In Susan's head it's
// still Sunday night and she's planning "tomorrow" = Monday.
{
  const { ctx, page } = await plannerAt('2026-10-26T06:15:00Z');
  check('after midnight the planner opens on the day that has just started',
    (await page.textContent('#head')).trim() === "Monday's plan");
  const chips = await page.$$eval('#daypick button', (b) => b.map((x) => x.textContent.replace(/\s+/g, ' ').trim()));
  check('after midnight the word "Tomorrow" is not shown (it would mean Tuesday)',
    !chips[1].includes('Tomorrow') && chips[1].includes('Tue'), chips[1]);

  await page.click('#daypick button[data-date="2026-10-27"]');
  await page.waitForFunction(() => date === '2026-10-27');
  await addFood(page, 'Breakfast', 'Midnight test toast');
  await page.click('#savebtn');
  await page.waitForSelector('#ask.on', { timeout: 3000 });
  check('saving to Tuesday just after midnight asks first',
    (await page.textContent('#ask-yes')).includes('Save to Monday instead'));
  await page.click('#ask-yes');
  await page.waitForSelector('#toast.on');
  check('the plan landed on Monday, not Tuesday',
    foods(await day('2026-10-26')).includes('Midnight test toast')
    && !foods(await day('2026-10-27')).includes('Midnight test toast'));
  await ctx.close();
}

/* ------------------------------- 3. planner left open since the daytime */
// Opened Monday Nov 16 at 1pm, picked up again at 10pm.
{
  const { ctx, page } = await plannerAt('2026-11-16T20:00:00Z');
  check('at 1pm the planner opens on today',
    (await page.textContent('#head')).trim() === "Monday's plan");
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await ctx.clock.setSystemTime(new Date('2026-11-17T05:00:00Z'));
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForFunction(() => date === '2026-11-17', null, { timeout: 5000 }).catch(() => {});
  check('coming back at 10pm, the planner moves itself to tomorrow',
    (await page.textContent('#head')).trim() === "Tuesday's plan",
    await page.textContent('#head'));
  await ctx.close();
}

/* ------------------------------ 4. unsaved work is never silently lost */
{
  const { ctx, page } = await plannerAt('2026-11-17T20:00:00Z');   // Tue 1pm
  await addFood(page, 'Breakfast', 'Built on the wrong chip');
  await page.click('#daypick button[data-date="2026-11-18"]');
  await page.waitForSelector('#ask.on');
  check('switching day with unsaved changes asks what to do',
    (await page.textContent('#ask-yes')).includes('Move these changes to Wednesday'));
  await page.click('#ask-yes');
  await page.waitForFunction(() => date === '2026-11-18');
  const rows = await page.locator('#app section').first().locator('li .txt')
    .evaluateAll((e) => e.map((x) => x.firstChild.textContent.trim()));
  check('"move these changes" carries the plan to the new day',
    rows.includes('Built on the wrong chip'), rows.join('|'));
  await ctx.close();
}

/* --------------------------------------------------- 5. standing notes */
{
  const { ctx, page } = await plannerAt('2026-11-20T18:00:00Z');   // Fri 11am
  const sec = (t) => page.locator('#app section').filter({ has: page.locator('h2', { hasText: t }) }).first();
  check('standing notes are labelled as every day',
    (await sec('Notes for Melody').locator('.every').textContent()).includes('Every day'));
  check('one-off notes are labelled with their day',
    (await sec('Note just for this day').locator('.every').textContent()).includes('Friday'));

  await sec('Notes for Melody').locator('.add').click();
  await page.fill('#newitem', 'Sunscreen before the park');
  await page.click('.newrow button');
  await page.click('.close');
  await sec('Note just for this day').locator('.add').click();
  await page.fill('#newitem', 'Grandma visits at 3');
  await page.click('.newrow button');
  await page.click('.close');
  await page.click('#savebtn');
  await page.waitForSelector('#toast.on');

  // The Monday after the weekend — never planned.
  const mon = await day('2026-11-23');
  const notes = mon.plan.notes.map((id) => mon.library.notes.find((n) => n.id === id)?.en);
  check('a standing note shows on the Monday after the weekend, unplanned',
    notes.includes('Sunscreen before the park'), notes.join('|'));
  check("Friday's one-off note does not carry over to Monday",
    !notes.includes('Grandma visits at 3'));

  const fri = await day('2026-11-20');
  const fn = fri.plan.notes.map((id) => fri.library.notes.find((n) => n.id === id)?.en);
  check('Friday shows both its standing and its one-off note',
    fn.includes('Sunscreen before the park') && fn.includes('Grandma visits at 3'));

  // The board, opened on that Monday, shows the note with no planning at all.
  const bctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await bctx.clock.install({ time: new Date('2026-11-23T15:00:00Z') });
  const board = await bctx.newPage();
  await board.goto(BASE, { waitUntil: 'networkidle' });
  check("Liam's tablet shows the standing note on an unplanned Monday",
    (await board.textContent('#board')).includes('Sunscreen before the park'));
  await bctx.close();
  await ctx.close();
}

await browser.close();
console.log('\n  v2 — wrong-day saves, standing notes, week strip\n');
console.log(out.join('\n'));
console.log(`\n  ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
