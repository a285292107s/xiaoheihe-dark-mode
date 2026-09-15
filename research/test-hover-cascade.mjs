/**
 * 回归测试：hover 楼层时的层叠顺序。
 *
 *   node research/test-hover-cascade.mjs
 *
 * ## 这个 bug 的成因
 * 站点 CSS 里这两条规则**优先级完全相同**（都是 (0,2,1)），靠先后顺序决定胜负：
 *
 *   .link-comment__comment-item + .link-comment__comment-item:before { background-color:#f3f4f5 }
 *   .link-comment__comment-item:hover:before  { background-color:rgba(20,25,30,.016); width:100%;height:100%;z-index:300 }
 *
 * 把改写结果放进一张**挂在 <body> 末尾**的覆盖表，就会晚于站点所有样式表，
 * 于是在同优先级下赢了 hover 规则：hover 覆盖层被替换成不透明色，
 * 而 width/height/z-index 仍来自 hover 规则 —— 鼠标一移上去整层楼被一块不透明板盖住。
 * 引擎因此改为就地改写站点声明，绝不追加 !important。本测试就是这条约束的看门人。
 *
 * ## 本测试要求
 * - 非 hover：分隔线是**深色**（说明改写生效，且没有变成浅色）
 * - hover  ：覆盖层必须是站点原本的半透明值（说明层叠顺序未被破坏）
 * - hover 前后像素差必须很小（说明内容没有被盖住）
 * - 阴性对照：人为复现「末尾覆盖表」写法时，像素差必须**超标** ——
 *   否则第 3 条恒真，测不出任何东西
 *
 * 注意：必须放**两条**评论，否则 `+` 规则不匹配，测不到这个 bug。
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

const snippetPath = path.resolve('research/repro/floor-snippet.html');
if (!fs.existsSync(snippetPath)) {
  console.error('请先运行 node research/repro-floor.mjs 生成楼层 HTML 片段');
  process.exit(2);
}
const FLOOR = fs.readFileSync(snippetPath, 'utf8');

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

const html = `<!DOCTYPE html><html><head><meta charset="utf-8">${links}
<style>
  body { margin:0; background:#f7f8f9; font-family:-apple-system,"Microsoft YaHei",sans-serif; }
  #page-bbs-link { max-width:1256px; margin:24px auto; }
  .card { background:#fff; border-radius:8px; padding:0 16px; }
</style></head><body>
<div id="page-bbs-link"><div class="card"><div class="link-comment"><div class="link-comment__list">
${FLOOR}
${FLOOR.replace('954488686', '954488687')}
</div></div></div></div>
</body></html>`;

const outDir = path.resolve('research/repro');
fs.writeFileSync(path.join(outDir, 'cascade.html'), html, 'utf8');

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

const browser = await chromium.launch({ headless: true, executablePath: exe });
const context = await browser.newContext({ viewport: { width: 1332, height: 900 }, locale: 'zh-CN' });
await context.addInitScript(() => {
  try { localStorage.setItem('heybox-dark-mode', '1'); } catch (_) {}
});
const page = await context.newPage();
await page.goto(`${origin}/repro/cascade.html`, { waitUntil: 'load', timeout: 60000 });
await page.waitForTimeout(1200);
await page.addScriptTag({ content: code });
await page.waitForTimeout(1500);

const readPseudo = (index) =>
  page.evaluate((i) => {
    const items = document.querySelectorAll('.link-comment__comment-item');
    const el = items[i];
    const p = getComputedStyle(el, '::before');
    const r = el.getBoundingClientRect();
    return {
      content: p.content, bg: p.backgroundColor, w: p.width, h: p.height,
      z: p.zIndex, pos: p.position,
      box: `${Math.round(r.width)}x${Math.round(r.height)}`,
    };
  }, index);

/**
 * 与一张基线截图逐像素比较。
 *
 * 解码交给浏览器自己做（Image + canvas），避免在 Node 里手写 PNG 解码器。
 * 返回 0..255 区间的最大通道差、平均差与受影响像素比例。
 */
async function diffAgainst(shotA, clip) {
  const shotB = (await page.screenshot({ clip })).toString('base64');
  return page.evaluate(async ([a, b]) => {
    const load = (b64) =>
      new Promise((res, rej) => {
        const img = new Image();
        img.onload = () => res(img);
        img.onerror = rej;
        img.src = 'data:image/png;base64,' + b64;
      });
    const [ia, ib] = await Promise.all([load(a), load(b)]);
    const c = document.createElement('canvas');
    c.width = ia.width; c.height = ia.height;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(ia, 0, 0);
    const da = ctx.getImageData(0, 0, c.width, c.height).data;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(ib, 0, 0);
    const db = ctx.getImageData(0, 0, c.width, c.height).data;
    let max = 0, sum = 0, n = 0, changed = 0;
    for (let i = 0; i < da.length; i += 4) {
      const d = Math.max(
        Math.abs(da[i] - db[i]),
        Math.abs(da[i + 1] - db[i + 1]),
        Math.abs(da[i + 2] - db[i + 2]),
      );
      if (d > 0) changed++;
      if (d > max) max = d;
      sum += d; n++;
    }
    return { max, mean: +(sum / n).toFixed(3), changedRatio: +(changed / n).toFixed(4), pixels: n };
  }, [shotA, shotB]);
}

