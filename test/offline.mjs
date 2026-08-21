// Offline tests — the board must survive being reloaded with no connection.
//
// Regression: the app kept the last plan in localStorage, which covered a
// wifi blip while the page stayed open. It did NOT cover a reload, because
// the page itself has to load from the network first. Melody taps the icon
// in the morning, the wifi is still waking up, and she got the browser's
// error page instead of Liam's breakfast.

import { chromium } from 'playwright';

const BASE = `http://127.0.0.1:${process.env.PORT || 8890}`;
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

let passed = 0; let failed = 0; const out = [];
const check = (n, ok, d = '') => {
  if (ok) { passed += 1; out.push(`  PASS  ${n}`); }
  else { failed += 1; out.push(`  FAIL  ${n}${d ? ` — ${d}` : ''}`); }
};

const browser = await chromium.launch({ executablePath: EXE });
const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
const page = await ctx.newPage();

/* ------------------------------------------------------- online first */
await page.goto(BASE, { waitUntil: 'networkidle' });
const online = await page.$$eval('section ul li',
  (els) => els.map((e) => e.firstChild.textContent.trim()));
check('the board loads normally while online', online.length > 0, `${online.length} items`);

// The worker has to install and take control before it can serve anything.
await page.waitForFunction(() => navigator.serviceWorker.controller !== null,
  null, { timeout: 10000 }).catch(() => {});
check('the service worker installs and takes control',
  await page.evaluate(() => navigator.serviceWorker.controller !== null));

/* ------------------------------------------ the actual failure scenario */
// Melody's tablet has been asleep. She taps the icon. The wifi is down.
await ctx.setOffline(true);
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(800);

const title = await page.title();
check('reloading with no connection still opens the board, not an error page',
  title.includes("Liam's Day"), `title was "${title}"`);

const offlineRows = await page.$$eval('section ul li',
  (els) => els.map((e) => e.firstChild.textContent.trim()));
check('the last saved plan is still on screen offline',
  offlineRows.join('|') === online.join('|'),
  `online ${online.length} vs offline ${offlineRows.length}`);

const footer = await page.textContent('#footer');
check('it says plainly that there is no connection',
  footer.toLowerCase().includes('no connection'), footer);
check('it still shows when the plan was last updated',
  /\d/.test(footer), footer);

/* ------------------------------------------------- the planner too */
const plan = await ctx.newPage();
await plan.goto(`${BASE}/edit.html`, { waitUntil: 'networkidle' });
await plan.waitForFunction(() => navigator.serviceWorker.controller !== null,
  null, { timeout: 10000 }).catch(() => {});
await ctx.setOffline(true);
await plan.reload({ waitUntil: 'domcontentloaded' });
await plan.waitForTimeout(500);
check('the planner also opens offline rather than erroring',
  (await plan.title()).includes("Liam's Day"), await plan.title());
await plan.close();

/* -------------------------------------------------- back online again */
await ctx.setOffline(false);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(500);
const backOn = await page.textContent('#footer');
check('the "no connection" message clears once it is back online',
  !backOn.toLowerCase().includes('no connection'), backOn);

// A stale service worker pinning people to an old version is the classic
// failure here. Pages are fetched network-first, so a deploy always wins.
const fresh = await page.evaluate(async () => {
  const res = await fetch('/index.html', { cache: 'no-store' });
  return res.headers.get('cache-control') || '';
});
check('the page is served fresh from the network when online, not from cache',
  fresh.includes('no-cache') || fresh.includes('no-store'), fresh);

await browser.close();
console.log('\n  Offline behaviour\n');
console.log(out.join('\n'));
console.log(`\n  ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
