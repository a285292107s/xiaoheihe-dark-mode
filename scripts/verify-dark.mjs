/**
 * 深色模式验收：直接加载 dist 里的 userscript，在真实页面上量化 + 出图。
 *
 *   node scripts/verify-dark.mjs            # 首页 + 详情页
 *   node scripts/verify-dark.mjs home       # 只跑首页
 *
 * 验收指标：
 *   - 浅色表面数（面积 > 40x20 且亮度 > 200）  -> 期望 0
 *   - 低对比文本数（前景与最近不透明背景对比 < 3.2，含 background-image 兜底）-> 期望 0
 *   - 引擎构建耗时 / 扫描规则数 / 改动规则数
 *   - 关闭深色后能否还原成浅色（验证 revert 逻辑）
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

const distFile = path.resolve('dist/xiaoheihe-dark-mode.user.js');
const userscript = fs.readFileSync(distFile, 'utf8');
const code = userscript.replace(/^\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==\s*/, '');

const outDir = path.resolve('output/verify');
fs.mkdirSync(outDir, { recursive: true });

const TARGETS = [
  { name: 'home', url: 'https://www.xiaoheihe.cn/app/bbs/home' },
  { name: 'detail', url: 'https://www.xiaoheihe.cn/app/bbs/link/189860812' },
];
const only = process.argv[2];
const targets = only ? TARGETS.filter((t) => t.name === only) : TARGETS;

/**
 * 页面内测量函数：浅色表面 / 低对比文本 / 中间调泥泞色块
 *
 * 「泥泞中间调」这个指标是补盲的：只看「背景亮度 > 200」会漏掉
 * 把页面底色 #f7f8f9 错映射成 rgb(55,64,74) 这类 bug ——
 * 它既不够亮（不触发浅色表面），又比画布和卡片都灰，
 * 在信息流分隔条和整屏固定色带上表现为突兀的灰色色块。
 *
 * 深色主题只应有两级表面：画布（亮度 ~15）与卡片（亮度 ~43）。
 * 任何面积可观、亮度落在 55~140、彩度又低（< 32）的背景都属异常。
 *
 * 同时**必须覆盖伪元素**：站点大量底纹是 ::before/::after，
 * 只看元素会完全看不见它们。
 */
const MUDDY_MIN_LUM = 55;
const MUDDY_MAX_LUM = 140;
const MUDDY_MAX_CHROMA = 32;
const MUDDY_MIN_AREA = 800;

const MEASURE = () => {
  const parse = (s) => {
    const m = String(s).match(/rgba?\(([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?/);
    if (!m) return null;
    return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] };
  };
  const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const relLum = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
  const lum255 = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  const contrast = (a, b) => {
    const l1 = relLum(a), l2 = relLum(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  };
  const hasImageBg = (cs) => {
    const bi = cs.backgroundImage;
    return !!bi && bi !== 'none';
  };
  const behindOf = (el) => {
    let n = el.parentElement;
    while (n && n !== document.documentElement) {
      const cs = getComputedStyle(n);
      const c = parse(cs.backgroundColor);
      if (c && c.a > 0.5) return c;
      n = n.parentElement;
    }
    return { r: 14, g: 17, b: 22, a: 1 };
  };
  const desc = (el) => {
    const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
    return el.tagName.toLowerCase() + (cls ? '.' + cls : '');
  };

  let lightSurfaces = 0;
  let lowContrast = 0;
  let muddy = 0;
  const samples = [];
  const muddySamples = [];

  const checkMuddy = (label, bgStr, area) => {
    const c = parse(bgStr);
    if (!c || c.a <= 0.5) return;
    if (area < 800) return;
    const L = lum255(c);
    if (L < 55 || L > 140) return;
    const chroma = Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b);
    if (chroma >= 32) return;
    muddy++;
    if (muddySamples.length < 10) muddySamples.push({ label, bg: bgStr, lum: Math.round(L), chroma, area: Math.round(area) });
  };

  for (const el of document.querySelectorAll('body *')) {
    if (el.closest('[data-hb-own]')) continue;
    const r = el.getBoundingClientRect();
    const area = r.width * r.height;
    if (r.width < 40 || r.height < 20) continue;
    const cs = getComputedStyle(el);
    const own = parse(cs.backgroundColor);
    const ownOpaque = own && own.a > 0.5;

    if (ownOpaque && relLum(own) > (200 / 255) * 0.9) {
      lightSurfaces++;
      if (samples.length < 8) {
        samples.push({ tag: el.tagName.toLowerCase(), cls: String(el.className).slice(0, 60), bg: cs.backgroundColor });
      }
    }

    checkMuddy(desc(el), cs.backgroundColor, area);

    // 伪元素：站点的底纹/分隔条大量藏在这里，只看元素会漏
    for (const pseudo of ['::before', '::after']) {
      const ps = getComputedStyle(el, pseudo);
      if (!ps || ps.content === 'none' || ps.display === 'none') continue;
      if (ps.backgroundColor && ps.backgroundColor !== 'rgba(0, 0, 0, 0)') {
        checkMuddy(`${desc(el)}${pseudo}`, ps.backgroundColor, area);
      }
    }

    const hasOwnText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 0);
    if (!hasOwnText || hasImageBg(cs)) continue;
    const fg = parse(cs.color);
    if (!fg || fg.a < 0.3) continue;
    const behind = ownOpaque ? own : behindOf(el);
    if (contrast(fg, behind) < 3.2) lowContrast++;
  }

  // 已知的整屏底色层：必须等于画布色，不能是中间调
  const fixedLayers = [];
  for (const [sel, pseudo] of [
    ['#page-bbs-community', '::before'],
    ['#page-bbs-community', '::after'],
    ['.hb-bbs-home__splitline', '::after'],
    ['.hb-bbs-home__feed-splitline', '::after'],
  ]) {
    const el = document.querySelector(sel);
    if (!el) continue;
    const ps = getComputedStyle(el, pseudo);
    fixedLayers.push({ sel: sel + pseudo, bg: ps.backgroundColor, content: ps.content });
  }

  return {
    lightSurfaces,
    lowContrast,
    muddy,
    muddySamples,
    fixedLayers,
    samples,
    nodes: document.querySelectorAll('body *').length,
    darkClass: document.documentElement.classList.contains('hb-dark'),
    htmlBg: getComputedStyle(document.documentElement).backgroundColor,
  };
};

