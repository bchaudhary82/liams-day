// v2 Round B — Susan's answers of Nov 23:
//   pick lists A–Z, edit/delete items, no duplicates, Liam's dinner,
//   nap times typed daily, Melody ticks household jobs (ticks persist,
//   unfinished jobs carry over), time off with allowances, Melody sees it.

import { chromium } from 'playwright';

const BASE = `http://127.0.0.1:${process.env.PORT || 8890}`;
const PIN = process.env.EDIT_PIN || '4821';
const EXE = '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome';

let passed = 0; let failed = 0; const out = [];
const check = (n, ok, d = '') => {
  if (ok) { passed += 1; out.push(`  PASS  ${n}`); }
  else { failed += 1; out.push(`  FAIL  ${n}${d ? ` — ${d}` : ''}`); }
};

const api = (qs) => fetch(`${BASE}/api/day${qs}`).then((r) => r.json());
const post = (url, body) => fetch(`${BASE}${url}`, {
  method: 'POST', headers: { 'content-type': 'application/json', 'x-pin': PIN },
  body: JSON.stringify(body),
}).then((r) => r.json());
const tz = (d = new Date()) => new Intl.DateTimeFormat('en-CA',
  { timeZone: 'America/Edmonton', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const plus = (iso, n) => { const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12) + n * 86400000).toISOString().slice(0, 10); };
const empty = { breakfast: [], amSnack: [], lunch: [], pmSnack: [], liamDinner: [], dinner: [], notes: [], chores: [], naps: [] };

const TODAY = tz();
const YDAY = plus(TODAY, -1);

/* ---- set up: a library with accidental duplicates, like Susan's real one */
const base = await api(`?date=${TODAY}`);
const library = base.library;
library.food.push({ id: 'fz1', en: 'Zucchini fritters', zh: '' });
library.food.push({ id: 'fdup1', en: 'Cheerios', zh: '' });
library.food.push({ id: 'fdup2', en: 'cheerios ', zh: '' });
library.chores.push({ id: 'cy1', en: 'Water the plants', zh: '' });
library.chores.push({ id: 'cy2', en: 'Sort the mail', zh: '' });
await post('/api/save', { date: YDAY, plan: { ...empty, chores: ['cy1', 'cy2'] }, standingNotes: [], library });
await post('/api/save', { date: TODAY, plan: { ...empty, breakfast: ['fdup1'], chores: ['c01', 'c03'] }, standingNotes: [], library });

const browser = await chromium.launch({ executablePath: EXE });

/* ================================================================ PLANNER */
const pctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
await pctx.addInitScript((p) => localStorage.setItem('liams-day-pin', p), PIN);
const page = await pctx.newPage();
await page.goto(`${BASE}/edit.html`, { waitUntil: 'load' });
await page.waitForSelector('#app section');
if (await page.evaluate(() => date) !== (await page.evaluate(() => todayLocal()))) {
  await page.click(`#daypick button[data-date="${TODAY}"]`);
  await page.waitForFunction((t) => date === t, TODAY);
}
const sec = (t) => page.locator('#app section').filter({ has: page.locator('h2', { hasText: t }) }).first();
const poolNames = () => page.$$eval('#pool .prow > button:first-child .txt',
  (els) => els.map((e) => e.firstChild.textContent.trim()));

check("Liam's dinner has its own section", await sec("Liam's dinner").count() === 1);
check('there is a Naps section', await sec('Naps').count() === 1);

await sec('Breakfast').locator('.add').click();
let names = await poolNames();
const sorted = [...names].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
check('the pick list is A to Z', JSON.stringify(names) === JSON.stringify(sorted), names.slice(0, 6).join('|'));
check('a duplicate item shows once', names.filter((n) => n.toLowerCase() === 'cheerios').length === 1,
  names.filter((n) => n.toLowerCase().startsWith('chee')).join('|'));
check('a duplicate already in the plan shows as picked',
  (await page.locator('#pool .prow').filter({ hasText: 'Cheerios' }).first()
    .locator('button').first().getAttribute('aria-pressed')) === 'true');

await page.fill('#newitem', 'zucch');
names = await poolNames();
check('typing in the box searches the list', names.length === 1 && names[0] === 'Zucchini fritters', names.join('|'));
await page.fill('#newitem', '');
await page.evaluate(() => renderPool());

// Plan order is still tap order, even though the list is A–Z.
await page.locator('#pool .prow').filter({ hasText: 'Zucchini fritters' }).locator('button').first().click();
await page.locator('#pool .prow').filter({ hasText: 'Apple slices' }).locator('button').first().click();
await page.click('#sheet .close');
const bf = await sec('Breakfast').locator('li .txt').evaluateAll((e) => e.map((x) => x.firstChild.textContent.trim()));
check('the plan keeps tap order, not A to Z',
  JSON.stringify(bf) === JSON.stringify(['Cheerios', 'Zucchini fritters', 'Apple slices']), bf.join('|'));

