import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const cliRoot = path.join(process.env.APPDATA || '', 'npm/node_modules/@playwright/cli');
const { chromium } = require(path.join(cliRoot, 'node_modules/playwright'));

const exe =
  process.env.CHROME_PATH ||
  path.join(process.env.LOCALAPPDATA || '', 'ms-playwright/chromium-1234/chrome-win64/chrome.exe');

const browser = await chromium.launch({ headless: true, executablePath: exe });
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  locale: 'zh-CN',
});
await ctx.addInitScript(() => {
  try {
    localStorage.setItem('heybox-dark-mode', '1');
  } catch (_) {}
});
const page = await ctx.newPage();
await page.goto('https://www.xiaoheihe.cn/app/bbs/link/190692626', {
  waitUntil: 'domcontentloaded',
  timeout: 60000,
});
await page.waitForTimeout(5000);

const info = await page.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    const bg = cs.backgroundColor;
    if (!bg || bg === 'transparent' || bg === 'rgba(0, 0, 0, 0)') continue;
    const m = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!m) continue;
    const r = +m[1];
    const g = +m[2];
    const b = +m[3];
    if (r > 230 && g > 230 && b > 230) {
      const chain = [];
      let n = el;
      for (let i = 0; i < 6 && n && n !== document.body; i++) {
        const cls =
          typeof n.className === 'string' && n.className.trim()
            ? '.' + n.className.trim().split(/\s+/).slice(0, 4).join('.')
            : '';
        chain.unshift(n.tagName.toLowerCase() + cls);
        n = n.parentElement;
      }
      const rct = el.getBoundingClientRect();
      out.push({
        bg,
        chain: chain.join(' > '),
        w: Math.round(rct.width),
        h: Math.round(rct.height),
        y: Math.round(rct.y),
      });
    }
  }
  return out;
});

console.log(JSON.stringify(info, null, 2));
await browser.close();
