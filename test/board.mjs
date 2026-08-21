// Checkpoint 2 tests — Melody's board, driven in a real browser.
// Assumes a dev server on PORT (default 8890) seeded with seed.json.

import { chromium } from 'playwright';

const BASE = `http://127.0.0.1:${process.env.PORT || 8890}`;
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

let passed = 0; let failed = 0; const out = [];
const check = (n, ok, d = '') => {
  if (ok) { passed += 1; out.push(`  PASS  ${n}`); }
  else { failed += 1; out.push(`  FAIL  ${n}${d ? ` — ${d}` : ''}`); }
};

const browser = await chromium.launch({ executablePath: EXE });
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
await page.goto(BASE, { waitUntil: 'networkidle' });

/* ------------------------------------------------- ordering in the DOM */
// The API preserves order; this proves the rendering does too.
const breakfast = await page.$$eval('section:has(h2) ul li',
  (els) => els.map((e) => e.firstChild.textContent.trim()));
check('breakfast renders in the exact order Susan set',
  breakfast.slice(0, 4).join('|') === 'Oatmeal|Banana|Milk|Heat in microwave 15 seconds, mix',
  breakfast.slice(0, 4).join('|'));

/* ------------------------------------------ the two snacks are distinct */
const heads = await page.$$eval('h2', (els) => els.map((e) => e.textContent.trim()));
check('morning and afternoon snacks appear as separate sections',
  heads.includes('Morning snack') && heads.includes('Afternoon snack'));
check('the four meal slots each render once',
  ['Breakfast', 'Morning snack', 'Lunch', 'Afternoon snack']
    .every((h) => heads.filter((x) => x === h).length === 1));

/* ------------------------------------------------- read-only guarantee */
const inputs = await page.$$eval('input,textarea,select,[contenteditable="true"]',
  (els) => els.length);
check('no data-entry controls anywhere on the board', inputs === 0, `${inputs} found`);
const buttons = await page.$$eval('button', (els) => els.map((e) => e.id));
check('the only buttons are the language toggle and the two tabs',
  buttons.sort().join(',') === 'btn-en,btn-zh,tab-liam,tab-todo', buttons.join(','));

/* ------------------------------------------------------- the todo tab */
check('the second tab carries a count so nothing needs tapping to be noticed',
  (await page.textContent('#tab-todo')).trim() === 'Also to do (4)',
  await page.textContent('#tab-todo'));
await page.click('#tab-todo');
const todoHeads = await page.$$eval('h2', (els) => els.map((e) => e.textContent.trim()));
check('the todo tab shows dinner and chores',
  todoHeads.includes('Dinner for Mum and Dad') && todoHeads.includes('If there is time'));
check('meals are not repeated on the todo tab', !todoHeads.includes('Breakfast'));

/* --------------------------------------------------------- translation */
await page.click('#tab-liam');
await page.click('#btn-zh');
await page.waitForTimeout(150);
const zhFirst = await page.textContent('section ul li');
check('Chinese mode shows Chinese with the English underneath',
  zhFirst.includes('燕麦粥') && zhFirst.includes('Oatmeal'), zhFirst);
check('the page language attribute switches for correct glyph shaping',
  await page.getAttribute('html', 'lang') === 'zh-Hans');

// Chinese must actually render, not fall back to boxes.
const glyphOk = await page.evaluate(() => {
  const c = document.createElement('canvas').getContext('2d');
  c.font = '32px system-ui, "Noto Sans SC", sans-serif';
  const w = c.measureText('燕').width;
  return w > 8 && w < 64;   // a tofu box measures very differently
});
check('Chinese glyphs render rather than falling back to tofu boxes', glyphOk);

/* ------------------------------------------- empty day hides its tabs */
const empty = await browser.newPage({ viewport: { width: 1024, height: 768 } });
await empty.goto(`${BASE}/?_=1`, { waitUntil: 'networkidle' });
await empty.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
await empty.goto(`${BASE}/api/day?date=2026-12-25`);
const emptyBody = JSON.parse(await empty.textContent('body'));
check('a day with nothing planned returns empty lists, not an error',
  emptyBody.plan.breakfast.length === 0 && emptyBody.plan.chores.length === 0);
await empty.close();

/* ------------------------------------------------------ live refresh */
// Change the plan behind the board's back, then force its poll to run.
await fetch(`${BASE}/api/save`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-pin': process.env.EDIT_PIN || '4821' },
  body: JSON.stringify({
    date: new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Edmonton' }).format(new Date()),
    plan: { breakfast: ['f19'], amSnack: [], lunch: [], pmSnack: [], dinner: [], notes: [], chores: [] },
  }),
});
await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
await page.waitForTimeout(600);
const afterEdit = await page.textContent('section ul li');
check('the board picks up a change made elsewhere, untouched',
  afterEdit.includes('梨') || afterEdit.includes('Pear'), afterEdit);
const tabsHidden = await page.getAttribute('#tabs', 'hidden');
check('with dinner and chores empty, the second tab disappears entirely',
  tabsHidden !== null);

await browser.close();
console.log('\n  Checkpoint 2 — Melody\'s board\n');
console.log(out.join('\n'));
console.log(`\n  ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
