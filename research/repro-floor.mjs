/**
 * 针对用户给的那一层楼（纯文字评论）做精确复现与「谁盖住了它」定位。
 *
 *   node research/repro-floor.mjs
 *
 * 做法：
 *   1) 用用户提供的真实 outerHTML，套上站点真实的祖先结构；
 *   2) 加载本地全部站点 CSS（必须走 HTTP，file:// 下样式表跨域读不到）；
 *   3) 注入构建产物，浅色/深色各跑一遍；
 *   4) 在评论盒子内做网格 elementFromPoint 采样，统计「最上层元素」，
 *      —— 盖住内容的那一层会以绝对优势出现；
 *   5) 同时列出该子树里所有大块不透明背景（含伪元素）与正文计算色。
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

// ---- 用户提供的真实元素 ----
const FLOOR_HTML = `<div class="link-comment__comment-item" data-comment-id="954488686"><div class="link-comment__comment-item-header"><a href="/app/user/profile/22634617" class=""><div class="hb-cpt-avatar comment-item-header__avatar" style="--hb-avatar-size: 34px; --hb-avatar-deraction-size: 48px;"><img class="hb-avatar__image" src="https://cdn.max-c.com/heybox/profile/avatar/heygirl_1.png?imageMogr2/thumbnail/100x100%3E" alt=""><!----></div></a><div class="comment-item-header__info-box"><div class="info-box__line-1"><a href="/app/user/profile/22634617" class="info-box__username">只是一梦成空</a><!----><!----><div class="hb-level-tag hb-level-14 info-box__level"><div class="hb-level-tag__inner"><div class="hb-level-tag__inner__text"> Lv.14</div><!----></div></div><!----><div class="comment-item-header__operation-box"><button class="like-box"><i class="hb-icon">
    <svg class="hb-iconfont" aria-hidden="true">
      <use xlink:href="#icon-bbs_thumbs-up_filled_24x24"></use>
    </svg>
  </i><div class="like-box__cnt">351</div></button></div></div><div class="info-box__line-2"><div class="info-box__create-time">3小时前</div><div class="info-box__ip">·浙江</div></div></div></div><div class="comment-item__content-container"><div class="comment-item__content">不是的，等下你就咔嚓一下变成大铁坨，我就开着新车美美逛街</div><!----><!----><div class="link-comment__comment-children can-load"><div class="comment-children-item" data-comment-id="954519226"><a href="/app/user/profile/70062137" class="children-item__comment-creator">迷途执晓</a><!----><!----><span class="children-item__reply-to">:</span><p class="children-item__comment-content"><span data-emoji="cube_僵尸" class="hb-emoji hb-emoji-cube hb-emoji-cube_95"></span><span data-emoji="cube_僵尸" class="hb-emoji hb-emoji-cube hb-emoji-cube_95"></span><span data-emoji="cube_委屈" class="hb-emoji hb-emoji-cube hb-emoji-cube_25"></span></p><span class="children-item__other-info"><span class="children-item__create-time">3小时前</span><span class="children-item__ip">·北京</span></span></div><div class="comment-children-item" data-comment-id="954531713"><a href="/app/user/profile/81594460" class="children-item__comment-creator">QAQ</a><!----><!----><span class="children-item__reply-to">:</span><p class="children-item__comment-content"><span data-emoji="cube_笑cry" class="hb-emoji hb-emoji-cube hb-emoji-cube_32"></span></p><span class="children-item__other-info"><span class="children-item__create-time">2小时前</span><span class="children-item__ip">·河北</span></span></div><button class="comment-children__load-all"><div class="load-all__text">全部&nbsp;6&nbsp;条回复</div><i class="hb-icon">
    <svg class="hb-iconfont" aria-hidden="true">
      <use xlink:href="#icon-common_arrow_down_filled_24x24"></use>
    </svg>
  </i></button></div></div></div>`;

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
  body { margin: 0; background: #f7f8f9; font-family: -apple-system, "Microsoft YaHei", sans-serif; }
  /* 复现详情页：白色卡片里放评论列表 */
  #page-bbs-link { max-width: 1256px; margin: 24px auto; }
  .card { background: #fff; border-radius: 8px; padding: 0 16px; }
</style></head>
<body>
  <div id="page-bbs-link">
    <div class="card">
      <div class="link-comment">
        <div class="link-comment__list">
          ${FLOOR_HTML}
        </div>
      </div>
    </div>
  </div>
</body></html>`;

fs.writeFileSync(path.join(reproDir, 'floor.html'), html, 'utf8');
// 单独存一份「那一层楼」的 HTML 片段，供其它测试复用
fs.writeFileSync(path.join(reproDir, 'floor-snippet.html'), FLOOR_HTML, 'utf8');

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  const file = path.join(path.resolve('research'), urlPath.replace(/^\//, ''));
  if (!file.startsWith(path.resolve('research')) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404).end('nf');
    return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  res.end(fs.readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;

const userscript = fs.readFileSync(path.resolve('dist/xiaoheihe-dark-mode.user.js'), 'utf8');
const code = userscript.replace(/^\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==\s*/, '');

/** 在评论盒子内网格采样 elementFromPoint，并对子树做大块背景普查 */
const PROBE = () => {
  const desc = (el) => {
    if (!el || el.nodeType !== 1) return 'none';
    const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/).slice(0, 3).join('.') : '';
    return el.tagName.toLowerCase() + (cls ? '.' + cls : '');
  };
  const item = document.querySelector('.link-comment__comment-item');
  if (!item) return { error: 'comment item not found' };
  const box = item.getBoundingClientRect();

  // 1) 网格采样：谁在最上层
  const hits = new Map();
  const gridN = 36;
  for (let iy = 1; iy <= 6; iy++) {
    for (let ix = 1; ix <= gridN; ix++) {
      const x = box.left + (box.width * ix) / (gridN + 1);
      const y = box.top + (box.height * iy) / 7;
      const el = document.elementFromPoint(x, y);
      const k = desc(el);
      if (!hits.has(k)) hits.set(k, 0);
      hits.set(k, hits.get(k) + 1);
    }
  }
  const topHits = [...hits].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k} x${v}`);

  // 2) 子树大块不透明背景（含伪元素）
  const blocks = [];
  for (const el of item.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    if (r.width * r.height < 3000) continue;
    const cs = getComputedStyle(el);
    if (cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)') {
      blocks.push({ sel: desc(el), bg: cs.backgroundColor, box: `${Math.round(r.width)}x${Math.round(r.height)}`, pos: cs.position, z: cs.zIndex, op: cs.opacity });
    }
    for (const ps of ['::before', '::after']) {
      const p = getComputedStyle(el, ps);
      if (p.content === 'none') continue;
      if (p.backgroundColor && p.backgroundColor !== 'rgba(0, 0, 0, 0)') {
        blocks.push({ sel: desc(el) + ps, bg: p.backgroundColor, box: `${Math.round(r.width)}x${Math.round(r.height)}`, pos: p.position, z: p.zIndex, op: p.opacity, w: p.width, h: p.height });
      }
    }
  }

  // 3) 关键元素的计算色
  const key = {};
  for (const sel of ['.comment-item__content', '.info-box__username', '.link-comment__comment-children', '.children-item__comment-content']) {
    const el = item.querySelector(sel);
    if (!el) continue;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    key[sel] = { color: cs.color, bg: cs.backgroundColor, box: `${Math.round(r.width)}x${Math.round(r.height)}`, op: cs.opacity, vis: cs.visibility };
  }

  // 4) 评论项自身
  const cs = getComputedStyle(item);
  const itemStyle = { bg: cs.backgroundColor, color: cs.color, op: cs.opacity, pos: cs.position, z: cs.zIndex };

  return { box: `${Math.round(box.width)}x${Math.round(box.height)}`, itemStyle, topHits, blocks, key };
};

const browser = await chromium.launch({ headless: true, executablePath: exe });
const context = await browser.newContext({ viewport: { width: 1332, height: 900 }, locale: 'zh-CN' });
await context.addInitScript(() => {
  try { localStorage.setItem('heybox-dark-mode', '0'); } catch (_) {}
});
const page = await context.newPage();
await page.goto(`${origin}/repro/floor.html`, { waitUntil: 'load', timeout: 60000 });
await page.waitForTimeout(1500);

const light = await page.evaluate(PROBE);
await page.screenshot({ path: path.join(reproDir, 'floor-light.png'), fullPage: true });

await page.addScriptTag({ content: code });
await page.evaluate(() => window.__hbSetDark(true));
await page.waitForTimeout(1200);
const dark = await page.evaluate(PROBE);
await page.screenshot({ path: path.join(reproDir, 'floor-dark.png'), fullPage: true });

console.log('==================== 浅色 ====================');
console.log(JSON.stringify(light, null, 1));
console.log('==================== 深色 ====================');
console.log(JSON.stringify(dark, null, 1));

await browser.close();
server.close();
console.log('DONE');
