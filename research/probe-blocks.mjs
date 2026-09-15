/**
 * 定位「奇怪灰色色块」：在指定坐标上取元素链，对比浅色/深色两态的背景色，
 * 找出被映射成中间调的大块表面，以及二维码区域的背景构成。
 *
 *   node research/probe-blocks.mjs
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

// 用户截图 3060x1369 @dpr2 -> CSS 约 1530x685；再补一个更宽的
const WIDTHS = [1530, 1920];

const browser = await chromium.launch({ headless: true, executablePath: exe });

/** 在页面上按坐标取链条 */
const PROBE = (points) => {
  const desc = (el) => {
    if (!el || el.nodeType !== 1) return null;
    const cls = typeof el.className === 'string'
      ? el.className.trim().split(/\s+/).slice(0, 3).join('.')
      : (el.className && el.className.baseVal ? el.className.baseVal.split(/\s+/).slice(0, 3).join('.') : '');
    return el.tagName.toLowerCase() + (cls ? '.' + cls : '');
  };
  const chainOf = (el, max = 7) => {
    const out = [];
    let n = el;
    let i = 0;
    while (n && n.nodeType === 1 && i++ < max) {
      const cs = getComputedStyle(n);
      const r = n.getBoundingClientRect();
      out.push({
        sel: desc(n),
        bg: cs.backgroundColor,
        bgImage: cs.backgroundImage === 'none' ? null : cs.backgroundImage.slice(0, 70),
        size: `${Math.round(r.width)}x${Math.round(r.height)}`,
      });
      n = n.parentElement;
    }
    return out;
  };
  return points.map(([x, y]) => {
    const el = document.elementFromPoint(x, y);
    return { point: `${x},${y}`, hit: desc(el), chain: chainOf(el) };
  });
};

for (const width of WIDTHS) {
  const context = await browser.newContext({
    viewport: { width, height: 900 },
    locale: 'zh-CN',
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  });
  await context.addInitScript(() => {
    try { localStorage.setItem('heybox-dark-mode', '0'); } catch (_) {}
  });
  await context.addInitScript(code);

  const page = await context.newPage();
  await page.goto('https://www.xiaoheihe.cn/app/bbs/home', {
    waitUntil: 'domcontentloaded', timeout: 90000,
  });
  await page.waitForTimeout(7000);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(1500);

  // 采样点按宽度等比缩放（原截图基于 1530 宽）
  const sx = width / 1530;
  const points = [
    [110 * sx, 300],   // 左侧留白
    [500 * sx, 300],   // 内容列
    [900 * sx, 300],   // ← 用户截图里的灰色带
    [1180 * sx, 300],  // 侧栏卡片
    [1480 * sx, 460],  // 右侧留白
    [860 * sx, 520],   // 二维码
  ];

  const light = await page.evaluate(PROBE, points);
  await page.screenshot({ path: path.resolve(`output/probe/blocks-${width}-light.png`) });

  await page.evaluate(() => window.__hbSetDark(true));
  await page.waitForTimeout(2500);
  const dark = await page.evaluate(PROBE, points);
  await page.screenshot({ path: path.resolve(`output/probe/blocks-${width}-dark.png`) });

  console.log(`\n########## viewport ${width} ##########`);
  for (let i = 0; i < points.length; i++) {
    console.log(`\n--- 点 ${points[i].join(',')} | 命中 ${dark[i].hit} ---`);
    console.log('  浅色:', JSON.stringify(light[i].chain.slice(0, 4)));
    console.log('  深色:', JSON.stringify(dark[i].chain.slice(0, 4)));
  }

  // 二维码专项
  const qr = await page.evaluate(() => {
    const out = [];
    for (const sel of ['.qr-section', '.qr-section img', '.app-link-item', 'canvas']) {
      for (const el of document.querySelectorAll(sel)) {
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        out.push({
          sel,
          tag: el.tagName.toLowerCase(),
          bg: cs.backgroundColor,
          bgImage: cs.backgroundImage === 'none' ? null : cs.backgroundImage.slice(0, 60),
          src: el.getAttribute && el.getAttribute('src') ? el.getAttribute('src').slice(0, 70) : null,
          size: `${Math.round(r.width)}x${Math.round(r.height)}`,
        });
        break;
      }
    }
    return out;
  });
  console.log('\n  二维码区域:', JSON.stringify(qr, null, 1));

  await context.close();
}

await browser.close();
console.log('\nDONE');
