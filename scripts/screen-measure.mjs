// 1920×1080에서 각 스냅샷·설명 슬라이드의 넘침 측정
// node measure.mjs <snaps.json> <out.json> [console|dock] [shotPrefix]
import { chromium } from 'playwright-core';
import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { readdirSync } from 'node:fs';

const [, , snapsPath, outPath, mode = 'console', shot = ''] = process.argv;
const base = `${homedir()}/.cache/ms-playwright/chromium_headless_shell-1248/`;
const exe = `${base}${readdirSync(base).find((d) => d.startsWith('chrome'))}/chrome-headless-shell`;
const browser = await chromium.launch({ executablePath: exe });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const URL = 'http://localhost:5199/board.html';

const measure = () =>
  page.evaluate(() => {
    const W = innerWidth, H = innerHeight;
    const doc = document.documentElement;
    const out = [];
    const desc = (el) => `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : ''}`;
    for (const el of document.body.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) continue;
      if (r.bottom > H + 1 || r.right > W + 1) out.push({ kind: 'out', el: desc(el), bottom: Math.round(r.bottom), right: Math.round(r.right), text: (el.textContent || '').trim().slice(0, 40) });
      if ((cs.overflow.includes('hidden') || cs.overflowY === 'hidden' || cs.overflowX === 'hidden') && (el.scrollHeight > el.clientHeight + 2 || el.scrollWidth > el.clientWidth + 2))
        out.push({ kind: 'clip', el: desc(el), sh: el.scrollHeight, ch: el.clientHeight, sw: el.scrollWidth, cw: el.clientWidth, text: (el.textContent || '').trim().slice(0, 40) });
    }
    return { docH: doc.scrollHeight, docW: doc.scrollWidth, items: out };
  });

await page.addInitScript((m) => {
  if (m === 'console') setInterval(() => localStorage.setItem('deal-board-console', String(Date.now())), 500);
  if (m === 'console') localStorage.setItem('deal-board-console', String(Date.now()));
}, mode);

const results = [];
if (snapsPath === 'tutorial') {
  await page.goto(URL);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForTimeout(800);
  await page.click('[data-action="tutorial"]');
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(1500);
    const title = await page.evaluate(() => document.querySelector('h1, h2')?.textContent?.trim().slice(0, 50) ?? '');
    const m = await measure();
    results.push({ label: `slide ${i}: ${title}`, ...m });
    if (shot) await page.screenshot({ path: `${shot}-tut${i}.png` });
    const before = await page.evaluate(() => document.body.innerHTML.length);
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(300);
    const after = await page.evaluate(() => document.body.innerHTML.length);
    if (before === after && i > 2) break;
  }
} else {
  const snaps = JSON.parse(readFileSync(snapsPath, 'utf8'));
  await page.goto(URL);
  for (const [i, s] of snaps.entries()) {
    await page.evaluate((g) => localStorage.setItem('odyssey-board-v2', JSON.stringify(g)), s.game);
    await page.reload();
    await page.waitForTimeout(1800);
    const m = await measure();
    results.push({ i, label: s.label, ...m });
    if (shot && (m.docH > 1081 || m.items.length)) await page.screenshot({ path: `${shot}-${i}.png` });
  }
}
writeFileSync(outPath, JSON.stringify(results, null, 1));
for (const r of results) {
  const bad = r.docH > 1081 || r.docW > 1921 || r.items.length;
  if (bad) console.log(`✗ ${r.label}  docH ${r.docH} docW ${r.docW}  ${r.items.slice(0, 4).map((x) => `${x.kind}:${x.el}${x.bottom ? ` b${x.bottom}` : ''}${x.sh ? ` ${x.sh}/${x.ch} ${x.sw}/${x.cw}` : ''} "${x.text}"`).join(' | ')}`);
}
console.log(`checked ${results.length}, bad ${results.filter((r) => r.docH > 1081 || r.docW > 1921 || r.items.length).length}`);
await browser.close();
