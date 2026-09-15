/**
 * 修正版解剖：绕开 CSSStyleRule.cssRules 陷阱；并对 EP 令牌做自检。
 * node research/probe-anatomy.mjs
 */
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const cliRoot = path.join(process.env.APPDATA || '', 'npm/node_modules/@playwright/cli');
const { chromium } = require(path.join(cliRoot, 'node_modules/playwright'));

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
// 注入红色 --el-* 并自检
await context.addInitScript(() => {
  const apply = () => {
    const s = document.createElement('style');
    s.textContent = `:root{
      --el-bg-color: rgb(255,0,0) !important;
      --el-text-color-primary: rgb(255,0,0) !important;
      --el-border-color: rgb(255,0,0) !important;
      --el-fill-color-blank: rgb(255,0,0) !important;
      --el-color-primary: rgb(255,0,0) !important;
      --el-color-white: rgb(255,0,0) !important;
      --el-bg-color-page: rgb(255,0,0) !important;
      --el-bg-color-overlay: rgb(255,0,0) !important;
      --el-text-color-regular: rgb(255,0,0) !important;
      --el-text-color-secondary: rgb(255,0,0) !important;
      --el-border-color-light: rgb(255,0,0) !important;
      --el-fill-color: rgb(255,0,0) !important;
      --el-fill-color-light: rgb(255,0,0) !important;
    }`;
    document.documentElement.appendChild(s);
  };
  if (document.documentElement) apply();
  else new MutationObserver((_, o) => { if (document.documentElement) { apply(); o.disconnect(); } })
    .observe(document, { childList: true, subtree: true });
});

const page = await context.newPage();
await page.goto('https://www.xiaoheihe.cn/app/bbs/link/189860812', {
  waitUntil: 'domcontentloaded', timeout: 90000,
});
await page.waitForTimeout(8000);
// 打开搜索框（EP autocomplete）以让 EP 组件出现在 DOM
await page.evaluate(() => {
  const inp = document.querySelector('input');
  if (inp) { inp.focus(); inp.click(); }
});
await page.waitForTimeout(2000);

const out = await page.evaluate(() => {
  const RED = /255,\s*0,\s*0/;
  const rootCS = getComputedStyle(document.documentElement);
  const selfCheck = {
    elBgColor: rootCS.getPropertyValue('--el-bg-color').trim(),
    elTextPrimary: rootCS.getPropertyValue('--el-text-color-primary').trim(),
  };

  let red = 0; const samples = [];
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    if (RED.test(cs.color) || RED.test(cs.backgroundColor) || RED.test(cs.borderTopColor)) {
      red++;
      if (samples.length < 8) samples.push({
        tag: el.tagName.toLowerCase(),
        cls: (typeof el.className === 'string' ? el.className : '').slice(0, 55),
        color: cs.color, bg: cs.backgroundColor,
      });
    }
  }

  // 修正后的 CSSOM 遍历：用 constructor.name / 有 selectorText 来判定
  let totalRules = 0, pseudoRules = 0, gradientRules = 0, urlBgRules = 0, shadowRules = 0, literalColorRules = 0;
  const pseudoSel = [];
  const visit = (rules) => {
    for (const r of rules) {
      totalRules++;
      const isStyle = typeof r.selectorText === 'string';
      if (!isStyle) { if (r.cssRules && r.cssRules.length) visit(r.cssRules); continue; }
      const t = r.cssText || '';
      if (/::?(before|after|placeholder|selection|marker|first-line|backdrop|file-selector-button)/.test(r.selectorText)) {
        pseudoRules++;
        if (pseudoSel.length < 6) pseudoSel.push(r.selectorText.slice(0, 70));
      }
      if (/gradient\(/.test(t)) gradientRules++;
      if (/url\(/.test(t)) urlBgRules++;
      if (/box-shadow|text-shadow/.test(t)) shadowRules++;
      if (/[;{]\s*(?:color|background|background-color|border[a-z-]*color|fill|stroke)\s*:\s*(?:#[0-9a-fA-F]{3,8}|rgba?\()/.test(';' + t)) literalColorRules++;
    }
  };
  for (const s of document.styleSheets) { try { visit(s.cssRules); } catch (e) {} }

  // 导航 logo 的绘制方式
  const navLogo = document.querySelector('.nav-content-left-logo');
  let logoInfo = null;
  if (navLogo) {
    const kids = [...navLogo.querySelectorAll('path,use,g,rect,circle')].slice(0, 5).map((k) => ({
      tag: k.tagName.toLowerCase(),
      fill: k.getAttribute('fill'),
      computedFill: getComputedStyle(k).fill,
      href: k.getAttribute('href') || k.getAttribute('xlink:href') || null,
    }));
    logoInfo = {
      parentColor: getComputedStyle(navLogo.parentElement || navLogo).color,
      ownColor: getComputedStyle(navLogo).color,
      kids,
    };
  }

  return {
    selfCheck, red, samples,
    css: { totalRules, pseudoRules, gradientRules, urlBgRules, shadowRules, literalColorRules, pseudoSel },
    logoInfo,
  };
});

console.log(JSON.stringify(out, null, 2));
await browser.close();
console.log('DONE');
