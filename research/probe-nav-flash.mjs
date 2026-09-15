/**
 * 现场取证：换路由时的「白闪」面积与时长。
 *
 *   node research/probe-nav-flash.mjs
 *
 * 在真实站点上从首页点进帖子（连续两次，覆盖「首页 -> 详情 -> 返回 -> 另一个详情」），
 * 用页面内 rAF 密集网格逐帧统计「浅色面积占比」，并记录当时是谁在画那块浅色。
 *
 * 修复前（0.3.5）实测：
 *   帧数 218，浅色占比 >2% 的帧 16
 *   白闪区间: t=602ms -> t=1385ms（≈783ms）
 *   峰值: frac=0.412 maxL=255 culprit=div.hb-cpt-page-header hb-bbs-link__header
 *   同期 scanned 停在 4739（引擎还没重建），说明画的是站点新分片里的原始浅色
 *
 * 修复后（0.3.6）实测：浅色帧 0，峰值 frac=0 maxL=43（卡片色）。
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const cliRoot = path.join(process.env.APPDATA || '', 'npm/node_modules/@playwright/cli');
const { chromium } = require(path.join(cliRoot, 'node_modules/playwright'));

const exe =
  process.env.CHROME_PATH ||
  path.join(process.env.LOCALAPPDATA || '', 'ms-playwright/chromium-1234/chrome-win64/chrome.exe');

const userscript = fs.readFileSync(path.resolve('dist/xiaoheihe-dark-mode.user.js'), 'utf8');
const code = userscript.replace(/^\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==\s*/, '');

const browser = await chromium.launch({ headless: true, executablePath: exe });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  locale: 'zh-CN',
  userAgent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
});
await context.addInitScript(() => { try { localStorage.setItem('heybox-dark-mode', '1'); } catch (_) {} });
await context.addInitScript(code);
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));

/** 一次导航的采样器：网格逐帧统计最上层不透明背景的亮度 */
const START_SAMPLER = () => {
  window.__f = [];
  const xs = [];
  const ys = [];
  for (let x = 30; x < innerWidth; x += 60) xs.push(x);
  for (let y = 20; y < innerHeight; y += 50) ys.push(y);
  const parse = (s) => {
    const m = String(s).match(/rgba?\(([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?/);
    return m ? { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] } : null;
  };
  const lum = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  const t0 = performance.now();
  const sample = () => {
    let light = 0;
    let total = 0;
    let culprit = null;
    let maxL = -1;
    for (const y of ys) {
      for (const x of xs) {
        total++;
        for (const el of document.elementsFromPoint(x, y)) {
          const cs = getComputedStyle(el);
          const c = parse(cs.backgroundColor);
          if (!c || c.a <= 0.5) continue;
          const L = lum(c);
          if (L > maxL) maxL = L;
          if (L > 150) {
            light++;
            if (!culprit) culprit = el.tagName.toLowerCase() + '.' + String(el.className).slice(0, 40);
          }
          break;
        }
      }
    }
    const s = window.__hbEngineStats ? window.__hbEngineStats() : null;
    window.__f.push({
      t: Math.round(performance.now() - t0),
      frac: +(light / total).toFixed(3),
      maxL: Math.round(maxL),
      culprit,
      scanned: s ? s.scanned : -1,
      path: location.pathname,
    });
    if (performance.now() - t0 < 4000) requestAnimationFrame(sample);
  };
  requestAnimationFrame(sample);
};

const runs = [];
async function navigate(label, nth) {
  // 无头浏览器下详情页会撞腾讯验证码的整屏遮罩，它会挡住点击 —— 属自动化环境产物，
  // 与主题无关，这里先摘掉它，避免把「点不动」误报成「白闪」。
  await page.evaluate(() => {
    document.querySelectorAll('#t_mask, .t-mask, #tcaptcha_iframe, .tcaptcha-transform').forEach((el) => el.remove());
  });
  await page.evaluate(START_SAMPLER);
  await page.locator('a[href*="/app/bbs/link/"] .bbs-content__title').nth(nth).click({ noWaitAfter: true });
  await page.waitForTimeout(4200);
  const frames = await page.evaluate(() => window.__f);
  const bad = frames.filter((f) => f.frac > 0.02);
  const peak = frames.reduce((a, f) => (f.frac > a.frac ? f : a), frames[0]);
  const run = {
    label,
    frames: frames.length,
    lightFrames: bad.length,
    window: bad.length ? `${bad[0].t}ms -> ${bad[bad.length - 1].t}ms` : '-',
    peak: { t: peak.t, frac: peak.frac, maxL: peak.maxL, culprit: peak.culprit },
    landedPath: frames[frames.length - 1].path,
  };
  runs.push(run);
  console.log(JSON.stringify(run));
  return bad.length === 0;
}

const HOME = 'https://www.xiaoheihe.cn/app/bbs/home';
const results = [];
for (const [nth, label] of [
  [0, '首页 -> 详情（首次访问，分片需联网加载）'],
  [2, '重新加载首页 -> 另一个详情（分片已缓存）'],
]) {
  await page.goto(HOME, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(7000);
  results.push(await navigate(label, nth));
}

await browser.close();
const pass = results.every(Boolean) && errors.length === 0;
console.log(`\n报错：${errors.length ? errors.join(' | ') : '无'}`);
console.log(`\n########## 白闪取证：${pass ? '未检出白闪 ✅' : '仍存在白闪 ❌'} ##########`);
process.exit(pass ? 0 : 1);