// Adding something already in the list reuses it.
await sec('Lunch').locator('.add').click();
await page.fill('#newitem', 'zucchini FRITTERS');
await page.click('.newrow button');
const foodCount = await page.evaluate(() => library.food.filter((f) => f.en.toLowerCase() === 'zucchini fritters').length);
check('typing an item that already exists does not create a second copy', foodCount === 1, String(foodCount));
await page.click('#sheet .close');

// Edit an item.
await sec('Breakfast').locator('.add').click();
await page.locator('#pool .prow').filter({ hasText: 'Zucchini fritters' }).locator('.ed').click();
await page.fill('#editbox', 'Zucchini fritters - heat 10 seconds');
await page.click('.pedit .sv');
names = await poolNames();
check('an item can be edited', names.includes('Zucchini fritters - heat 10 seconds'));
// Delete an item.
await page.locator('#pool .prow').filter({ hasText: 'Cheerios' }).locator('.ed').click();
await page.click('.pedit .dl');
await page.waitForSelector('#ask.on');
await page.click('#ask-yes');
names = await poolNames();
check('a deleted item leaves the pick list', !names.some((n) => n.toLowerCase() === 'cheerios'));
await page.click('#sheet .close');
const stillInPlan = await sec('Breakfast').locator('li .txt').evaluateAll((e) => e.map((x) => x.firstChild.textContent.trim()));
check("a deleted item still shows on a day that already has it", stillInPlan.includes('Cheerios'));

// Naps and Liam's dinner.
await sec('Naps').locator('.add').click();
const napIns = sec('Naps').locator('input[type="time"]');
await napIns.nth(0).fill('12:30');
await napIns.nth(1).fill('14:15');
await sec("Liam's dinner").locator('.add').click();
await page.locator('#pool .prow').filter({ hasText: 'Pasta' }).first().locator('button').first().click();
await page.click('#sheet .close');
await page.click('#savebtn');
await page.waitForSelector('#toast.on');
await page.waitForTimeout(300);
let today = await api(`?date=${TODAY}`);
check('nap times are saved', JSON.stringify(today.plan.naps) === JSON.stringify([{ start: '12:30', end: '14:15' }]),
  JSON.stringify(today.plan.naps));
check("Liam's dinner is saved", today.plan.liamDinner.length === 1);
check('edits and deletes are saved to the list',
  today.library.food.some((f) => f.en === 'Zucchini fritters - heat 10 seconds')
  && today.library.food.filter((f) => /^cheerios$/i.test(f.en.trim())).every((f) => f.hidden));

// Copy last plan skips the naps (times change daily).
const later = plus(TODAY, 3);
await page.click(`#daypick button[data-date="${later}"]`);
await page.waitForFunction((t) => date === t, later);
await page.click('#copybtn');
await page.waitForTimeout(400);
check('"copy last plan" does not copy nap times', await sec('Naps').locator('.nap').count() === 0);
check("\"copy last plan\" does copy Liam's dinner", await sec("Liam's dinner").locator('li').count() === 1);
await page.evaluate(() => { dirty = false; });

/* =================================================================== BOARD */
const bctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const board = await bctx.newPage();
await board.goto(BASE, { waitUntil: 'networkidle' });
const liamText = await board.textContent('#board');
check("the board shows Liam's dinner", liamText.includes("Liam's dinner"));
check('the board shows the nap times', liamText.includes('Naps') && liamText.includes('12:30'), liamText.slice(0, 200));

const todoLabel = await board.textContent('#tab-todo');
check('"Also to do" counts open jobs, including unfinished ones from yesterday',
  todoLabel.includes('(4)'), todoLabel);
await board.click('#tab-todo');
const todoText = await board.textContent('#board');
check("yesterday's unfinished jobs carry over, marked with the day",
  todoText.includes('Not finished yet from before') && todoText.includes('Water the plants') && todoText.includes('from '));
check('the tab says how to tick', todoText.includes('Tap a job when it’s done'));

// Tick one of today's jobs.
const firstJob = board.locator('.jobs .job').first();
await firstJob.click();
await board.waitForTimeout(500);
check('tapping a job ticks it', (await firstJob.getAttribute('aria-pressed')) === 'true');
today = await api(`?date=${TODAY}`);
check('the tick is saved', (today.plan.done || []).length === 1);
check('the count goes down as jobs are ticked', (await board.textContent('#tab-todo')).includes('(3)'));
await board.reload({ waitUntil: 'networkidle' });
await board.click('#tab-todo');
check('a tick is still there after reloading', (await board.locator('.jobs .job').first().getAttribute('aria-pressed')) === 'true');

// Tick a carried-over job.
await board.locator('.job').filter({ hasText: 'Water the plants' }).click();
await board.waitForTimeout(600);
check('ticking a carried-over job clears it', !(await board.textContent('#board')).includes('Water the plants'));
const y = await api(`?date=${YDAY}`);
check("the carried-over tick is saved on the day it came from", (y.plan.done || []).includes('cy1'));

// Susan sees the tick, read-only.
await page.click(`#daypick button[data-date="${TODAY}"]`);
await page.waitForFunction((t) => date === t, TODAY);
await page.waitForTimeout(300);
check('Susan sees what Melody ticked', await sec('If there is time').locator('.donetag').count() === 1);
check("Susan sees what's still open from earlier days",
  (await sec('If there is time').textContent()).includes('Sort the mail'));

