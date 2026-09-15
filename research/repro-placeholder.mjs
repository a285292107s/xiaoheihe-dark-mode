/**
 * 针对性复现：用站点真实 CSS 渲染「4:3 图片网格 + 未加载占位块」，
 * 对比浅色/深色下占位块相对卡片的可见度，验证表面梯度修复。
 *
 *   node research/repro-placeholder.mjs
 *
 * 缺陷背景：`.hb-cpt__image--default` 的 #f3f4f5 在浅色下只比卡片 #fff 暗 4.4%，
 * 线性映射后变成暗 9.8%（放大 2.2 倍），详情页两张并排的占位块（1256x460）
 * 在深色下就成了整块突兀的灰板。修复后应回落到 ~1.6%。
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

const reproDir = path.resolve('research/repro');
fs.mkdirSync(reproDir, { recursive: true });

// 站点真实样式表（相对路径引用本地分片）
const cssFiles = [
  ...fs.readdirSync(path.resolve('research/css')).filter((f) => f.endsWith('.css')),
  ...fs.readdirSync(path.resolve('research/css-detail')).filter((f) => f.endsWith('.css')),
];
const links = cssFiles
  .map((f) => {
    const dir = fs.existsSync(path.resolve('research/css', f)) ? '../css' : '../css-detail';
    return `<link rel="stylesheet" href="${dir}/${f}">`;
  })
  .join('\n');

const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8">${links}
<style>
  /* 复现详情页的载体：白色卡片 + 两列 4:3 图片网格 */
  body { margin: 0; background: #f7f8f9; font-family: sans-serif; }
  .card { max-width: 1256px; margin: 24px auto; background: #fff; border-radius: 8px; padding: 16px; }
  .grid { display: flex; gap: 0; }
  .grid .hb-cpt__image { flex: 1 1 0; }
</style></head>
<body>
  <div class="card" id="card">
    <div class="grid" id="grid">
      <div class="hb-cpt__image pointer">
        <div class="hb-cpt__image--default"></div>
        <img class="hb-cpt__image-elem" alt="">
      </div>
      <div class="hb-cpt__image pointer">
        <div class="hb-cpt__image--default"></div>
        <img class="hb-cpt__image-elem" alt="">
      </div>
    </div>
  </div>
</body></html>`;

const htmlPath = path.join(reproDir, 'placeholder.html');
fs.writeFileSync(htmlPath, html, 'utf8');

// 必须用 HTTP 服务：file:// 页面下同目录的 file:// 样式表会被 Chrome 视为跨域，
// cssRules 抛异常，引擎会整批跳过站点 CSS，测不出真实行为。
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  const file = path.join(path.resolve('research'), urlPath.replace(/^\//, ''));
  if (!file.startsWith(path.resolve('research')) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404).end('not found');
    return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  res.end(fs.readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;
console.log(`本地服务: ${origin}`);

const userscript = fs.readFileSync(path.resolve('dist/xiaoheihe-dark-mode.user.js'), 'utf8');
const code = userscript.replace(/^\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==\s*/, '');

const lum = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
const parse = (s) => {
  const m = String(s).match(/rgba?\(([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/);
  return m ? { r: +m[1], g: +m[2], b: +m[3] } : null;
};

const browser = await chromium.launch({ headless: true, executablePath: exe });
const context = await browser.newContext({ viewport: { width: 1332, height: 700 }, locale: 'zh-CN' });
await context.addInitScript(() => {
  try { localStorage.setItem('heybox-dark-mode', '0'); } catch (_) {}
});
const page = await context.newPage();
await page.goto(`${origin}/repro/placeholder.html`, { waitUntil: 'load', timeout: 60000 });
await page.waitForTimeout(1200);

// 先确认站点样式表真的可读（否则整个复现无意义）
const readable = await page.evaluate(() => {
  let ok = 0;
  let err = 0;
  for (const s of document.styleSheets) {
    try { void s.cssRules.length; ok++; } catch (e) { err++; }
  }
  return { ok, err };
});
console.log(`样式表可读性: 可读 ${readable.ok} / 失败 ${readable.err}`);

const measure = () =>
  page.evaluate(() => {
    const card = getComputedStyle(document.querySelector('#card'));
    const def = getComputedStyle(document.querySelector('.hb-cpt__image--default'));
    const grid = document.querySelector('#grid').getBoundingClientRect();
    const one = document.querySelector('.hb-cpt__image').getBoundingClientRect();
    return {
      cardBg: card.backgroundColor,
      placeholderBg: def.backgroundColor,
      placeholderOpacity: def.opacity,
      grid: `${Math.round(grid.width)}x${Math.round(grid.height)}`,
      tile: `${Math.round(one.width)}x${Math.round(one.height)}`,
      ratio: (one.width / one.height).toFixed(3),
    };
  });

const light = await measure();
await page.screenshot({ path: path.join(reproDir, 'placeholder-light.png') });

await page.addScriptTag({ content: code });
await page.evaluate(() => window.__hbSetDark(true));
await page.waitForTimeout(1200);
const dark = await measure();
await page.screenshot({ path: path.join(reproDir, 'placeholder-dark.png') });

const dl = (lum(parse(light.cardBg)) - lum(parse(light.placeholderBg))) / lum(parse(light.cardBg));
const dd = (lum(parse(dark.cardBg)) - lum(parse(dark.placeholderBg))) / lum(parse(dark.cardBg));

console.log('图片占位块尺寸: ' + JSON.stringify({ grid: light.grid, tile: light.tile, 宽高比: light.ratio }));
console.log('\n浅色: 卡片 ' + light.cardBg + '  占位块 ' + light.placeholderBg);
console.log('深色: 卡片 ' + dark.cardBg + '  占位块 ' + dark.placeholderBg);
console.log(`\n占位块相对卡片的亮度差：浅色 ${(dl * 100).toFixed(1)}%  深色 ${(dd * 100).toFixed(1)}%`);
console.log(`放大倍数（越接近或低于 1.0 越忠实）：${(dd / dl).toFixed(2)}x`);

const pass = dd / dl <= 1.0;
console.log('\n' + (pass ? 'PASS ✅ 深色下不会比浅色下更显眼' : 'FAIL ❌ 深色下仍被放大'));
await browser.close();
server.close();
process.exit(pass ? 0 : 1);
