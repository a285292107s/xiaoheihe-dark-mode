/**
 * 策略验证探测：
 *  1) Element Plus 令牌层是否活跃（override --el-* 为红色，看是否有元素变红）
 *  2) 导航 logo / 图标的构成（img？svg use？currentColor？）—— 决定需不需要 invert 兜底
 *  3) 伪元素与渐变的使用规模 —— 决定 CSS 文本变换必须覆盖哪些语法
 * node research/probe-strategy.mjs
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

const browser = await chromium.launch({ headless: true, executablePath: exe });

const RED_EL = `
  :root{
    --el-bg-color: rgb(255,0,0) !important;
    --el-bg-color-page: rgb(255,0,0) !important;
    --el-bg-color-overlay: rgb(255,0,0) !important;
    --el-text-color-primary: rgb(255,0,0) !important;
    --el-text-color-regular: rgb(255,0,0) !important;
    --el-text-color-secondary: rgb(255,0,0) !important;
    --el-border-color: rgb(255,0,0) !important;
    --el-border-color-light: rgb(255,0,0) !important;
    --el-fill-color: rgb(255,0,0) !important;
    --el-fill-color-light: rgb(255,0,0) !important;
    --el-fill-color-blank: rgb(255,0,0) !important;
    --el-color-primary: rgb(255,0,0) !important;
    --el-color-white: rgb(255,0,0) !important;
  }`;

async function run(label, inject) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'zh-CN',
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  });
  if (inject) {
    await context.addInitScript((css) => {
      const apply = () => {
        const s = document.createElement('style');
        s.textContent = css;
        document.documentElement.appendChild(s);
      };
      if (document.documentElement) apply();
      else new MutationObserver((_, o) => { if (document.documentElement) { apply(); o.disconnect(); } })
        .observe(document, { childList: true, subtree: true });
    }, RED_EL);
  }

  const page = await context.newPage();
  await page.goto('https://www.xiaoheihe.cn/app/bbs/link/189860812', {
    waitUntil: 'domcontentloaded',
    timeout: 90000,
  });
  await page.waitForTimeout(8000);
  await page.evaluate(async () => {
    for (let i = 0; i < 4; i++) { window.scrollBy(0, 800); await new Promise((r) => setTimeout(r, 350)); }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(2000);

  const info = await page.evaluate(() => {
    const RED = /255,\s*0,\s*0/;
    let red = 0;
    const samples = [];
    for (const el of document.querySelectorAll('body *')) {
      const cs = getComputedStyle(el);
      const hit = RED.test(cs.color) || RED.test(cs.backgroundColor) || RED.test(cs.borderTopColor);
      if (hit) {
        red++;
        if (samples.length < 10) {
          samples.push({
            tag: el.tagName.toLowerCase(),
            cls: (typeof el.className === 'string' ? el.className : '').slice(0, 60),
            color: cs.color, bg: cs.backgroundColor, bd: cs.borderTopColor,
          });
        }
      }
    }
    return { red, samples };
  });

  console.log(`\n===== ${label} ===== red=${info.red}`);
  console.log(JSON.stringify(info.samples, null, 1));
  await context.close();
  return info;
}

const base = await run('A 基线', false);
const inj = await run('B 注入红色 --el-*', true);
console.log('\n########## 结论 ##########');
console.log(`红色元素: 基线 ${base.red} -> 注入 ${inj.red}`);
console.log('判定:', inj.red > base.red + 5 ? 'Element Plus 令牌层活跃 ✅' : 'Element Plus 令牌层基本不活跃 ❌');

// ---- 静态：导航 logo 与图标构成 / 伪元素 / 渐变 规模 ----
const page2 = await (await browser.newContext({
  viewport: { width: 1440, height: 900 }, locale: 'zh-CN',
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
})).newPage();
await page2.goto('https://www.xiaoheihe.cn/app/bbs/link/189860812', { waitUntil: 'domcontentloaded', timeout: 90000 });
await page2.waitForTimeout(7000);
const anatomy = await page2.evaluate(() => {
  const nav = document.querySelector('nav.nav');
  const logos = nav ? [...nav.querySelectorAll('img,svg,use,i')].slice(0, 14).map((el) => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      tag: el.tagName.toLowerCase(),
      cls: (typeof el.className === 'string' ? el.className : (el.className.baseVal || '')).slice(0, 50),
      href: el.getAttribute('href') || el.getAttribute('xlink:href') || null,
      src: el.getAttribute('src') || null,
      color: cs.color, fill: cs.fill, bgImage: cs.backgroundImage.slice(0, 60),
      w: Math.round(r.width), h: Math.round(r.height),
    };
  }) : null;

  // 伪元素/渐变规模（从 CSSOM 统计）
  let pseudoRules = 0, gradientRules = 0, urlBgRules = 0, shadowRules = 0, totalRules = 0;
  const visit = (rules) => {
    for (const r of rules) {
      totalRules++;
      if (r.cssRules) { visit(r.cssRules); continue; }
      if (!r.selectorText) continue;
      if (/::?(before|after|placeholder|selection|marker|first-line|backdrop)/.test(r.selectorText)) pseudoRules++;
      const t = r.cssText || '';
      if (/gradient\(/.test(t)) gradientRules++;
      if (/url\(/.test(t)) urlBgRules++;
      if (/box-shadow|text-shadow/.test(t)) shadowRules++;
    }
  };
  for (const s of document.styleSheets) { try { visit(s.cssRules); } catch {} }

  return {
    navLogos: logos,
    css: { totalRules, pseudoRules, gradientRules, urlBgRules, shadowRules },
  };
});
console.log('\n===== 导航 logo / 图标解剖 =====');
console.log(JSON.stringify(anatomy.navLogos, null, 1));
console.log('\n===== CSS 语法覆盖面（必须处理）=====');
console.log(JSON.stringify(anatomy.css, null, 1));

await browser.close();
console.log('DONE');