const box = await page.evaluate(() => {
  const r = document.querySelectorAll('.link-comment__comment-item')[1].getBoundingClientRect();
  return {
    x: Math.floor(r.left), y: Math.floor(r.top),
    width: Math.ceil(r.width), height: Math.ceil(r.height),
  };
});

// --- 非 hover：分隔线 ---
console.log('=== 非 hover：第二条评论的 ::before（应为深色分隔线，高 1px）===');
const sep = await readPseudo(1);
console.log(JSON.stringify(sep, null, 1));
const baseShot = (await page.screenshot({ clip: box })).toString('base64');
await page.screenshot({ path: path.join(outDir, 'cascade-before.png'), clip: box });

// --- hover：覆盖层 ---
await page.hover('.link-comment__comment-item:nth-of-type(2)');
await page.waitForTimeout(700);
console.log('\n=== hover：第二条评论的 ::before（应为半透明覆盖层）===');
const hov = await readPseudo(1);
console.log(JSON.stringify(hov, null, 1));
const hoverDiff = await diffAgainst(baseShot, box);
await page.screenshot({ path: path.join(outDir, 'cascade-after.png'), clip: box });

// --- 阴性对照：人为复现「末尾覆盖表」写法 ---
// 同优先级、位置更靠后 —— 与当初的 bug 完全同构。若这一条不超标，说明像素判据无效。
await page.evaluate(() => {
  window.scrollTo(0, 0);
  const st = document.createElement('style');
  st.id = 'hb-negative-control';
  st.textContent = '.link-comment__comment-item:hover:before{background-color:#262c33}';
  document.body.appendChild(st);
});
await page.mouse.move(0, 0);
await page.waitForTimeout(400);
const baseShot2 = (await page.screenshot({ clip: box })).toString('base64');
await page.hover('.link-comment__comment-item:nth-of-type(2)');
await page.waitForTimeout(700);
const controlDiff = await diffAgainst(baseShot2, box);
const controlBg = (await readPseudo(1)).bg;
await page.screenshot({ path: path.join(outDir, 'cascade-negative-control.png'), clip: box });

await browser.close();
server.close();

// ---------- 判定 ----------
const alpha = (() => {
  const m = String(hov.bg).match(/rgba?\([^)]*?,\s*([\d.]+)\)/);
  if (!m) return /rgb\(/.test(hov.bg) ? 1 : null;
  return parseFloat(m[1]);
})();

/** 分隔线必须真的是深色，而不只是「不是 #f3f4f5」 */
const sepLum = (() => {
  const m = String(sep.bg).match(/rgba?\(([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/);
  if (!m) return null;
  return 0.2126 * +m[1] + 0.7152 * +m[2] + 0.0722 * +m[3];
})();

// 阈值：实测 hover 只叠加 1.6% 黑，最大通道差 4；覆盖层变成不透明时实测 217。
const PIXEL_MAX = 32;
const PIXEL_MEAN = 6;

const sepOk = sepLum !== null && sepLum < 90;
const hoverOk = alpha !== null && alpha < 0.1;
const pixelOk = hoverDiff.max <= PIXEL_MAX && hoverDiff.mean <= PIXEL_MEAN;
const controlOk = controlDiff.max > PIXEL_MAX;

console.log('\n################ 判定 ################');
console.log(`分隔线颜色: ${sep.bg}  亮度 ${sepLum === null ? 'n/a' : sepLum.toFixed(1)}（应 < 90，即深色）`);
console.log(`hover 覆盖层: ${hov.bg}  alpha=${alpha}`);
console.log(`hover 像素差: max=${hoverDiff.max} mean=${hoverDiff.mean} 变化像素 ${(hoverDiff.changedRatio * 100).toFixed(1)}%（应 max<=${PIXEL_MAX}、mean<=${PIXEL_MEAN}）`);
console.log(`阴性对照像素差: max=${controlDiff.max} mean=${controlDiff.mean}（覆盖层 ${controlBg}，应 max>${PIXEL_MAX}）`);
console.log(`分隔线为深色: ${sepOk ? '是 ✅' : '否 ❌'}`);
console.log(`hover 覆盖层仍为半透明: ${hoverOk ? '是 ✅' : '否 ❌（内容会被盖住）'}`);
console.log(`hover 前后像素差足够小: ${pixelOk ? '是 ✅' : '否 ❌（内容被遮挡）'}`);
console.log(`阴性对照能检出该缺陷: ${controlOk ? '是 ✅' : '否 ❌（像素判据形同虚设）'}`);
const pass = sepOk && hoverOk && pixelOk && controlOk;
console.log(pass ? '\nPASS ✅' : '\nFAIL ❌');
console.log('截图: research/repro/cascade-{before,after,negative-control}.png');
process.exit(pass ? 0 : 1);