const browser = await chromium.launch({ headless: true, executablePath: exe });
const results = [];

for (const t of targets) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    locale: 'zh-CN',
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  });
  // 预置偏好为深色，与真实用户第一次打开脚本后的状态一致
  await context.addInitScript(() => {
    try { localStorage.setItem('heybox-dark-mode', '1'); } catch (_) {}
  });
  await context.addInitScript(code);

  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });

  await page.goto(t.url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(7000);
  await page.evaluate(async () => {
    for (let i = 0; i < 5; i++) { window.scrollBy(0, 800); await new Promise((r) => setTimeout(r, 350)); }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(2500);

  const dark = await page.evaluate(MEASURE);
  const stats = await page.evaluate(() => (window.__hbEngineStats ? window.__hbEngineStats() : null));
  const cssInfo = await page.evaluate(() => (window.__hbEngineCss ? window.__hbEngineCss() : null));
  await page.screenshot({ path: path.join(outDir, `${t.name}-dark.png`) });

  // 关闭深色，验证可还原
  await page.evaluate(() => { window.__hbSetDark(false); });
  await page.waitForTimeout(1500);
  const light = await page.evaluate(MEASURE);
  await page.screenshot({ path: path.join(outDir, `${t.name}-light-after-toggle.png`) });

  // 再打开，验证可来回切换
  await page.evaluate(() => { window.__hbSetDark(true); });
  await page.waitForTimeout(1500);
  const dark2 = await page.evaluate(MEASURE);

  const row = {
    page: t.name,
    url: t.url,
    stats,
    cssBytes: cssInfo ? cssInfo.bytes : null,
    dark: {
      lightSurfaces: dark.lightSurfaces,
      lowContrast: dark.lowContrast,
      muddy: dark.muddy,
      nodes: dark.nodes,
      htmlBg: dark.htmlBg,
      darkClass: dark.darkClass,
    },
    muddySamples: dark.muddySamples,
    fixedLayers: dark.fixedLayers,
    lightAfterDisable: { lightSurfaces: light.lightSurfaces, lowContrast: light.lowContrast, darkClass: light.darkClass },
    darkAgain: { lightSurfaces: dark2.lightSurfaces, lowContrast: dark2.lowContrast, muddy: dark2.muddy, darkClass: dark2.darkClass },
    lightSurfaceSamples: dark.samples,
    errors: [...new Set(errors)].slice(0, 6),
  };
  results.push(row);

  const pass =
    row.dark.lightSurfaces === 0 &&
    row.dark.lowContrast === 0 &&
    row.dark.muddy === 0 &&
    row.dark.darkClass === true &&
    row.lightAfterDisable.darkClass === false &&
    row.lightAfterDisable.lightSurfaces > 0 &&
    row.darkAgain.lightSurfaces === 0 &&
    row.darkAgain.muddy === 0 &&
    row.errors.length === 0;
  row.pass = pass;

  console.log(`\n===== ${t.name} ===== ${pass ? 'PASS ✅' : 'FAIL ❌'}`);
  console.log(JSON.stringify(row, null, 1));

  await context.close();
}

fs.writeFileSync(path.join(outDir, 'verify-result.json'), JSON.stringify(results, null, 2), 'utf8');
await browser.close();
const allPass = results.every((r) => r.pass);
console.log(`\n########## 验收结果：${allPass ? '全部通过 ✅' : '存在失败 ❌'} ##########`);
console.log(`截图与报告：output/verify/`);
process.exit(allPass ? 0 : 1);
