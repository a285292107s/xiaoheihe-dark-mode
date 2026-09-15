/**
 * 用本机真实 Chrome（有头）打开小黑盒，抓首页 + 详情页 DOM 与截图。
 * 有头模式可规避部分无头指纹检测。
 * node scripts/chrome-headed.mjs
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const cliRoot = path.join(process.env.APPDATA || '', 'npm/node_modules/@playwright/cli');
const { chromium } = require(path.join(cliRoot, 'node_modules/playwright'));

const outDir = path.resolve('output/playwright');
const fixtureDir = path.resolve('fixtures');
fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(fixtureDir, { recursive: true });

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const userscriptPath = path.resolve('dist/xiaoheihe-dark-mode.user.js');
const userscript = fs.readFileSync(userscriptPath, 'utf8');
const code = userscript.replace(/^\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==\s*/, '');

const browser = await chromium.launch({
  headless: false,
  executablePath: CHROME,
  ignoreDefaultArgs: ['--enable-automation'],
  args: ['--disable-blink-features=AutomationControlled', '--start-maximized'],
});

async function saveDom(page, name) {
  const html = await page.evaluate(() => {
    const clone = document.documentElement.cloneNode(true);
    clone.querySelectorAll('script, noscript').forEach((s) => s.remove());
    return '<!DOCTYPE html>\n' + clone.outerHTML;
  });
  const file = path.join(fixtureDir, `${name}.html`);
  fs.writeFileSync(file, html, 'utf8');
  return html.length;
}

// ---------- 首页 ----------
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  locale: 'zh-CN',
});
const page = await context.newPage();
await page.goto('https://www.xiaoheihe.cn/app/bbs/home', {
  waitUntil: 'domcontentloaded',
  timeout: 90000,
});
await page.waitForTimeout(7000);

const homeCaptcha = await page.evaluate(
  () => !!document.querySelector('.tcaptcha-transform, [class*="tcaptcha"]'),
);
await page.screenshot({ path: path.join(outDir, 'chrome-home-light.png') });
const homeBytes = await saveDom(page, 'home');
console.log(JSON.stringify({ step: 'home', homeCaptcha, homeBytes }));

// ---------- 详情页（站内点击） ----------
const href = await page.evaluate(() => {
  const a = document.querySelector('a[href*="/app/bbs/link/"]');
  return a ? a.getAttribute('href') : null;
});
console.log(JSON.stringify({ step: 'picked-link', href }));

let detailInfo = null;
if (href) {
  await page.evaluate((h) => {
    const a = [...document.querySelectorAll('a[href*="/app/bbs/link/"]')].find(
      (x) => x.getAttribute('href') === h,
    );
    if (a) a.click();
  }, href);
  await page.waitForTimeout(9000);

  // 滚动加载正文/评论
  await page.evaluate(async () => {
    for (let i = 0; i < 10; i++) {
      window.scrollBy(0, 800);
      await new Promise((r) => setTimeout(r, 350));
    }
  });
  await page.waitForTimeout(3000);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(1200);

  const captcha = await page.evaluate(
    () => !!document.querySelector('.tcaptcha-transform, [class*="tcaptcha"]'),
  );
  const url = page.url();
  await page.screenshot({ path: path.join(outDir, 'chrome-detail-light.png') });
  const bytes = await saveDom(page, 'detail');
  detailInfo = { url, captcha, bytes };
  console.log(JSON.stringify({ step: 'detail', ...detailInfo }));
}

// ---------- 注入深色脚本，截深色效果 ----------
const darkCtx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  locale: 'zh-CN',
});
await darkCtx.addInitScript(() => {
  window.GM_addStyle = (css) => {
    const el = document.createElement('style');
    el.textContent = css;
    (document.head || document.documentElement).appendChild(el);
  };
  try {
    localStorage.setItem('heybox-dark-mode', '1');
  } catch (_) {}
});
await darkCtx.addInitScript(code);
const darkPage = await darkCtx.newPage();
await darkPage.goto('https://www.xiaoheihe.cn/app/bbs/home', {
  waitUntil: 'domcontentloaded',
  timeout: 90000,
});
await darkPage.waitForTimeout(7000);
await darkPage.screenshot({ path: path.join(outDir, 'chrome-home-dark.png') });
console.log(JSON.stringify({ step: 'home-dark', done: true }));

if (href) {
  await darkPage.evaluate((h) => {
    const a = [...document.querySelectorAll('a[href*="/app/bbs/link/"]')].find(
      (x) => x.getAttribute('href') === h,
    );
    if (a) a.click();
  }, href);
  await darkPage.waitForTimeout(9000);
  await darkPage.evaluate(async () => {
    for (let i = 0; i < 10; i++) {
      window.scrollBy(0, 800);
      await new Promise((r) => setTimeout(r, 350));
    }
  });
  await darkPage.waitForTimeout(2500);
  await darkPage.evaluate(() => window.scrollTo(0, 0));
  await darkPage.waitForTimeout(1200);
  await darkPage.screenshot({ path: path.join(outDir, 'chrome-detail-dark.png') });
  await darkPage.screenshot({
    path: path.join(outDir, 'chrome-detail-dark-full.png'),
    fullPage: true,
  });
  console.log(JSON.stringify({ step: 'detail-dark', done: true }));
}

await browser.close();
console.log('DONE');
