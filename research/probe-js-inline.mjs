import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { resolveChromePath } from '../scripts/lib/chromium.mjs';

const require = createRequire(import.meta.url);
const cliRoot = path.join(process.env.APPDATA || '', 'npm/node_modules/@playwright/cli');
const { chromium } = require(path.join(cliRoot, 'node_modules/playwright'));

const exe = resolveChromePath();

const browser = await chromium.launch({ headless: true, executablePath: exe });

async function run(label, injectTokens) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'zh-CN',
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  });

  if (injectTokens) {
    await context.addInitScript(() => {
      const s = document.createElement('style');
      s.textContent = `
        :root{
          --hb-neutral-800--value: 255, 0, 0;
          --hb-neutral-700--value: 255, 0, 0;
          --hb-neutral-600--value: 255, 0, 0;
          --hb-primary--value: 255, 0, 0;
          --hb-primary-dynamic--value: 255, 0, 0;
          --hb-white-100--value: 255, 0, 0;
          --hb-general-color-text-2: rgb(255, 0, 0);
          --hb-general-color-bg-4: rgb(255, 0, 0);
        }`;
      const add = () => (document.head || document.documentElement).appendChild(s);
      if (document.documentElement) add();
      else new MutationObserver((_, o) => { if (document.documentElement) { add(); o.disconnect(); } })
        .observe(document, { childList: true, subtree: true });
    });
  }

  const page = await context.newPage();
  await page.goto('https://www.xiaoheihe.cn/app/bbs/home', {
    waitUntil: 'domcontentloaded',
    timeout: 90000,
  });
  await page.waitForTimeout(7000);
  await page.evaluate(async () => {
    for (let i = 0; i < 5; i++) { window.scrollBy(0, 700); await new Promise((r) => setTimeout(r, 400)); }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(2500);

  const info = await page.evaluate(() => {
    const RED = /rgb\(255,\s*0,\s*0\)/;
    const inlineVals = new Map();
    let redInline = 0;
    const richNodeColors = new Set();
    for (const el of document.querySelectorAll('[style]')) {
      const s = el.getAttribute('style') || '';
      const m = s.match(/(?:^|;)\s*(color|background(?:-color)?)\s*:\s*([^;]+)/g);
      if (m) for (const d of m) {
        const val = d.split(':').slice(1).join(':').trim();
        inlineVals.set(val, (inlineVals.get(val) || 0) + 1);
        if (RED.test(val)) redInline++;
      }
      if (el.classList.contains('bbs-new-style-bottom__rich-node')) {
        richNodeColors.add(getComputedStyle(el).color);
      }
    }
    let computedRed = 0;
    for (const el of document.querySelectorAll('body *')) {
      const cs = getComputedStyle(el);
      if (RED.test(cs.color) || RED.test(cs.backgroundColor)) computedRed++;
    }
    return {
      inlineDistinct: [...inlineVals].sort((a, b) => b[1] - a[1]).slice(0, 14),
      redInline,
      richNodeColors: [...richNodeColors],
      computedRed,
      tokenProbe: {
        neutral800: getComputedStyle(document.documentElement).getPropertyValue('--hb-neutral-800'),
        primary: getComputedStyle(document.documentElement).getPropertyValue('--hb-primary'),
        white100: getComputedStyle(document.documentElement).getPropertyValue('--hb-white-100'),
        generalText2: getComputedStyle(document.documentElement).getPropertyValue('--hb-general-color-text-2'),
      },
    };
  });

  console.log(`\n===== ${label} =====`);
  console.log(JSON.stringify(info, null, 2));
  await context.close();
  return info;
}

const before = await run('A: 不注入令牌（基线）', false);
const after = await run('B: 注入红色令牌', true);

console.log('\n\n########## 结论 ##########');
console.log('基线 inline 颜色种类:', before.inlineDistinct.length);
console.log('注入后 computedRed 元素数:', after.computedRed, '(基线:', before.computedRed, ')');
console.log('注入后 redInline:', after.redInline);
console.log('rich-node 计算颜色  基线:', before.richNodeColors, ' -> 注入后:', after.richNodeColors);
console.log(
  '判定:',
  after.computedRed > before.computedRed || after.redInline > 0
    ? 'JS/浏览器确实消费 CSS 令牌 —— 令牌层有效'
    : '令牌未被消费（JS 内硬编码）—— 必须走 CSS 文本变换',
);

await browser.close();
console.log('DONE');
