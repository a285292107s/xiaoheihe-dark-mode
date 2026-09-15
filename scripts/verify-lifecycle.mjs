/**
 * 生命周期与启动竞态验收。
 *
 *   node scripts/verify-lifecycle.mjs
 *
 * 这些都是「读代码看不出来、必须实测」的行为，各自对应一个曾经的真实缺陷：
 *
 *   场景一  <head> 竞态：document-start 时 <html> 已存在而 <head> 可能还没有。
 *           startSheetObserver 若在此放弃，此后新增的 CSS 分片永远不会触发重建，
 *           整个会话漏掉 SPA 换路由的样式。用分块响应（先发 <html>，150ms 后发 <head>）
 *           固定复现该时序。
 *           实测：真实站点首包把 <head> 与 <html> 同批送达，所以线上不命中 ——
 *           本测试人为固定住这个时序，避免它随网络分包变化而回归。
 *
 *   场景二  内联写循环：就地改写内联颜色会触发 style 属性变更记录，而引擎正在监听
 *           该属性。判据若与 source 而非 current 比较，就会重复写入同一个值；
 *           是否演变成 80ms 常驻循环取决于「写入相同值是否派发变更记录」这一
 *           浏览器特定行为。空闲期必须以 0 次写入为准。
 *
 *   场景三  脱离文档的样式表：collect() 只遍历 document.styleSheets，被卸载的
 *           样式表不会再出现在其中。若仍被强引用，已卸载的样式表无法回收。
 *           同时必须保证在册样式表不被子误剪 —— 否则关闭深色时无法还原。
 *
 *   场景四  url() 保护：COLOR_TOKEN 里的裸颜色名会命中 url() 路径
 *           （`icon_white.png`）与 SVG 引用（`#fade`）。
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

const userscript = fs.readFileSync(path.resolve('dist/xiaoheihe-dark-mode.user.js'), 'utf8');
const code = userscript.replace(/^\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==\s*/, '');

const checks = [];
const check = (name, ok, detail) => {
  checks.push({ name, ok: !!ok });
  if (!ok) console.log(`  ❌ ${name}  ${detail ?? ''}`);
};

/** 深色偏好必须在脚本执行前落到 localStorage，否则引擎默认关闭，测试会空跑通过 */
const SEED_DARK = () => {
  try { localStorage.setItem('heybox-dark-mode', '1'); } catch {}
};

const HEAD_PART = `<head><meta charset="utf-8"><title>lifecycle</title>
<style>
  :root { background-color: #f7f8f9; }
  html, body { margin: 0; }
  .card { background-color: #ffffff; color: #1a1a1a; border: 1px solid #e5e7eb; padding: 12px; }
</style></head><body><div class="card">卡片</div></body></html>`;

const server = (handler) => {
  const s = http.createServer(handler);
  return new Promise((resolve) => s.listen(0, '127.0.0.1', () => resolve(s)));
};

const browser = await chromium.launch({ headless: true, executablePath: exe });
const servers = [];

async function newPage({ origin, seed = SEED_DARK, pre = null }) {
  const context = await browser.newContext({ viewport: { width: 900, height: 700 } });
  if (seed) await context.addInitScript(seed);
  if (pre) await context.addInitScript(pre);
  await context.addInitScript(code);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });
  await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 30000 });
  return { context, page, errors };
}

