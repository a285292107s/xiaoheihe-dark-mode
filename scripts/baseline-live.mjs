/**
 * 基线：不注入任何脚本，量站点自身的长任务，用于对比脚本开销。
 * node scripts/baseline-live.mjs
 */
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const cliRoot = path.join(process.env.APPDATA || '', 'npm/node_modules/@playwright/cli');
const { chromium } = require(path.join(cliRoot, 'node_modules/playwright'));

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

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
  window.__longTasks = [];
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) window.__longTasks.push(Math.round(e.duration));
    }).observe({ entryTypes: ['longtask'] });
  } catch (_) {}
});

const page = await context.newPage();
await page.goto('https://www.xiaoheihe.cn/app/bbs/home', {
  waitUntil: 'domcontentloaded',
  timeout: 90000,
});
await page.waitForTimeout(9000);
const home = await page.evaluate(() => ({
  nodeCount: document.querySelectorAll('*').length,
  longTasks: window.__longTasks.slice(0, 12),
}));
console.log(JSON.stringify({ step: 'home-baseline', ...home }));

const href = await page.evaluate(() => {
  const a = document.querySelector('a[href*="/app/bbs/link/"]');
  return a ? a.getAttribute('href') : null;
});
if (href) {
  await page.evaluate((h) => {
    const a = [...document.querySelectorAll('a[href*="/app/bbs/link/"]')].find(
      (x) => x.getAttribute('href') === h,
    );
    if (a) a.click();
  }, href);
  await page.waitForTimeout(9000);
  await page.evaluate(async () => {
    for (let i = 0; i < 12; i++) {
      window.scrollBy(0, 800);
      await new Promise((r) => setTimeout(r, 320));
    }
  });
  await page.waitForTimeout(3000);
  const detail = await page.evaluate(() => ({
    nodeCount: document.querySelectorAll('*').length,
    longTasks: window.__longTasks.slice(0, 12),
  }));
  console.log(JSON.stringify({ step: 'detail-baseline', ...detail }));
}

await browser.close();
console.log('DONE');
