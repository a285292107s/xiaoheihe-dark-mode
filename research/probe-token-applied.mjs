/**
 * 修正版：确认「注入的令牌 override 是否真的生效」，再判断 JS 是否消费令牌。
 * 关键修正：
 *   - 用 !important + 晚于站点样式表插入（否则 :root 同优先级会输给站点）
 *   - 先自检令牌值是否被改写（防止实验无效）
 *   - 用稳定 URL（详情页），避免首页随机内容造成 A/B 噪声
 * node research/probe-token-applied.mjs
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

const browser = await chromium.launch({ headless: true, executablePath: exe });

const RED_TOKENS = `
  :root{
    --hb-neutral-800--value: 255, 0, 0 !important;
    --hb-neutral-700--value: 255, 0, 0 !important;
    --hb-neutral-600--value: 255, 0, 0 !important;
    --hb-neutral-300--value: 255, 0, 0 !important;
    --hb-primary--value: 255, 0, 0 !important;
    --hb-primary-dynamic--value: 255, 0, 0 !important;
    --hb-white-100--value: 255, 0, 0 !important;
    --hb-blue-100--value: 255, 0, 0 !important;
    --hb-general-color-text-2: rgb(255, 0, 0) !important;
    --hb-general-color-bg-4: rgb(255, 0, 0) !important;
  }`;

async function run(label, inject) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'zh-CN',
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  });

  if (inject) {
    await context.addInitScript((css) => {
      const apply = () => {
        const s = document.createElement('style');
        s.id = 'probe-tokens';
        s.textContent = css;
        // 追加到最后，并持续保持在最后，确保赢过站点样式表
        document.documentElement.appendChild(s);
      };
      if (document.documentElement) apply();
      else new MutationObserver((_, o) => { if (document.documentElement) { apply(); o.disconnect(); } })
        .observe(document, { childList: true, subtree: true });
    }, RED_TOKENS);
  }

  const page = await context.newPage();
  // 稳定 URL：详情页（内容固定，A/B 可比）
  await page.goto('https://www.xiaoheihe.cn/app/bbs/link/189860812', {
    waitUntil: 'domcontentloaded',
    timeout: 90000,
  });
  await page.waitForTimeout(8000);
  await page.evaluate(async () => {
    for (let i = 0; i < 6; i++) { window.scrollBy(0, 800); await new Promise((r) => setTimeout(r, 350)); }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(2500);

  const info = await page.evaluate(() => {
    const RED = /255,\s*0,\s*0/;
    const rootCS = getComputedStyle(document.documentElement);
    const selfCheck = {
      neutral800: rootCS.getPropertyValue('--hb-neutral-800').trim(),
      primary: rootCS.getPropertyValue('--hb-primary').trim(),
      white100: rootCS.getPropertyValue('--hb-white-100').trim(),
      generalText2: rootCS.getPropertyValue('--hb-general-color-text-2').trim(),
    };

    const inlineVals = new Map();
    let redInline = 0;
    for (const el of document.querySelectorAll('[style]')) {
      const s = el.getAttribute('style') || '';
      for (const d of s.matchAll(/(?:^|;)\s*(color|background(?:-color)?)\s*:\s*([^;]+)/g)) {
        const val = d[2].trim();
        inlineVals.set(val, (inlineVals.get(val) || 0) + 1);
        if (RED.test(val)) redInline++;
      }
    }

    let computedRed = 0;
    const redSamples = [];
    for (const el of document.querySelectorAll('body *')) {
      const cs = getComputedStyle(el);
      if (RED.test(cs.color) || RED.test(cs.backgroundColor)) {
        computedRed++;
        if (redSamples.length < 8) {
          redSamples.push({
            tag: el.tagName.toLowerCase(),
            cls: (typeof el.className === 'string' ? el.className : '').slice(0, 70),
            color: cs.color,
            bg: cs.backgroundColor,
          });
        }
      }
    }

    return {
      selfCheck,
      inlineTop: [...inlineVals].sort((a, b) => b[1] - a[1]).slice(0, 12),
      redInline,
      computedRed,
      redSamples,
    };
  });

  console.log(`\n===== ${label} =====`);
  console.log(JSON.stringify(info, null, 2));
  await context.close();
  return info;
}

const base = await run('A 基线（无注入）', false);
const inj = await run('B 注入红色令牌（!important，末位）', true);

const applied =
  inj.selfCheck.neutral800.includes('255, 0, 0') && inj.selfCheck.primary.includes('255, 0, 0');
console.log('\n########## 结论 ##########');
console.log('令牌 override 是否真的生效:', applied ? '是 ✅（实验有效）' : '否 ❌（实验无效）');
console.log('红色内联样式数:', inj.redInline, ' | 红色计算样式元素数:', inj.computedRed, '(基线', base.computedRed, ')');
if (applied) {
  console.log(
    '判定:',
    inj.computedRed > base.computedRed + 5 || inj.redInline > 0
      ? 'JS 在运行时读取 CSS 令牌 → 令牌层可以覆盖 JS 生成的内联颜色'
      : 'JS 内部硬编码颜色（不读令牌）→ 内联颜色必须单独处理',
  );
}

await browser.close();
console.log('DONE');