// ---------- 场景一：<head> 晚于 <html> 到达 ----------
console.log('\n===== 场景一：document-start 时 <head> 尚不存在 =====');
{
  const s = await server((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.write('<!doctype html><html lang="zh-CN">'); // 此刻 document.head === null
    setTimeout(() => res.end(HEAD_PART), 150);
  });
  servers.push(s);
  const { context, page, errors } = await newPage({ origin: `http://127.0.0.1:${s.address().port}/` });

  // 越过 0/300/1200/2800ms 全部里程碑与 DOMContentLoaded/load
  await page.waitForTimeout(6000);

  const first = await page.evaluate(() => ({
    dark: document.documentElement.classList.contains('hb-dark'),
    card: getComputedStyle(document.querySelector('.card')).backgroundColor,
    scanned: window.__hbEngineStats().scanned,
  }));
  check('首屏已深色（防空跑：里程碑路径确实跑过）', first.dark && first.card === 'rgb(38, 44, 51)', JSON.stringify(first));

  // 关键：全部里程碑之后注入新样式表，只有 headObserver 装着才会触发重建
  await page.evaluate(() => {
    const st = document.createElement('style');
    st.textContent = '#hb-late{background-color:#ffffff;color:#1a1a1a;display:block;width:40px;height:40px}';
    document.head.appendChild(st);
    const d = document.createElement('div');
    d.id = 'hb-late';
    d.textContent = 'late';
    document.body.appendChild(d);
  });
  await page.waitForTimeout(1600);

  const late = await page.evaluate(() => ({
    bg: getComputedStyle(document.getElementById('hb-late')).backgroundColor,
    scanned: window.__hbEngineStats().scanned,
  }));
  check('晚到的样式表被重映射（headObserver 已装上）', late.bg === 'rgb(38, 44, 51)', `bg=${late.bg}`);
  check('引擎确实重跑过（扫描规则数增加）', late.scanned > first.scanned, `${first.scanned} -> ${late.scanned}`);
  check('无 JS 报错', errors.length === 0, errors.join(' | '));
  await context.close();
}

// ---------- 场景二：内联观察器不得自激 ----------
console.log('\n===== 场景二：空闲期不得有内联写入 =====');
{
  const s = await server((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end('<!doctype html><html lang="zh-CN">' + HEAD_PART);
  });
  servers.push(s);

  const PATCH = () => {
    window.__sp = { total: 0, redundant: 0 };
    const orig = CSSStyleDeclaration.prototype.setProperty;
    CSSStyleDeclaration.prototype.setProperty = function (p, v, prio) {
      window.__sp.total++;
      if (this.getPropertyValue(p) === v) window.__sp.redundant++;
      return orig.call(this, p, v, prio);
    };
  };
  const INJECT_INLINE = () => {
    document.addEventListener('DOMContentLoaded', () => {
      const d = document.createElement('div');
      d.id = 'inline-target';
      d.setAttribute('style', 'background-color:#ffffff;color:#1a1a1a;border:1px solid #e5e7eb');
      document.body.appendChild(d);
    });
  };

  const context = await browser.newContext({ viewport: { width: 900, height: 700 } });
  await context.addInitScript(SEED_DARK);
  await context.addInitScript(PATCH);
  await context.addInitScript(INJECT_INLINE);
  await context.addInitScript(code);
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${s.address().port}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(5000);

  const target = await page.evaluate(() => {
    const cs = getComputedStyle(document.getElementById('inline-target'));
    return { bg: cs.backgroundColor, color: cs.color };
  });
  check('内联颜色确实被深色化（防空跑）', target.bg === 'rgb(38, 44, 51)', JSON.stringify(target));

  const a = await page.evaluate(() => ({ ...window.__sp }));
  await page.waitForTimeout(3000); // 空闲 3 秒，不碰任何 DOM
  const b = await page.evaluate(() => ({ ...window.__sp }));
  check('空闲 3 秒内 0 次 setProperty（不自激）', b.total - a.total === 0, `空闲期写入 ${b.total - a.total} 次`);
  check('空闲期无冗余写入', b.redundant - a.redundant === 0, `冗余 ${b.redundant - a.redundant} 次`);
  await context.close();
}

