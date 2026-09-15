/**
 * 定位大块「可疑底色」。
 *
 * 不猜坐标：先取关键容器（信息流卡片、右栏）的真实盒模型，
 * 算出租隙中点，再在该点取样；同时枚举全页所有「面积大且不透明」的背景，
 * 按颜色分组，找出不属于「画布 / 卡片」两个预期色调的大色块。
 *
 *   node research/probe-slabs.mjs
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

const WIDTHS = (process.argv[2] || '1440,1536,1728,1920').split(',').map(Number);

const SURVEY = () => {
  const desc = (el) => {
    if (!el || el.nodeType !== 1) return 'none';
    const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
    return el.tagName.toLowerCase() + (cls ? '.' + cls : '');
  };
  const chain = (el, max = 6) => {
    const out = [];
    let n = el;
    let i = 0;
    while (n && n.nodeType === 1 && i++ < max) {
      out.push(`${desc(n)}=${getComputedStyle(n).backgroundColor}`);
      n = n.parentElement;
    }
    return out;
  };

  const boxOf = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { sel, left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom), w: Math.round(r.width) };
  };

  const feed = boxOf('.hb-cpt__scroll-list');
  const rail = boxOf('.cpt-right-side') || boxOf('.dynamic-content');

  const gapPoint = feed && rail && rail.left > feed.right
    ? Math.round((feed.right + rail.left) / 2)
    : null;
  const gapSample = gapPoint !== null
    ? { x: gapPoint, y: Math.max(200, Math.min(400, window.innerHeight - 200)), chain: chain(document.elementFromPoint(gapPoint, 300)) }
    : null;

  // 全页大块不透明背景
  const slabs = new Map();
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (r.width * r.height < 15000) continue;
    const bg = cs.backgroundColor;
    if (!bg || bg === 'rgba(0, 0, 0, 0)') continue;
    const key = bg;
    const prev = slabs.get(key) || { bg, count: 0, maxArea: 0, samples: [] };
    prev.count++;
    const area = r.width * r.height;
    if (area > prev.maxArea) {
      prev.maxArea = area;
      prev.samples.unshift(`${desc(el)} ${Math.round(r.width)}x${Math.round(r.height)} @${Math.round(r.left)},${Math.round(r.top)}`);
      prev.samples = prev.samples.slice(0, 4);
    }
    slabs.set(key, prev);
  }

  return {
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    htmlBg: getComputedStyle(document.documentElement).backgroundColor,
    bodyBg: getComputedStyle(document.body).backgroundColor,
    feed, rail, gapPoint, gapSample,
    slabs: [...slabs.values()].sort((a, b) => b.maxArea - a.maxArea).slice(0, 12),
  };
};

/** 搜索区专项：列出搜索栏及其祖先/兄弟的背景与盒模型 */
const SEARCH_SURVEY = () => {
  const desc = (el) => {
    if (!el || el.nodeType !== 1) return 'none';
    const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
    return el.tagName.toLowerCase() + (cls ? '.' + cls : '');
  };
  const info = (el) => {
    if (!el) return null;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      sel: desc(el),
      bg: cs.backgroundColor,
      bgImage: cs.backgroundImage === 'none' ? null : cs.backgroundImage.slice(0, 60),
      box: `${Math.round(r.width)}x${Math.round(r.height)} @${Math.round(r.left)},${Math.round(r.top)}`,
      radius: cs.borderRadius,
    };
  };
  const input = document.querySelector('.el-input__wrapper') || document.querySelector('input');
  const out = { input: info(input) };
  if (input) {
    // 祖先链（搜索区容器往往在这里）
    const anc = [];
    let n = input.parentElement;
    let i = 0;
    while (n && n !== document.body && i++ < 6) {
      anc.push(info(n));
      n = n.parentElement;
    }
    out.ancestors = anc;
    // 输入框左右两侧的兄弟/邻域取样（“搜索栏外部”的那块）
    const r = input.getBoundingClientRect();
    const y = Math.round(r.top + r.height / 2);
    const probes = [
      ['输入的左外侧', Math.max(2, Math.round(r.left - 60)), y],
      ['输入的右外侧', Math.min(window.innerWidth - 3, Math.round(r.right + 60)), y],
      ['输入上方', Math.round(r.left + r.width / 2), Math.max(2, Math.round(r.top - 20))],
      ['输入下方', Math.round(r.left + r.width / 2), Math.round(r.bottom + 20)],
    ];
    out.neighbours = probes.map(([label, x, yy]) => {
      const el = document.elementFromPoint(x, yy);
      const cs = el ? getComputedStyle(el) : null;
      return { label, at: `${x},${yy}`, hit: desc(el), bg: cs ? cs.backgroundColor : null };
    });
  }
  return out;
};

