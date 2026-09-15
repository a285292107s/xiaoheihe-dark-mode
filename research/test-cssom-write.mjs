/**
 * 关键可行性测试：能否「就地改写」跨域（CORS）样式表的规则？
 *
 *   node research/test-cssom-write.mjs
 *
 * 背景：现在的实现把改写结果放进一张挂在 <body> 末尾的覆盖表。
 * 由于覆盖表排在站点所有样式表之后，同优先级的规则会被我们抢先，
 * 从而破坏站点自己的状态覆盖（例如 :hover）。
 * 正确做法是就地改写站点的 CSSOM —— 顺序完全不变。
 * 前提是跨域样式表可写。本脚本用一个「不同端口 + ACAO」的服务来模拟生产环境。
 */
import { createRequire } from 'node:module';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const cliRoot = path.join(process.env.APPDATA || '', 'npm/node_modules/@playwright/cli');
const { chromium } = require(path.join(cliRoot, 'node_modules/playwright'));

const exe =
  process.env.CHROME_PATH ||
  path.join(process.env.LOCALAPPDATA || '', 'ms-playwright/chromium-1234/chrome-win64/chrome.exe');

const CSS = `
.box { background-color: rgb(255, 255, 255); }
.box + .box::before { content: ""; position: absolute; background-color: rgb(243, 244, 245); }
.box:hover::before  { content: ""; position: absolute; width: 100%; height: 100%; background-color: rgba(20, 25, 30, 0.016); }
`;

const HTML = `<!DOCTYPE html><html><head><meta charset="utf-8">
<link rel="stylesheet" crossorigin href="__CSS_ORIGIN__/site.css">
<style>body{margin:0}.box{position:relative;width:300px;height:60px;margin:10px;color:#000}</style>
</head><body>
<div class="box">A</div>
<div class="box" id="target">B（这一条会匹配 + 规则与 :hover 规则）</div>
</body></html>`;

// 页面源
const pageServer = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(HTML.replace('__CSS_ORIGIN__', cssOrigin));
});
// 样式源（不同端口 = 跨域），带 ACAO
let cssOrigin = '';
const cssServer = http.createServer((req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/css; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(CSS);
});
await new Promise((r) => cssServer.listen(0, '127.0.0.1', r));
cssOrigin = `http://127.0.0.1:${cssServer.address().port}`;
await new Promise((r) => pageServer.listen(0, '127.0.0.1', r));
const pageOrigin = `http://127.0.0.1:${pageServer.address().port}`;

console.log(`页面源 ${pageOrigin} / 样式源 ${cssOrigin}（跨域 + ACAO）`);

const browser = await chromium.launch({ headless: true, executablePath: exe });
const page = await (await browser.newContext()).newPage();
await page.goto(pageOrigin, { waitUntil: 'load' });

const result = await page.evaluate(() => {
  const sheet = [...document.styleSheets].find((s) => s.href && s.href.includes('site.css'));
  if (!sheet) return { error: 'stylesheet not found' };

  let readable = false;
  let writable = false;
  let writeError = null;
  let rules = [];
  try {
    rules = [...sheet.cssRules];
    readable = true;
  } catch (e) {
    return { readable: false, error: String(e) };
  }

  // 找那条 「+」 规则并尝试就地改写
  const plusRule = rules.find((r) => r.selectorText && r.selectorText.includes('+'));
  const hoverRule = rules.find((r) => r.selectorText && r.selectorText.includes(':hover'));
  if (!plusRule) return { readable, error: 'plus rule not found', selectors: rules.map((r) => r.selectorText) };

  const before = plusRule.style.getPropertyValue('background-color');
  try {
    plusRule.style.setProperty('background-color', 'rgb(37, 43, 50)', 'important');
    writable = plusRule.style.getPropertyValue('background-color') !== before;
  } catch (e) {
    writeError = String(e);
  }

  return {
    readable,
    writable,
    writeError,
    plusSelector: plusRule.selectorText,
    plusBgAfterWrite: plusRule.style.getPropertyValue('background-color'),
    plusPriority: plusRule.style.getPropertyPriority('background-color'),
    hoverSelector: hoverRule ? hoverRule.selectorText : null,
    hoverBg: hoverRule ? hoverRule.style.getPropertyValue('background-color') : null,
  };
});

console.log('\n=== CSSOM 可写性 ===');
console.log(JSON.stringify(result, null, 1));

// 真正的判据：非 hover 时用我们写的深色，hover 时仍然回到站点的 1.6% 覆盖层
const check = async (hover) => {
  if (hover) await page.hover('#target');
  else await page.mouse.move(5, 5);
  await page.waitForTimeout(300);
  return page.evaluate(() => {
    const el = document.getElementById('target');
    const p = getComputedStyle(el, '::before');
    return { bg: p.backgroundColor, w: p.width, h: p.height, z: p.zIndex };
  });
};

console.log('\n=== 就地改写后：非 hover ===');
console.log(JSON.stringify(await check(false)));
console.log('=== 就地改写后：hover ===');
console.log(JSON.stringify(await check(true)));

await browser.close();
pageServer.close();
cssServer.close();
console.log('\nDONE');