// Two jobs tapped in quick succession both stick.
await post('/api/save', { date: TODAY, plan: { ...(await api(`?date=${TODAY}`)).plan, chores: ['c01', 'c03', 'c02', 'c04'] }, standingNotes: [], library: (await api(`?date=${TODAY}`)).library });
await board.reload({ waitUntil: 'networkidle' });
await board.click('#tab-todo');
const jobsNow = board.locator('.jobs').first().locator('.job');
await jobsNow.nth(2).click({ noWaitAfter: true });
await jobsNow.nth(3).click({ noWaitAfter: true });   // straight after, before the first has saved
await board.waitForTimeout(1200);
const quick = (await api(`?date=${TODAY}`)).plan.done;
check('two jobs ticked in quick succession are both saved', quick.includes('c02') && quick.includes('c04'), JSON.stringify(quick));

// Unticking works.
await board.locator('.jobs .job').first().click();
await board.waitForTimeout(500);
check('a tick can be undone', (await board.locator('.jobs .job').first().getAttribute('aria-pressed')) === 'false');

/* ================================================================ TIME OFF */
await page.click('text=Nanny\'s time off');
await page.waitForSelector('#toff.on');
check('Susan has a time off screen', await page.isVisible('#t-type'));
const yr = TODAY.slice(0, 4);
await page.selectOption('#t-type', 'vacation');
await page.fill('#t-from', `${yr}-07-06`);   // a Monday
await page.fill('#t-to', `${yr}-07-12`);     // the Sunday after
await page.dispatchEvent('#t-to', 'input');
check('a week counts as 5 workdays (weekends not counted)',
  (await page.textContent('#t-count')).includes('5 workdays'), await page.textContent('#t-count'));
await page.fill('#t-note', 'Family trip');
await page.click('.addt');
await page.waitForSelector('#toast.on');
await page.selectOption('#t-type', 'sick');
await page.fill('#t-from', `${yr}-09-14`);
await page.fill('#t-to', '');
await page.check('#t-half');
await page.click('.addt');
await page.waitForTimeout(500);
await page.waitForFunction(() => !document.querySelector('#toff .addt').disabled);
await page.selectOption('#t-type', 'vacation');
await page.fill('#t-from', `${yr}-08-03`);
await page.fill('#t-to', `${yr}-08-14`);     // two working weeks
await page.uncheck('#t-half');
await page.click('.addt');
await page.waitForTimeout(500);
await page.waitForFunction(() => !document.querySelector('#toff .addt').disabled);
const tally = await page.textContent('.tally');
const saved = (await api(`?date=${TODAY}`)).timeOff.entries.length;
check('no time-off entry is lost when added one after another', saved === 3, String(saved));
check('the vacation tally shows days used against the allowance', tally.includes('15') && tally.includes('of 10'), tally);
check('going over the allowance is shown clearly', tally.includes('5 days over'), tally);
check('a half sick day counts as half', tally.includes('0.5'), tally);

// Two saves fired at once (a double tap) must both land.
await page.evaluate(() => Promise.all([
  postTimeOff((t) => ({ ...t, entries: [...t.entries, { id: 'race1', start: `${t.entries[0].start.slice(0, 4)}-10-01`, end: `${t.entries[0].start.slice(0, 4)}-10-01`, type: 'stat', days: 1, note: '' }] })),
  postTimeOff((t) => ({ ...t, entries: [...t.entries, { id: 'race2', start: `${t.entries[0].start.slice(0, 4)}-10-02`, end: `${t.entries[0].start.slice(0, 4)}-10-02`, type: 'stat', days: 1, note: '' }] })),
]));
const afterRace = (await api(`?date=${TODAY}`)).timeOff.entries.map((e) => e.id);
check('two time-off saves at the same moment both land',
  afterRace.includes('race1') && afterRace.includes('race2'), afterRace.join(','));

await board.reload({ waitUntil: 'networkidle' });
await board.click('#tab-off');
let off = await board.textContent('#board');
check("Melody's tablet shows the time off tally", off.includes('Vacation') && off.includes('15') && off.includes('5 days over'), off.slice(0, 300));
check("the tablet lists each entry with Susan's note", off.includes('Family trip'));
check('the tablet time off view has nothing to change', await board.locator('#board button, #board input').count() === 0);
await board.click('#btn-zh');
off = await board.textContent('#board');
check('the time off tab works in Chinese', off.includes('年假') && off.includes('病假') && off.includes('超出'), off.slice(0, 200));
await board.click('#tab-todo');
check('the jobs tab works in Chinese', (await board.textContent('#board')).includes('做完了就点一下'));

// The count resets in January: next year starts empty.
await page.click('.yr button[aria-label="Next year"]');
const next = await page.textContent('.tally');
check('the count starts fresh in a new year', next.includes('0 of 10') && next.includes('10 days left'), next);

await browser.close();
console.log('\n  v2 Round B — lists, naps, ticks, time off\n');
console.log(out.join('\n'));
console.log(`\n  ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
