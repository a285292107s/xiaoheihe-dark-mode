import { createRequire } from 'node:module';
import path from 'node:path';
import { resolveChromePath } from '../scripts/lib/chromium.mjs';

const require = createRequire(import.meta.url);
const cliRoot = path.join(process.env.APPDATA || '', 'npm/node_modules/@playwright/cli');
const { chromium } = require(path.join(cliRoot, 'node_modules/playwright'));

const exe = resolveChromePath();

const URL = 'https://www.xiaoheihe.cn/app/bbs/link/192726231';

const cdp = async (client, method, params) => (await client.send(method, params));

const browser = await chromium.launch({ headless: true, executablePath: exe });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  locale: 'zh-CN',
  userAgent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
});
const page = await context.newPage();
const client = await context.newCDPSession(page);

await cdp(client, 'Page.enable', {});
await cdp(client, 'Page.addScriptToEvaluateOnNewDocument', {
  source: `(function(){ window.__hbLog = { copyListeners: [], dtCalls: [] };
    const origAEL = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function (type, fn, opts) {
      try { if (String(type).toLowerCase() === 'copy') window.__hbLog.copyListeners.push((this === window ? 'window' : this === document ? 'document' : this.tagName) + ':' + String(fn).slice(0, 60)); } catch (e) {}
      return origAEL.call(this, type, fn, opts); };
    for (const m of ['setData', 'clearData']) { const o = DataTransfer.prototype[m]; DataTransfer.prototype[m] = function (a, b) { window.__hbLog.dtCalls.push(m + ':' + String(b).slice(0, 30)); return o.apply(this, arguments); }; } })();`,
});

await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(6000);

const mask = await page.evaluate(() => !!document.querySelector('[class*=t-mask]') || !!document.querySelector('iframe[src*=captcha], iframe[src*=guard]'));
console.log('验证码遮罩:', mask);
if (mask) {
  await page.screenshot({ path: 'output/probe7-captcha.png' });
  await browser.close();
  console.log('（干净环境也撞验证码，无法对照）');
  process.exit(0);
}

const sel = await page.evaluate(() => {
  const p = [...document.querySelectorAll('P.children-item__comment-content')].find((x) => x.textContent.trim().length > 8);
  if (!p) return { err: 'no reply element' };
  const rg = document.createRange();
  rg.selectNodeContents(p);
  const s = getSelection();
  s.removeAllRanges();
  s.addRange(rg);
  return { sel: s.toString().slice(0, 50) };
});
console.log('选区:', JSON.stringify(sel));
if (sel.err) {
  await browser.close();
  process.exit(1);
}

await cdp(client, 'Input.dispatchKeyEvent', { type: 'rawKeyDown', windowsVirtualKeyCode: 17, code: 'ControlLeft', key: 'Control', modifiers: 2 });
await cdp(client, 'Input.dispatchKeyEvent', { type: 'keyDown', windowsVirtualKeyCode: 67, code: 'KeyC', key: 'c', modifiers: 2 });
await cdp(client, 'Input.dispatchKeyEvent', { type: 'keyUp', windowsVirtualKeyCode: 67, code: 'KeyC', key: 'c', modifiers: 2 });
await cdp(client, 'Input.dispatchKeyEvent', { type: 'keyUp', windowsVirtualKeyCode: 17, code: 'ControlLeft', key: 'Control', modifiers: 0 });
await page.waitForTimeout(400);

await page.evaluate(() => {
  const ed = document.createElement('div');
  ed.id = 'hb-paste-probe';
  ed.contentEditable = 'true';
  ed.style.cssText = 'position:fixed;left:-9999px;top:0;width:400px;height:100px;';
  document.body.appendChild(ed);
  ed.focus();
});
await cdp(client, 'Input.dispatchKeyEvent', { type: 'rawKeyDown', windowsVirtualKeyCode: 86, code: 'KeyV', key: 'v', modifiers: 2 });
await cdp(client, 'Input.dispatchKeyEvent', { type: 'keyUp', windowsVirtualKeyCode: 86, code: 'KeyV', key: 'v', modifiers: 2 });
await page.waitForTimeout(500);

const result = await page.evaluate(() => {
  const ed = document.getElementById('hb-paste-probe');
  const out = ed ? ed.innerText.trim() : null;
  if (ed) ed.remove();
  return { pasted: (out || '').slice(0, 80), log: window.__hbLog, selStill: getSelection().toString().slice(0, 40) };
});
console.log('干净环境粘贴结果:', JSON.stringify(result, null, 2));

await browser.close();
