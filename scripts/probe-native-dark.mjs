/**
 * 探测：小黑盒是否原生支持 prefers-color-scheme 深色。
 * 不注入任何脚本，纯看站点自身行为。
 * node scripts/probe-native-dark.mjs
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const cliRoot = path.join(process.env.APPDATA || '', 'npm/node_modules/@playwright/cli');
const { chromium } = require(path.join(cliRoot, 'node_modules/playwright'));

const outDir = path.resolve('output/playwright');
fs.mkdirSync(outDir, { recursive: true });

const exe =
  process.env.CHROME_PATH ||
  path.join(process.env.LOCALAPPDATA || '', 'ms-playwright/chromium-1234/chrome-win64/chrome.exe');

const TARGET = process.argv[2] || 'https://www.xiaoheihe.cn/app/bbs/home';
const TAG = 'probe-' + (process.argv[3] || 'home');

const browser = await chromium.launch({ headless: true, executablePath: exe });

async function probe(scheme) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'zh-CN',
    colorScheme: scheme,
  });
  const page = await context.newPage();
  await page.goto(TARGET, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(6000);

  const shot = path.join(outDir, `${TAG}-native-${scheme}.png`);
  await page.screenshot({ path: shot, fullPage: false });

  const info = await page.evaluate(() => {
    const root = document.documentElement;
    const body = getComputedStyle(document.body);
    const sample = (name) =>
      getComputedStyle(root).getPropertyValue(name).trim() || null;

    // 统计浅色表面数量
    let light = 0;
    let dark = 0;
    const lightList = [];
    for (const el of document.querySelectorAll('body *')) {
      const cs = getComputedStyle(el);
      const bg = cs.backgroundColor;
      if (!bg || bg === 'transparent' || bg === 'rgba(0, 0, 0, 0)') continue;
      const m = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (!m) continue;
      const [r, g, b] = [+m[1], +m[2], +m[3]];
      const w = el.getBoundingClientRect().width;
      const h = el.getBoundingClientRect().height;
      if (w < 40 || h < 20) continue;
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      if (lum > 210) {
        light++;
        if (lightList.length < 12) {
          const cls = typeof el.className === 'string' ? el.className : '';
          lightList.push({
            tag: el.tagName.toLowerCase(),
            class: cls.slice(0, 100) || undefined,
            bg,
          });
        }
      } else if (lum < 80) {
        dark++;
      }
    }

    return {
      htmlClass: root.className,
      htmlStyle: root.getAttribute('style') || null,
      colorSchemeProp: getComputedStyle(root).colorScheme,
      bodyBg: body.backgroundColor,
      bodyColor: body.color,
      vars: {
        csstoolsLight: sample('--csstools-color-scheme--light'),
        csstoolsDark: sample('--csstools-color-scheme--dark'),
        hbPrimary: sample('--hb-primary'),
        hbWhite100: sample('--hb-white-100'),
        hbNeutral100: sample('--hb-neutral-100'),
        elBg: sample('--el-bg-color'),
        elPage: sample('--el-bg-color-page'),
        elTextPrimary: sample('--el-text-color-primary'),
      },
      lightSurfaceCount: light,
      darkSurfaceCount: dark,
      lightSurfaceSample: lightList,
      styleSheets: [...document.styleSheets].length,
    };
  });

  console.log(JSON.stringify({ scheme, shot, info }, null, 2));
  await context.close();
}

await probe('light');
await probe('dark');
await browser.close();
console.log('DONE');
