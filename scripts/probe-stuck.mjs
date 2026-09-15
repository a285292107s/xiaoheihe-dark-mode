/**
 * 定向诊断：为什么详情页有 2 块 rgb(247,248,249) 没被重映射。
 * node scripts/probe-stuck.mjs
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const cliRoot = path.join(process.env.APPDATA || '', 'npm/node_modules/@playwright/cli');
const { chromium } = require(path.join(cliRoot, 'node_modules/playwright'));

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const userscript = fs.readFileSync(path.resolve('dist/xiaoheihe-dark-mode.user.js'), 'utf8');
const code = userscript.replace(/^\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==\s*/, '');

const browser = await chromium.launch({
  headless: false,
  executablePath: CHROME,
  ignoreDefaultArgs: ['--enable-automation'],
  args: ['--disable-blink-features=AutomationControlled', '--start-maximized'],
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' });
await context.addInitScript(() => {
  window.GM_addStyle = (css) => {
    const el = document.createElement('style');
    el.textContent = css;
    (document.head || document.documentElement).appendChild(el);
  };
  try {
    localStorage.setItem('heybox-dark-mode', '1');
  } catch (_) {}
});
await context.addInitScript(code);

const page = await context.newPage();
await page.goto('https://www.xiaoheihe.cn/app/bbs/home', {
  waitUntil: 'domcontentloaded',
  timeout: 90000,
});
await page.waitForTimeout(7000);
const href = await page.evaluate(() => {
  const a = document.querySelector('a[href*="/app/bbs/link/"]');
  return a ? a.getAttribute('href') : null;
});
await page.evaluate((h) => {
  const a = [...document.querySelectorAll('a[href*="/app/bbs/link/"]')].find(
    (x) => x.getAttribute('href') === h,
  );
  if (a) a.click();
}, href);
await page.waitForTimeout(10000);

const diag = await page.evaluate(() => {
  const found = [];
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    const bg = cs.backgroundColor;
    const m = bg && bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!m) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 30 || r.height < 16) continue;
    if (0.2126 * +m[1] + 0.7152 * +m[2] + 0.0722 * +m[3] <= 200) continue;
    found.push({
      el,
      info: {
        bg,
        inlineBg: el.style.getPropertyValue('background-color') || null,
        inlinePriority: el.style.getPropertyPriority('background-color') || null,
        marks: {
          bg: el.dataset.hbDarkBg || null,
          fg: el.dataset.hbDarkFg || null,
          gra: el.dataset.hbDarkGrad || null,
        },
        tag: el.tagName,
        cls: typeof el.className === 'string' ? el.className : '',
        skip: el.hasAttribute('data-hb-skip'),
        position: cs.position,
        zIndex: cs.zIndex,
        rect: {
          w: Math.round(r.width),
          h: Math.round(r.height),
          x: Math.round(r.x),
          y: Math.round(r.y),
        },
        parentChain: (() => {
          const out = [];
          let n = el.parentElement;
          for (let i = 0; i < 5 && n && n !== document.body; i++) {
            out.push(
              n.tagName.toLowerCase() +
                (typeof n.className === 'string' && n.className.trim()
                  ? '.' + n.className.trim().split(/\s+/).slice(0, 3).join('.')
                  : '') +
                (n.hasAttribute('data-hb-skip') ? '[SKIP]' : ''),
            );
            n = n.parentElement;
          }
          return out.join(' < ');
        })(),
      },
    });
  }
  return found.map((f) => f.info);
});

console.log(JSON.stringify({ count: diag.length, diag }, null, 2));

// 再测：手动给它打补丁能否生效
const patchTest = await page.evaluate(() => {
  const results = [];
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    const m = cs.backgroundColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!m) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 30 || r.height < 16) continue;
    if (0.2126 * +m[1] + 0.7152 * +m[2] + 0.0722 * +m[3] <= 200) continue;
    el.style.setProperty('background-color', 'rgb(25, 29, 33)', 'important');
    results.push({
      after: getComputedStyle(el).backgroundColor,
      inline: el.style.getPropertyValue('background-color'),
    });
  }
  return results;
});
console.log(JSON.stringify({ patchTest }, null, 2));

await page.waitForTimeout(2000);
const afterWait = await page.evaluate(() => {
  let light = 0;
  const samples = [];
  for (const el of document.querySelectorAll('body *')) {
    const m = getComputedStyle(el).backgroundColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!m) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 30 || r.height < 16) continue;
    if (0.2126 * +m[1] + 0.7152 * +m[2] + 0.0722 * +m[3] <= 200) continue;
    light++;
    samples.push({ inline: el.style.getPropertyValue('background-color') || null });
  }
  return { light, samples };
});
console.log(JSON.stringify({ afterWait }, null, 2));

await browser.close();
console.log('DONE');
