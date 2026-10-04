import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { resolveChromePath } from './lib/chromium.mjs';

const require = createRequire(import.meta.url);
const cliRoot = path.join(process.env.APPDATA || '', 'npm/node_modules/@playwright/cli');
const { chromium } = require(path.join(cliRoot, 'node_modules/playwright'));

const outDir = path.resolve('output/playwright');
const fixtureDir = path.resolve('fixtures');
fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(fixtureDir, { recursive: true });

const exe = resolveChromePath();

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
    const clone = document.documentElement.cloneNode(true);
    clone.querySelectorAll('script, noscript, iframe').forEach((s) => s.remove());
    return '<!DOCTYPE html>\n' + clone.outerHTML;
  });
  const file = path.join(fixtureDir, `${name}.html`);
  fs.writeFileSync(file, html, 'utf8');
  return { file, bytes: html.length };
}

await page.goto('https://www.xiaoheihe.cn/app/bbs/home', {
  waitUntil: 'domcontentloaded',
  timeout: 60000,
});
await page.waitForTimeout(6000);
await page.screenshot({ path: path.join(outDir, 'fixture-home-light.png') });
const homeFixture = await captureDom(page, 'home');
console.log(JSON.stringify({ step: 'home', ...homeFixture }));

const links = await page.$$eval('a[href*="/app/bbs/link/"]', (as) =>
  as.map((a) => a.getAttribute('href')).filter(Boolean),
);
console.log(JSON.stringify({ step: 'links-found', count: links.length, sample: links.slice(0, 5) }));

let detailOk = false;
if (links.length) {
  const href = links.find((h) => /\/app\/bbs\/link\/\d+/.test(h)) || links[0];
  try {
    const popupPromise = context.waitForEvent('page', { timeout: 8000 }).catch(() => null);
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
