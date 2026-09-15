/**
 * 交互式真站验收：遇到验证码会停下来等待人工填写，填完自动继续。
 *
 * 用法（后台运行）：node scripts/verify-interactive.mjs
 * 进度写进 output/playwright/session-status.json，可轮询。
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

const STATUS = path.join(outDir, 'session-status.json');
const RESULT = path.join(outDir, 'interactive-result.json');

function writeStatus(obj) {
  fs.writeFileSync(STATUS, JSON.stringify({ at: new Date().toISOString(), ...obj }, null, 2));
}

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
});
await context.addInitScript(code);

const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

const hasCaptcha = () =>
  page.evaluate(() =>
    !!document.querySelector('.tcaptcha-transform, [class*="tcaptcha"]'),
  );

async function waitForCaptchaSolved(maxMs = 8 * 60 * 1000) {
  const start = Date.now();
  let announced = false;
  while (Date.now() - start < maxMs) {
    if (!(await hasCaptcha())) return true;
    if (!announced) {
      announced = true;
      writeStatus({
        state: 'captcha',
        message: '页面出现安全验证，请在打开的 Chrome 窗口里完成验证，完成后会自动继续。',
        url: page.url(),
      });
    }
    await page.waitForTimeout(2000);
  }
  return false;
}

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
          const r = el.getBoundingClientRect();
          if (r.width > 30 && r.height > 16) {
            const l = 0.2126 * +m[1] + 0.7152 * +m[2] + 0.0722 * +m[3];
            if (l > 200) {
              light++;
              if (samples.length < 8) {
                samples.push({
                  tag: el.tagName.toLowerCase(),
                  class: (typeof el.className === 'string' ? el.className : '').slice(0, 80),
                  bg,
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
    };
  });

const results = {};

try {
  writeStatus({ state: 'navigating', message: '正在打开首页' });
  await page.goto('https://www.xiaoheihe.cn/app/bbs/home', {
    waitUntil: 'domcontentloaded',
    timeout: 90000,
  });
  await page.waitForTimeout(7000);
  if (await hasCaptcha()) {
    const ok = await waitForCaptchaSolved();
    if (!ok) throw new Error('验证码未在限时内完成');
  }
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(outDir, 'int-home-dark.png') });
  results.home = await measure();

  // 进入详情页
  const href = await page.evaluate(() => {
    const a = document.querySelector('a[href*="/app/bbs/link/"]');
    return a ? a.getAttribute('href') : null;
  });
  writeStatus({ state: 'detail', message: `正在打开帖子 ${href}`, href });

  if (href) {
    await page.evaluate((h) => {
      const a = [...document.querySelectorAll('a[href*="/app/bbs/link/"]')].find(
        (x) => x.getAttribute('href') === h,
      );
      if (a) a.click();
    }, href);
    await page.waitForTimeout(8000);

    if (await hasCaptcha()) {
      const ok = await waitForCaptchaSolved();
      if (!ok) throw new Error('验证码未在限时内完成');
    }
    await page.waitForTimeout(5000);

    // 滚动加载正文与评论
    writeStatus({ state: 'scrolling', message: '正在滚动加载正文与评论' });
    await page.evaluate(async () => {
      for (let i = 0; i < 16; i++) {
        window.scrollBy(0, 800);
        await new Promise((r) => setTimeout(r, 320));
      }
    });
    await page.waitForTimeout(3000);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(4500);

    await page.screenshot({ path: path.join(outDir, 'int-detail-dark.png') });
    await page.screenshot({
      path: path.join(outDir, 'int-detail-dark-full.png'),
      fullPage: true,
    });
    results.detail = await measure();

    // 保存完整详情页 DOM 作为 fixture
    const html = await page.evaluate(() => {
      const clone = document.documentElement.cloneNode(true);
      clone.querySelectorAll('script, noscript').forEach((s) => s.remove());
      return '<!DOCTYPE html>\n' + clone.outerHTML;
    });
    fs.writeFileSync(path.join(fixtureDir, 'detail-full.html'), html, 'utf8');
    results.detailFixtureBytes = html.length;

    // 切回浅色，确认可逆
    await page.evaluate(() => window.__hbSetDark && window.__hbSetDark(false));
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(outDir, 'int-detail-light.png') });
    results.detailLightRestored = await measure();
  }

  results.errors = errors.slice(0, 10);
  fs.writeFileSync(RESULT, JSON.stringify(results, null, 2));
  writeStatus({ state: 'done', message: '验收完成', result: RESULT });
} catch (e) {
  fs.writeFileSync(RESULT, JSON.stringify({ ...results, fatal: String(e) }, null, 2));
  writeStatus({ state: 'error', message: String(e) });
  await page.screenshot({ path: path.join(outDir, 'int-error.png') }).catch(() => {});
}

// 留一点时间给人工查看，然后关闭
await page.waitForTimeout(8000);
await browser.close();
console.log('DONE');
