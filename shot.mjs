import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const shots = [
  ['board-tablet-en.png', 1024, 768, 'en', 'liam'],
  ['board-tablet-zh.png', 1024, 768, 'zh', 'liam'],
  ['board-todo-en.png',   1024, 768, 'en', 'todo'],
  ['board-portrait-zh.png', 600, 1000, 'zh', 'liam'],
];
for (const [file, w, h, lang, tab] of shots) {
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  await p.goto('http://127.0.0.1:8890/', { waitUntil: 'networkidle' });
  if (lang === 'zh') await p.click('#btn-zh');
  if (tab === 'todo') await p.click('#tab-todo');
  await p.waitForTimeout(300);
  await p.screenshot({ path: `/home/claude/liams-day/shots/${file}`, fullPage: true });
  await p.close();
}
await b.close();
console.log('shots done');
