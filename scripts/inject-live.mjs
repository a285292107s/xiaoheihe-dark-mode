/**
 * 将油猴脚本注入小黑盒详情页，截取浅色/深色实际效果。
 * node scripts/inject-live.mjs [url]
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const cliRoot = path.join(process.env.APPDATA || '', 'npm/node_modules/@playwright/cli');
const { chromium } = require(path.join(cliRoot, 'node_modules/playwright'));

const outDir = path.resolve('output/playwright');
fs.mkdirSync(outDir, { recursive: true });

const userscriptPath = path.resolve('dist/xiaoheihe-dark-mode.user.js');
const userscript = fs.readFileSync(userscriptPath, 'utf8');
const code = userscript.replace(/^\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==\s*/, '');

const DEFAULT_TARGET = 'https://www.xiaoheihe.cn/app/bbs/home';
const TARGET = process.argv[2] || DEFAULT_TARGET;
const TAG = (() => {
  try {
    const u = new URL(TARGET);
    const parts = u.pathname.split('/').filter(Boolean);
    return parts.slice(2).join('-') || 'home';
  } catch {
    return 'page';
  }
})();

const exe =
  process.env.CHROME_PATH ||
  path.join(process.env.LOCALAPPDATA || '', 'ms-playwright/chromium-1234/chrome-win64/chrome.exe');

const browser = await chromium.launch({ headless: true, executablePath: exe });

async function capture(mode) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'zh-CN',
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  });

  await context.addInitScript((args) => {
    window.GM_addStyle = (css) => {
      const el = document.createElement('style');
      el.textContent = css;
      const parent = document.head || document.documentElement;
      if (parent) parent.appendChild(el);
      else {
        document.addEventListener(
          'DOMContentLoaded',
          () => (document.head || document.documentElement).appendChild(el),
          { once: true },
        );
      }
    };
    try {
      localStorage.setItem('heybox-dark-mode', args.mode === 'dark' ? '1' : '0');
    } catch (_) {}
  }, { mode });

  await context.addInitScript(code);

  const page = await context.newPage();
  const consoleErrors = [];
  page.on('pageerror', (err) => consoleErrors.push(String(err)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  await page.goto(TARGET, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(4000);

  // 尝试关闭腾讯验证码弹层（若存在），便于看到页面本体
  try {
    const closeBtn = page.locator(
      '.tcaptcha-transform button, .tcaptcha-transform .tc-fg-item, [class*="tcaptcha"] [aria-label], [class*="tcaptcha"] .close, .tcaptcha .tc-close',
    );
    // 常见关闭：右上角 ×
    const x = page.locator('.tcaptcha-transform').locator('button, [role="button"], .tc-icon-item').last();
    if (await x.count()) {
      await x.click({ force: true, timeout: 2000 }).catch(() => {});
    }
    // 直接点遮罩外或关闭图标
    await page.keyboard.press('Escape').catch(() => {});
  } catch (_) {}
  await page.waitForTimeout(2500);

  const shot = path.join(outDir, `${TAG}-${mode}.png`);
  await page.screenshot({ path: shot, fullPage: false });

  const metrics = await page.evaluate(() => {
    const root = document.documentElement;
    const host = document.getElementById('heybox-dark-mode-root');
    const shadow = host?.shadowRoot;
    const toggle =
      document.getElementById('heybox-dark-toggle') ||
      shadow?.querySelector('#heybox-dark-toggle') ||
      null;
    const body = getComputedStyle(document.body);

    const sampleVar = (name) =>
      getComputedStyle(root).getPropertyValue(name).trim() || null;

    // 统计仍偏白的表面
    const whiteSurfaces = [];
    for (const el of document.querySelectorAll('body *')) {
      if (whiteSurfaces.length > 40) break;
      const cs = getComputedStyle(el);
      const bg = cs.backgroundColor;
      if (!bg || bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') continue;
      const m = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (!m) continue;
      const [, r, g, b] = m.map(Number);
      const rct = el.getBoundingClientRect();
      if (r > 230 && g > 230 && b > 230 && rct.width > 40 && rct.height > 20) {
        const cls = typeof el.className === 'string' ? el.className : '';
        whiteSurfaces.push({
          tag: el.tagName.toLowerCase(),
          class: cls.slice(0, 120) || undefined,
          bg,
          w: Math.round(rct.width),
          h: Math.round(rct.height),
        });
      }
    }

    // 文字对比度抽样：标题/正文
    const textSamples = [];
    const candidates = document.querySelectorAll(
      'h1,h2,h3,h4,p,span,div,a',
    );
    for (const el of candidates) {
      if (textSamples.length >= 12) break;
      const rct = el.getBoundingClientRect();
      if (rct.width < 40 || rct.height < 12) continue;
      const text = (el.textContent || '').trim();
      if (!text || text.length < 4 || el.children.length > 3) continue;
      const cs = getComputedStyle(el);
      const color = cs.color;
      const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (!m) continue;
      const [, r, g, b] = m.map(Number);
      // 只采样偏暗的文字（在深色下可能不可读）
      if (r < 100 && g < 100 && b < 100) {
        const cls = typeof el.className === 'string' ? el.className : '';
        textSamples.push({
          tag: el.tagName.toLowerCase(),
          class: cls.slice(0, 80) || undefined,
          color,
          text: text.slice(0, 30),
        });
      }
    }

    return {
      title: document.title,
      url: location.href,
      isDark: root.classList.contains('heybox-dark'),
      bodyBg: body.backgroundColor,
      bodyColor: body.color,
      vars: {
        primary: sampleVar('--hb-primary'),
        white100: sampleVar('--hb-white-100'),
        elBg: sampleVar('--el-bg-color'),
        elPage: sampleVar('--el-bg-color-page'),
        elText: sampleVar('--el-text-color-primary'),
      },
      toggleExists: !!toggle,
      whiteSurfaceCount: whiteSurfaces.length,
      whiteSurfaces: whiteSurfaces.slice(0, 20),
      darkTextCount: textSamples.length,
      darkTextSamples: textSamples,
    };
  });

  let shotAfterToggle = null;
  if (mode === 'light') {
    try {
      await page.click('#heybox-dark-toggle', { timeout: 5000, force: true });
      await page.waitForTimeout(800);
      shotAfterToggle = path.join(outDir, `${TAG}-light-toggled-to-dark.png`);
      await page.screenshot({ path: shotAfterToggle, fullPage: false });
      metrics.afterToggle = await page.evaluate(() => ({
        isDark: document.documentElement.classList.contains('heybox-dark'),
        bodyBg: getComputedStyle(document.body).backgroundColor,
      }));
    } catch (e) {
      metrics.toggleClickError = String(e);
    }
  }

  console.log(JSON.stringify({ mode, shot, shotAfterToggle, consoleErrors, metrics }, null, 2));
  await context.close();
}

for (const mode of ['light', 'dark']) {
  await capture(mode);
}

await browser.close();
console.log('DONE');
