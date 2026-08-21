// Checkpoint 3 tests — Susan's edit page, driven in a real browser.

import { chromium } from 'playwright';

const BASE = `http://127.0.0.1:${process.env.PORT || 8890}`;
const PIN = process.env.EDIT_PIN || '4821';
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

let passed = 0; let failed = 0; const out = [];
const check = (n, ok, d = '') => {
  if (ok) { passed += 1; out.push(`  PASS  ${n}`); }
  else { failed += 1; out.push(`  FAIL  ${n}${d ? ` — ${d}` : ''}`); }
};

const browser = await chromium.launch({ executablePath: EXE });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); // iPhone-ish
const page = await ctx.newPage();

/* ------------------------------------------------------------ PIN gate */
await page.goto(`${BASE}/edit.html`, { waitUntil: 'networkidle' });
check('the edit page opens locked behind a PIN',
  await page.isVisible('#gate'));

await page.fill('#pin', '0000');
await page.click('#gate button');
await page.waitForTimeout(500);
check('a wrong PIN is refused and the page stays locked',
  await page.isVisible('#gate') && (await page.textContent('#gate-err')).includes('not right'));

await page.fill('#pin', PIN);
await page.click('#gate button');
await page.waitForSelector('#app section', { timeout: 5000 });
check('the right PIN opens the planner', !(await page.isVisible('#gate')));

/* ----------------------------------------------------- all seven slots */
const titles = await page.$$eval('#app h2', (e) => e.map((x) => x.textContent.trim()));
check('every section Susan asked for is editable',
  ['Breakfast', 'Morning snack', 'Lunch', 'Afternoon snack',
    'Family dinner', 'Notes for Melody', 'If there is time']
    .every((t) => titles.includes(t)), titles.join(','));

/* --------------------------------------------- tap order = display order */
const sectionFor = (t) => page.locator('#app section').filter({ has: page.locator('h2', { hasText: t }) });
// Each row's .txt holds the English in a text node with the Chinese in a
// nested span; take only the text node so the two don't run together.
const namesIn = (sec) => sec.locator('ol li .txt')
  .evaluateAll((els) => els.map((e) => e.firstChild.textContent.trim()));
const bfast = sectionFor('Breakfast');

// Clear whatever the seed put there, so the order under test is ours alone.
while (await bfast.locator('ol li').count()) await bfast.locator('.rm').first().click();
check('breakfast can be emptied', await bfast.locator('ol li').count() === 0);

await bfast.locator('.add').click();
// Deliberately not alphabetical: Pear, Milk, Avocado.
for (const name of ['Pear', 'Milk', 'Avocado']) {
  await page.locator('#pool button').filter({ hasText: name }).first().click();
}
await page.click('.close');
let rows = await namesIn(bfast);
check('items appear in the order they were tapped, not sorted',
  rows.join('|') === 'Pear|Milk|Avocado', rows.join('|'));
let nums = await bfast.locator('ol li .num').allTextContents();
check('each item is numbered by its position', nums.join('') === '123', nums.join(''));

/* ------------------------------------------------------------ reorder */
await bfast.locator('li').nth(2).locator('.mv').nth(0).click();   // move Avocado up
rows = await namesIn(bfast);
check('the up arrow swaps an item with the one above it',
  rows.join('|') === 'Pear|Avocado|Milk', rows.join('|'));
check('the first item cannot be moved up',
  await bfast.locator('li').nth(0).locator('.mv').nth(0).isDisabled());
check('the last item cannot be moved down',
  await bfast.locator('li').nth(2).locator('.mv').nth(1).isDisabled());

/* ------------------------------------------------------- type your own */
await bfast.locator('.add').click();
await page.fill('#newitem', 'Kiwi, peeled and diced');
await page.click('.newrow button');
await page.click('.close');
rows = await namesIn(bfast);
check('a brand-new food can be typed and lands at the end',
  rows[3] === 'Kiwi, peeled and diced', rows.join('|'));

/* -------------------------------------------------- snacks stay apart */
const am = sectionFor('Morning snack');
const pmBefore = await sectionFor('Afternoon snack').locator('ol li').count();
await am.locator('.add').click();
await page.locator('#pool button').filter({ hasText: 'Strawberries' }).first().click();
await page.click('.close');
check('adding to the morning snack does not touch the afternoon snack',
  await sectionFor('Afternoon snack').locator('ol li').count() === pmBefore);

/* --------------------------------------------------------------- save */
await page.click('#savebtn');
await page.waitForFunction(() => document.getElementById('status').textContent.includes('Saved'),
  null, { timeout: 5000 });
check('saving reports success in plain language',
  (await page.textContent('#status')).includes("Melody's tablet"));

/* --------------------------------- the new item survives, and reaches the board */
const date = await page.evaluate(() => new Intl.DateTimeFormat('en-CA',
  { timeZone: 'America/Edmonton' }).format(new Date()));
const stored = await fetch(`${BASE}/api/day?date=${date}`).then((r) => r.json());
const names = stored.plan.breakfast.map(
  (id) => stored.library.food.find((f) => f.id === id)?.en);
check('the saved order round-trips through the server byte for byte',
  names.join('|') === 'Pear|Avocado|Milk|Kiwi, peeled and diced', names.join('|'));
check('the typed item was added to the permanent library',
  stored.library.food.some((f) => f.en === 'Kiwi, peeled and diced'));

const board = await ctx.newPage();
await board.goto(BASE, { waitUntil: 'networkidle' });
const boardRows = await board.$$eval('section ul li',
  (els) => els.slice(0, 4).map((e) => e.firstChild.textContent.trim()));
check("Melody's board shows exactly what Susan just saved",
  boardRows.join('|') === 'Pear|Avocado|Milk|Kiwi, peeled and diced', boardRows.join('|'));
await board.close();

/* ------------------------------------------- reload keeps what was saved */
await page.reload({ waitUntil: 'load' });
await page.waitForSelector('#app section', { timeout: 5000 });
check('the PIN is remembered so Susan is not asked again',
  !(await page.isVisible('#gate')));
rows = await namesIn(sectionFor('Breakfast'));
check('the plan is still there after a reload',
  rows.join('|') === 'Pear|Avocado|Milk|Kiwi, peeled and diced', rows.join('|'));

/* -------------------------------------------------- same as yesterday */
await page.evaluate(async (p) => {
  const d = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Edmonton' }).format(new Date());
  const [y, m, dd] = d.split('-').map(Number);
  const prev = new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC' })
    .format(new Date(Date.UTC(y, m - 1, dd, 12) - 86400000));
  await fetch('/api/save', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-pin': p },
    body: JSON.stringify({ date: prev, plan: { breakfast: ['f18'], amSnack: [], lunch: [], pmSnack: [], dinner: [], notes: [], chores: [] } }),
  });
}, PIN);
await page.click('.ghost');
await page.waitForTimeout(400);
rows = await namesIn(sectionFor('Breakfast'));
check('"same as yesterday" pulls the previous day forward',
  rows.length === 1 && rows[0] === 'Strawberries', rows.join('|'));

/* ------------------------------------------------------ default day */
const headText = await page.textContent('#head');
check('the page opens on today or tomorrow depending on the hour',
  ['Today’s plan', "Today's plan", "Tomorrow's plan"].includes(headText.trim()), headText);

await browser.close();
console.log('\n  Checkpoint 3 — Susan\'s edit page\n');
console.log(out.join('\n'));
console.log(`\n  ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
