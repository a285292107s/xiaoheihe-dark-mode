/**
 * 本地预览回归测试：用 route 拦截代替起服务器，测 index.html 的深色覆盖度。
 * node scripts/preview-test.mjs
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const cliRoot = path.join(process.env.APPDATA || '', 'npm/node_modules/@playwright/cli');
const { chromium } = require(path.join(cliRoot, 'node_modules/playwright'));

const root = path.resolve('.');
const outDir = path.resolve('output/playwright');
fs.mkdirSync(outDir, { recursive: true });

const exe =
  process.env.CHROME_PATH ||
  path.join(process.env.LOCALAPPDATA || '', 'ms-playwright/chromium-1234/chrome-win64/chrome.exe');

const ORIGIN = 'http://hb.local';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

const browser = await chromium.launch({ headless: true, executablePath: exe });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  locale: 'zh-CN',
});

// 拦截本地源，直接读盘；外部 CDN 放行走网络
await context.route('**/*', async (route) => {
  const url = new URL(route.request().url());
  if (url.origin !== ORIGIN) return route.continue();
  const rel = decodeURIComponent(url.pathname).replace(/^\//, '');
  const file = path.join(root, rel);
  if (!file.startsWith(root) || !fs.existsSync(file)) {
    return route.fulfill({ status: 404, body: 'not found' });
  }
  route.fulfill({
    status: 200,
    contentType: MIME[path.extname(file)] || 'application/octet-stream',
    body: fs.readFileSync(file),
  });
});

const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});

await page.goto(`${ORIGIN}/index.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(5000);

async function measure(label) {
  const m = await page.evaluate(() => {
    const isDark = document.documentElement.classList.contains('heybox-dark');
    let light = 0;
    const samples = [];
    for (const el of document.querySelectorAll('#hb-stage *')) {
      const cs = getComputedStyle(el);
      const bg = cs.backgroundColor;
      if (!bg || bg === 'transparent' || bg === 'rgba(0, 0, 0, 0)') continue;
      const mm = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (!mm) continue;
      const [r, g, b] = [+mm[1], +mm[2], +mm[3]];
      const w = el.getBoundingClientRect().width;
      const h = el.getBoundingClientRect().height;
      if (w < 30 || h < 16) continue;
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      if (lum > 200) {
        light++;
        if (samples.length < 10) {
          samples.push({
            tag: el.tagName.toLowerCase(),
            class: (typeof el.className === 'string' ? el.className : '').slice(0, 90),
            bg,
          });
        }
      }
    }
    // 深色背景上的深色文字（看不清）
    let lowContrastText = 0;
    const textSamples = [];
    for (const el of document.querySelectorAll('#hb-stage *')) {
      if (el.children.length > 2) continue;
      const text = (el.textContent || '').trim();
      if (text.length < 2) continue;
      const cs = getComputedStyle(el);
      const cm = cs.color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (!cm) continue;
      const [r, g, b] = [+cm[1], +cm[2], +cm[3]];
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const bgm = cs.backgroundColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      const bgl = bgm ? 0.2126 * +bgm[1] + 0.7152 * +bgm[2] + 0.0722 * +bgm[3] : 15;
      if (lum < 90 && bgl < 90) {
        lowContrastText++;
        if (textSamples.length < 8) {
          textSamples.push({
            tag: el.tagName.toLowerCase(),
            class: (typeof el.className === 'string' ? el.className : '').slice(0, 80),
            color: cs.color,
            text: text.slice(0, 24),
          });
        }
      }
    }
    // 浅色渐变背景（backgroundColor 透明但 backgroundImage 是浅色渐变）
    let lightGradients = 0;
    const gradientSamples = [];
    for (const el of document.querySelectorAll('#hb-stage *')) {
      const cs = getComputedStyle(el);
      const bi = cs.backgroundImage;
      if (!bi || bi === 'none' || !bi.includes('gradient')) continue;
      const w = el.getBoundingClientRect().width;
      const h = el.getBoundingClientRect().height;
      if (w < 60 || h < 24) continue;
      const colors = bi.match(/rgba?\([^)]+\)/g) || [];
      let lightStops = 0;
      for (const c of colors) {
        const mm = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/);
        if (!mm) continue;
        const a = mm[4] === undefined ? 1 : parseFloat(mm[4]);
        if (a < 0.3) continue;
        const l = 0.2126 * +mm[1] + 0.7152 * +mm[2] + 0.0722 * +mm[3];
        if (l > 200) lightStops++;
      }
      if (lightStops >= Math.max(1, Math.ceil(colors.length / 2))) {
        lightGradients++;
        if (gradientSamples.length < 8) {
          gradientSamples.push({
            tag: el.tagName.toLowerCase(),
            class: (typeof el.className === 'string' ? el.className : '').slice(0, 80),
            image: bi.slice(0, 120),
          });
        }
      }
    }

    return {
      isDark,
      light,
      samples,
      lowContrastText,
      textSamples,
      lightGradients,
      gradientSamples,
    };
  });
  const shot = path.join(outDir, `preview-${label}.png`);
  await page.screenshot({ path: shot });
  return { label, shot, ...m };
}

const results = [];

// 首页
results.push(await measure('home-light'));
await page.click('#hb-theme');
await page.waitForTimeout(2500);
results.push(await measure('home-dark'));

// 详情页
await page.click('#hb-bar [data-page="detail"]');
await page.waitForTimeout(3500);
results.push(await measure('detail-dark'));
await page.click('#hb-theme');
await page.waitForTimeout(2000);
results.push(await measure('detail-light'));

console.log(JSON.stringify({ errors: errors.slice(0, 10), results }, null, 2));
await browser.close();
console.log('DONE');
