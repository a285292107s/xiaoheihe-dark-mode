/**
 * 原型验证：把 hb-dark-engine.js 注入真实页面，量化并出图。
 * node research/proto-run.mjs
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

const engine = fs.readFileSync(path.resolve('research/hb-dark-engine.js'), 'utf8');
const outDir = path.resolve('output/proto');
fs.mkdirSync(outDir, { recursive: true });

const TARGETS = [
  { name: 'home', url: 'https://www.xiaoheihe.cn/app/bbs/home' },
  { name: 'detail', url: 'https://www.xiaoheihe.cn/app/bbs/link/189860812' },
];

const browser = await chromium.launch({ headless: true, executablePath: exe });

async function shot(name, url) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    locale: 'zh-CN',
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(7000);
  await page.evaluate(async () => {
    for (let i = 0; i < 5; i++) { window.scrollBy(0, 800); await new Promise((r) => setTimeout(r, 350)); }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(2500);

  await page.screenshot({ path: path.join(outDir, `${name}-light.png`) });

  const measure = () =>
    page.evaluate(() => {
      const out = { lightSurfaces: 0, samples: [], lowContrast: 0, nodes: document.querySelectorAll('body *').length };
      const lumOf = (s) => {
        const m = String(s).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (!m) return null;
        return 0.2126 * +m[1] + 0.7152 * +m[2] + 0.0722 * +m[3];
      };
      for (const el of document.querySelectorAll('body *')) {
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        if (r.width < 40 || r.height < 20) continue;
        const l = lumOf(cs.backgroundColor);
        if (l !== null && l > 200 && !/rgba\(0,\s*0,\s*0,\s*0\)/.test(cs.backgroundColor)) {
          out.lightSurfaces++;
          if (out.samples.length < 8) out.samples.push({
            tag: el.tagName.toLowerCase(),
            cls: (typeof el.className === 'string' ? el.className : '').slice(0, 60),
            bg: cs.backgroundColor,
          });
        }
        const fl = lumOf(cs.color);
        if (fl !== null && l !== null && Math.abs(l - fl) < 40 && r.width > 60) out.lowContrast++;
      }
      return out;
    });

  const before = await measure();

  await page.addScriptTag({ content: engine });
  const t0 = Date.now();
  const stats = await page.evaluate(() => {
    window.__hbDarkProto.enable();
    return { ...window.__hbDarkProto.stats(), bytes: window.__hbDarkProto.cssSize() };
  });
  const ms = Date.now() - t0;
  await page.waitForTimeout(3000);

  const after = await measure();
  await page.screenshot({ path: path.join(outDir, `${name}-dark.png`) });

  const sample = await page.evaluate(() => window.__hbDarkProto.cssSample(14));

  console.log(`\n===== ${name} =====`);
  console.log(JSON.stringify({ ms, stats, before, after, errors: errors.slice(0, 5) }, null, 1));
  console.log('--- 生成规则样例 ---');
  sample.forEach((s) => console.log('  ' + s.slice(0, 180)));

  await context.close();
}

for (const t of TARGETS) await shot(t.name, t.url);
await browser.close();
console.log('\nDONE');
