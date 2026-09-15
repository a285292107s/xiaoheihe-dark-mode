/**
 * 真站回测：注入脚本，走首页 + 帖子详情，量覆盖度与长任务。
 * node scripts/verify-live.mjs
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const cliRoot = path.join(process.env.APPDATA || '', 'npm/node_modules/@playwright/cli');
const { chromium } = require(path.join(cliRoot, 'node_modules/playwright'));

const outDir = path.resolve('output/playwright');
fs.mkdirSync(outDir, { recursive: true });

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const userscript = fs.readFileSync(path.resolve('dist/xiaoheihe-dark-mode.user.js'), 'utf8');
const code = userscript.replace(/^\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==\s*/, '');

const browser = await chromium.launch({
  headless: false,
  executablePath: CHROME,
  ignoreDefaultArgs: ['--enable-automation'],
  args: ['--disable-blink-features=AutomationControlled', '--start-maximized'],
});

const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  locale: 'zh-CN',
});

await context.addInitScript(() => {
  window.GM_addStyle = (css) => {
    const el = document.createElement('style');
    el.textContent = css;
    (document.head || document.documentElement).appendChild(el);
  };
  try {
    localStorage.setItem('heybox-dark-mode', '1');
  } catch (_) {}
  // 记录长任务（>200ms 视为卡顿）
  window.__longTasks = [];
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        window.__longTasks.push(Math.round(e.duration));
      }
    }).observe({ entryTypes: ['longtask'] });
  } catch (_) {}
});
await context.addInitScript(code);

const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});

const measure = () =>
  page.evaluate(() => {
    let light = 0;
    let lowContrast = 0;
    const samples = [];
    for (const el of document.querySelectorAll('body *')) {
      const cs = getComputedStyle(el);
      const bg = cs.backgroundColor;
      if (bg && bg !== 'transparent' && bg !== 'rgba(0, 0, 0, 0)') {
        const m = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (m) {
          const r = +m[1];
          const g = +m[2];
          const b = +m[3];
          const w = el.getBoundingClientRect().width;
          const h = el.getBoundingClientRect().height;
          if (w > 30 && h > 16) {
            const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
            if (l > 200) {
              light++;
              if (samples.length < 8) {
                const chain = [];
                let n = el;
                for (let d = 0; d < 6 && n && n !== document.body; d++) {
                  const cls =
                    typeof n.className === 'string' && n.className.trim()
                      ? '.' + n.className.trim().split(/\s+/).slice(0, 3).join('.')
                      : '';
                  chain.unshift(n.tagName.toLowerCase() + cls);
                  n = n.parentElement;
                }
                samples.push({
                  tag: el.tagName.toLowerCase(),
                  class: (typeof el.className === 'string' ? el.className : '').slice(0, 80),
                  bg,
                  chain: chain.join(' > '),
                });
              }
            }
          }
        }
      }
      if (el.children.length <= 2) {
        const text = (el.textContent || '').trim();
        if (text.length >= 2) {
          const cm = cs.color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
          if (cm) {
            const cl = 0.2126 * +cm[1] + 0.7152 * +cm[2] + 0.0722 * +cm[3];
            const bm = cs.backgroundColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
            const bl = bm ? 0.2126 * +bm[1] + 0.7152 * +bm[2] + 0.0722 * +bm[3] : 15;
            if (cl < 90 && bl < 90) lowContrast++;
          }
        }
      }
    }
    return {
      url: location.href,
      isDark: document.documentElement.classList.contains('heybox-dark'),
      lightSurfaces: light,
      lightSamples: samples,
      lowContrastText: lowContrast,
      nodeCount: document.querySelectorAll('*').length,
      longTasks: (window.__longTasks || []).slice(0, 12),
    };
  });

// ---------- 首页 ----------
await page.goto('https://www.xiaoheihe.cn/app/bbs/home', {
  waitUntil: 'domcontentloaded',
  timeout: 90000,
});
await page.waitForTimeout(8000);
await page.screenshot({ path: path.join(outDir, 'verify-home-dark.png') });
const home = await measure();
console.log(JSON.stringify({ step: 'home', ...home }, null, 2));

// ---------- 详情页（站内点击） ----------
const href = await page.evaluate(() => {
  const a = document.querySelector('a[href*="/app/bbs/link/"]');
  return a ? a.getAttribute('href') : null;
});

