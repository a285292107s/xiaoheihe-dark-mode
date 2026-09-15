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
 * 旧实现把前者的颜色改写成不透明深色，并放进一张**挂在 <body> 末尾**的覆盖表：
 * 覆盖表晚于站点所有样式表，于是同优先级下我们的规则赢了 hover 规则 ——
 * hover 覆盖层被替换成不透明色，而 width/height/z-index 仍来自 hover 规则，
 * 结果「鼠标一移上去，整层楼被一块不透明板盖住」。
 *
 * ## 本测试要求
 * - 非 hover：分隔线是深色（说明改写生效）
 * - hover  ：覆盖层必须是站点原本的半透明值（说明层叠顺序未被破坏）
 * - hover 前后像素差必须很小（说明内容没有被盖住）
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

console.log('=== 非 hover：第二条评论的 ::before（应为深色分隔线，高 1px）===');
const sep = await readPseudo(1);
console.log(JSON.stringify(sep, null, 1));

// hover 第二条评论
const box = await page.evaluate(() => {
  const r = document.querySelectorAll('.link-comment__comment-item')[1].getBoundingClientRect();
  return { x: Math.floor(r.left), y: Math.floor(r.top), width: Math.ceil(r.width), height: Math.ceil(r.height) };
});
await page.screenshot({ path: path.join(outDir, 'cascade-before.png'), clip: box });

await page.hover('.link-comment__comment-item:nth-of-type(2)');
await page.waitForTimeout(700);
console.log('\n=== hover：第二条评论的 ::before（应为半透明覆盖层）===');
const hov = await readPseudo(1);
console.log(JSON.stringify(hov, null, 1));
await page.screenshot({ path: path.join(outDir, 'cascade-after.png'), clip: box });

await browser.close();
server.close();

// 判定
const alpha = (() => {
  const m = String(hov.bg).match(/rgba?\([^)]*?,\s*([\d.]+)\)/);
  if (!m) return /rgb\(/.test(hov.bg) ? 1 : null;
  return parseFloat(m[1]);
})();

console.log('\n################ 判定 ################');
console.log(`分隔线颜色: ${sep.bg}（应为深色，非 #f3f4f5）`);
console.log(`hover 覆盖层: ${hov.bg}  alpha=${alpha}`);
const sepOk = !/243,\s*244,\s*245/.test(sep.bg);
const hoverOk = alpha !== null && alpha < 0.1;
console.log(`分隔线已改写: ${sepOk ? '是 ✅' : '否 ❌'}`);
console.log(`hover 覆盖层仍为半透明: ${hoverOk ? '是 ✅' : '否 ❌（内容会被盖住）'}`);
console.log(sepOk && hoverOk ? '\nPASS ✅' : '\nFAIL ❌');
console.log('截图: research/repro/cascade-before.png / cascade-after.png');
process.exit(sepOk && hoverOk ? 0 : 1);