// ---------- 场景三：脱离文档的样式表被剪除，在册样式表保留 ----------
console.log('\n===== 场景三：跟踪集约束在文档规模内 =====');
{
  const s = await server((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end('<!doctype html><html lang="zh-CN">' + HEAD_PART);
  });
  servers.push(s);
  const { context, page, errors } = await newPage({ origin: `http://127.0.0.1:${s.address().port}/` });
  await page.waitForTimeout(4000);

  const before = await page.evaluate(() => window.__hbEngineStats().tracked);

  const added = await page.evaluate(() => {
    const st = document.createElement('style');
    st.id = 'hb-detachable';
    st.textContent = '#hb-prune-a{background-color:#ffffff}#hb-prune-b{background-color:#fafbfc}';
    document.head.appendChild(st);
    window.__hbRebuild();
    return window.__hbEngineStats().tracked;
  });
  check('新样式表被纳入跟踪（防空跑：剪除逻辑真的有机会触发）', added > before, `${before} -> ${added}`);

  const afterRemove = await page.evaluate(() => {
    document.getElementById('hb-detachable').remove();
    window.__hbRebuild();
    return window.__hbEngineStats().tracked;
  });
  check('样式表卸载后跟踪集收缩', afterRemove < added, `${added} -> ${afterRemove}`);

  // 阴性对照：在册样式表不得被误剪，否则关闭深色时无法还原
  const restored = await page.evaluate(() => {
    window.__hbSetDark(false);
    return getComputedStyle(document.querySelector('.card')).backgroundColor;
  });
  await page.waitForTimeout(400);
  const restored2 = await page.evaluate(() =>
    getComputedStyle(document.querySelector('.card')).backgroundColor);
  check('在册样式表仍能还原（剪除未误伤）', restored2 === 'rgb(255, 255, 255)', `card=${restored2} (${restored})`);
  check('无 JS 报错', errors.length === 0, errors.join(' | '));
  await context.close();
}

// ---------- 场景四：url() 路径与 SVG 引用不被改写 ----------
console.log('\n===== 场景四：url() 内容逐字节保留 =====');
{
  const s = await server((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end('<!doctype html><html lang="zh-CN">' + HEAD_PART);
  });
  servers.push(s);
  const { context, page, errors } = await newPage({ origin: `http://127.0.0.1:${s.address().port}/` });
  await page.waitForTimeout(4000);

  const out = await page.evaluate(() => {
    const st = document.createElement('style');
    st.id = 'hb-url-probe';
    st.textContent = [
      '#u1{background-image:url(/assets/icon_white.png)}',
      '#u2{background-image:url(#fade)}',
      '#u3{background-color:#ffffff}',
      '#u4{border-image:url(/assets/red-black.svg) 30}',
    ].join('');
    document.head.appendChild(st);
    window.__hbRebuild();
    const sheet = [...document.styleSheets].find((x) => x.ownerNode === st);
    const read = (i) => {
      const st2 = sheet.cssRules[i].style;
      return { img: st2.getPropertyValue('background-image'), bg: st2.getPropertyValue('background-color'), bi: st2.getPropertyValue('border-image-source') };
    };
    return { u1: read(0), u2: read(1), u3: read(2), u4: read(3) };
  });

  check('url(icon_white.png) 未被改写', out.u1.img.includes('icon_white.png') && !out.u1.img.includes('rgb('), out.u1.img);
  check('url(#fade) 未被改写', out.u2.img.includes('#fade') && !out.u2.img.includes('rgb('), out.u2.img);
  check('同一样式表里的颜色仍被改写（防空跑）', out.u3.bg === 'rgb(38, 44, 51)', out.u3.bg);
  check('border-image 里的 url 未被改写', out.u4.bi.includes('red-black.svg') && !out.u4.bi.includes('rgb('), out.u4.bi);
  check('无 JS 报错', errors.length === 0, errors.join(' | '));
  await context.close();
}

await browser.close();
for (const s of servers) s.close();

const failed = checks.filter((c) => !c.ok).length;
console.log(`\n共 ${checks.length} 项断言，失败 ${failed} 项`);
if (failed) {
  console.log('########## 生命周期验收：失败 ❌ ##########');
  process.exit(1);
}
console.log('########## 生命周期验收：全部通过 ✅ ##########');