if (href) {
  const popupPromise = context.waitForEvent('page', { timeout: 9000 }).catch(() => null);
  await page.evaluate((h) => {
    const a = [...document.querySelectorAll('a[href*="/app/bbs/link/"]')].find(
      (x) => x.getAttribute('href') === h,
    );
    if (a) a.click();
  }, href);
  const popup = await popupPromise;
  const detail = popup || page;
  await detail.waitForLoadState('domcontentloaded', { timeout: 40000 }).catch(() => {});
  await detail.waitForTimeout(9000);

  await detail.evaluate(async () => {
    for (let i = 0; i < 12; i++) {
      window.scrollBy(0, 800);
      await new Promise((r) => setTimeout(r, 320));
    }
  });
  await detail.waitForTimeout(3000);
  await detail.evaluate(() => window.scrollTo(0, 0));
  await detail.waitForTimeout(1500);

  await detail.screenshot({ path: path.join(outDir, 'verify-detail-dark.png') });

  const detailM = await detail.evaluate(() => {
    let light = 0;
    let lowContrast = 0;
    const samples = [];
    for (const el of document.querySelectorAll('body *')) {
      const cs = getComputedStyle(el);
      const bg = cs.backgroundColor;
      if (bg && bg !== 'transparent' && bg !== 'rgba(0, 0, 0, 0)') {
        const m = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (m) {
          const r = +m[1];
          const g = +m[2];
          const b = +m[3];
          const w = el.getBoundingClientRect().width;
          const h = el.getBoundingClientRect().height;
          if (w > 30 && h > 16) {
            const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
            if (l > 200) {
              light++;
              if (samples.length < 8) {
                const chain = [];
                let n = el;
                for (let d = 0; d < 6 && n && n !== document.body; d++) {
                  const cls =
                    typeof n.className === 'string' && n.className.trim()
                      ? '.' + n.className.trim().split(/\s+/).slice(0, 3).join('.')
                      : '';
                  chain.unshift(n.tagName.toLowerCase() + cls);
                  n = n.parentElement;
                }
                samples.push({
                  tag: el.tagName.toLowerCase(),
                  class: (typeof el.className === 'string' ? el.className : '').slice(0, 80),
                  bg,
                  chain: chain.join(' > '),
                });
              }
            }
          }
        }
      }
      if (el.children.length <= 2) {
        const text = (el.textContent || '').trim();
        if (text.length >= 2) {
          const cm = cs.color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
          if (cm) {
            const cl = 0.2126 * +cm[1] + 0.7152 * +cm[2] + 0.0722 * +cm[3];
            const bm = cs.backgroundColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
            const bl = bm ? 0.2126 * +bm[1] + 0.7152 * +bm[2] + 0.0722 * +bm[3] : 15;
            if (cl < 90 && bl < 90) lowContrast++;
          }
        }
      }
    }
    return {
      url: location.href,
      isDark: document.documentElement.classList.contains('heybox-dark'),
      lightSurfaces: light,
      lightSamples: samples,
      lowContrastText: lowContrast,
      nodeCount: document.querySelectorAll('*').length,
      longTasks: (window.__longTasks || []).slice(0, 12),
    };
  });

  console.log(JSON.stringify({ step: 'detail', href, usedPopup: !!popup, ...detailM }, null, 2));

  // 诊断：手动触发一次重扫，看残留是否消失（验证是否被持续变更饿死）
  if (detailM.lightSurfaces > 0) {
    await detail.evaluate(() => {
      if (window.__hbRefresh) window.__hbRefresh();
    });
    await detail.waitForTimeout(1500);
    const after = await detail.evaluate(() => {
      let light = 0;
      for (const el of document.querySelectorAll('body *')) {
        const bg = getComputedStyle(el).backgroundColor;
        const m = bg && bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (!m) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 30 || r.height < 16) continue;
        if (0.2126 * +m[1] + 0.7152 * +m[2] + 0.0722 * +m[3] > 200) light++;
      }
      return { lightSurfaces: light };
    });
    console.log(JSON.stringify({ step: 'detail-after-manual-refresh', ...after }, null, 2));
  }
}

console.log(JSON.stringify({ errors: errors.slice(0, 10) }, null, 2));
await browser.close();
console.log('DONE');
