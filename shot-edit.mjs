import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2 });
const p = await ctx.newPage();
await p.goto('http://127.0.0.1:8890/edit.html',{waitUntil:'networkidle'});
await p.screenshot({path:'shots/edit-01-pin.png'});
await p.fill('#pin','4821'); await p.click('#gate button');
await p.waitForSelector('#app section'); await p.waitForTimeout(300);
// Viewport shots, not fullPage — a fixed save bar renders in the wrong
// place in a fullPage capture and would misrepresent the layout.
await p.screenshot({path:'shots/edit-02-plan.png'});
await p.evaluate(()=>window.scrollBy(0,900)); await p.waitForTimeout(200);
await p.screenshot({path:'shots/edit-04-scrolled.png'});
await p.evaluate(()=>window.scrollTo(0,0)); await p.waitForTimeout(200);
const bf = p.locator('#app section').filter({has:p.locator('h2',{hasText:'Breakfast'})});
await bf.locator('.add').click(); await p.waitForTimeout(300);
await p.screenshot({path:'shots/edit-03-sheet.png'});
await b.close(); console.log('ok');
