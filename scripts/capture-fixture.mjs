/**
 * 抓取真实页面 DOM 作为本地 fixture，并对详情页尝试绕过整页验证码。
 * node scripts/capture-fixture.mjs
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

const exe =
  process.env.CHROME_PATH ||
  path.join(process.env.LOCALAPPDATA || '', 'ms-playwright/chromium-1234/chrome-win64/chrome.exe');

const browser = await chromium.launch({ headless: true, executablePath: exe });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  locale: 'zh-CN',
  userAgent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
});

const page = await context.newPage();

async function captureDom(target, name) {
  const html = await target.evaluate(() => {
    // 克隆并剥离脚本，保留样式与已渲染结构
    const clone = document.documentElement.cloneNode(true);
    clone.querySelectorAll('script, noscript, iframe').forEach((s) => s.remove());
    // 收藏的 style 标签保留（运行时注入的也保留）
    return '<!DOCTYPE html>\n' + clone.outerHTML;
  });
  const file = path.join(fixtureDir, `${name}.html`);
  fs.writeFileSync(file, html, 'utf8');
  return { file, bytes: html.length };
}

// ---------- 1) 首页 ----------
await page.goto('https://www.xiaoheihe.cn/app/bbs/home', {
  waitUntil: 'domcontentloaded',
  timeout: 60000,
});
await page.waitForTimeout(6000);
await page.screenshot({ path: path.join(outDir, 'fixture-home-light.png') });
const homeFixture = await captureDom(page, 'home');
console.log(JSON.stringify({ step: 'home', ...homeFixture }));

// ---------- 2) 从首页点击进入帖子（SPA 路由，尝试绕过整页验证码） ----------
const links = await page.$$eval('a[href*="/app/bbs/link/"]', (as) =>
  as.map((a) => a.getAttribute('href')).filter(Boolean),
);
console.log(JSON.stringify({ step: 'links-found', count: links.length, sample: links.slice(0, 5) }));

let detailOk = false;
if (links.length) {
  const href = links.find((h) => /\/app\/bbs\/link\/\d+/.test(h)) || links[0];
  try {
    const popupPromise = context.waitForEvent('page', { timeout: 8000 }).catch(() => null);
    // 触发站内路由跳转
    await page.evaluate((h) => {
      const a = [...document.querySelectorAll('a[href*="/app/bbs/link/"]')].find(
        (x) => x.getAttribute('href') === h,
      );
      if (a) a.click();
    }, href);
    const popup = await popupPromise;
    const detail = popup || page;
    await detail.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => {});
    await detail.waitForTimeout(7000);
    // 往下滚，触发评论/正文渲染
    await detail.evaluate(async () => {
      for (let i = 0; i < 6; i++) {
        window.scrollBy(0, 700);
        await new Promise((r) => setTimeout(r, 400));
      }
      window.scrollTo(0, 0);
    });
    await detail.waitForTimeout(2500);

    const hasCaptcha = await detail.evaluate(
      () => !!document.querySelector('.tcaptcha-transform, [class*="tcaptcha"]'),
    );
    await detail.screenshot({ path: path.join(outDir, 'fixture-detail-light.png') });
    const detailFixture = await captureDom(detail, 'detail');
    detailOk = !hasCaptcha;
    console.log(
      JSON.stringify({
        step: 'detail',
        href,
        usedPopup: !!popup,
        hasCaptcha,
        ...detailFixture,
      }),
    );
  } catch (e) {
    console.log(JSON.stringify({ step: 'detail', error: String(e) }));
  }
}

await browser.close();
console.log(JSON.stringify({ done: true, detailOk }));