const browser = await chromium.launch({ headless: true, executablePath: exe });

for (const width of WIDTHS) {
  const context = await browser.newContext({
    viewport: { width, height: 900 },
    locale: 'zh-CN',
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  });
  await context.addInitScript(() => {
    try { localStorage.setItem('heybox-dark-mode', '1'); } catch (_) {}
  });
  await context.addInitScript(code);

  const page = await context.newPage();
  await page.goto('https://www.xiaoheihe.cn/app/bbs/home', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(7000);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(1500);

  // 先看浅色下的搜索区（作为对照）
  await page.evaluate(() => window.__hbSetDark(false));
  await page.waitForTimeout(1200);
  const searchLight = await page.evaluate(SEARCH_SURVEY);
  await page.evaluate(() => window.__hbSetDark(true));
  await page.waitForTimeout(1800);
  const searchDark = await page.evaluate(SEARCH_SURVEY);

  const r = await page.evaluate(SURVEY);
  console.log(`\n########## ${width} -> ${r.viewport} ##########`);
  console.log(`html=${r.htmlBg}  body=${r.bodyBg}`);
  console.log(`feed=${JSON.stringify(r.feed)}`);
  console.log(`rail=${JSON.stringify(r.rail)}  gapPoint=${r.gapPoint}`);
  if (r.gapSample) console.log(`  租隙取样链: ${r.gapSample.chain.join(' < ')}`);
  console.log('  大块背景:');
  for (const s of r.slabs) {
    console.log(`    ${s.bg.padEnd(24)} x${String(s.count).padStart(3)}  maxArea=${Math.round(s.maxArea).toString().padStart(8)}  ${s.samples[0] || ''}`);
  }
  console.log('  --- 搜索区：浅色 ---');
  console.log('    input: ' + JSON.stringify(searchLight.input));
  (searchLight.ancestors || []).forEach((a) => console.log('    anc:   ' + JSON.stringify(a)));
  (searchLight.neighbours || []).forEach((nb) => console.log(`    nbr:   ${nb.label} @${nb.at} -> ${nb.hit} bg=${nb.bg}`));
  console.log('  --- 搜索区：深色 ---');
  console.log('    input: ' + JSON.stringify(searchDark.input));
  (searchDark.ancestors || []).forEach((a) => console.log('    anc:   ' + JSON.stringify(a)));
  (searchDark.neighbours || []).forEach((nb) => console.log(`    nbr:   ${nb.label} @${nb.at} -> ${nb.hit} bg=${nb.bg}`));

  await page.screenshot({ path: path.resolve(`output/probe/slab-${width}-dark.png`) });
  // 搜索区局部放大图，便于肉眼确认
  const box = searchDark.input;
  if (box) {
    const m = box.box.match(/(\d+)x(\d+) @(-?\d+),(-?\d+)/);
    if (m) {
      await page.screenshot({
        path: path.resolve(`output/probe/slab-${width}-search.png`),
        clip: {
          x: Math.max(0, +m[3] - 120),
          y: Math.max(0, +m[4] - 60),
          width: Math.min(width, +m[1] + 240),
          height: Math.min(400, +m[2] + 120),
        },
      });
    }
  }
  await context.close();
}

await browser.close();
console.log('\nDONE');
