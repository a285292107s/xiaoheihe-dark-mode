/**
 * 分析站点 CSS：设计令牌（自定义属性）、暗色相关选择器、媒体查询、硬编码颜色占比。
 * node research/analyze-css.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const dir = path.resolve('research/css');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.css'));
const all = files.map((f) => ({ f, text: fs.readFileSync(path.join(dir, f), 'utf8') }));

const blob = all.map((x) => x.text).join('\n');

const uniq = (arr) => [...new Set(arr)];

// ---------- 1) 自定义属性定义 ----------
const defined = new Map(); // name -> Set(files)
const definedInRootish = new Map();
for (const { f, text } of all) {
  for (const m of text.matchAll(/(--[\w-]+)\s*:\s*([^;{}]+)[;}]/g)) {
    const name = m[1];
    if (!defined.has(name)) defined.set(name, { files: new Set(), samples: [] });
    const rec = defined.get(name);
    rec.files.add(f);
    if (rec.samples.length < 3) rec.samples.push(m[2].trim().slice(0, 40));
  }
}
console.log(`=== 自定义属性定义总数: ${defined.size} ===`);

const groups = new Map();
for (const name of defined.keys()) {
  const g = name.match(/^--([a-z0-9]+(?:-[a-z0-9]+)?)/i)?.[1] || 'other';
  groups.set(g, (groups.get(g) || 0) + 1);
}
console.log('前缀分布:', [...groups].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([k, v]) => `${k}:${v}`).join(' '));

// ---------- 2) 暗色相关 ----------
console.log('\n=== 暗色相关信号 ===');
for (const [label, re] of [
  ['prefers-color-scheme', /prefers-color-scheme[^)]*\)/g],
  ['color-scheme:', /color-scheme\s*:\s*[^;{}]+/g],
  ['light-dark(', /light-dark\(/g],
  ['csstools-color-scheme', /--csstools-color-scheme--[\w-]+/g],
  ['html.dark / .dark', /(?:^|[\s,{}])(?:html)?\.dark[\s,{.:[]/g],
  ['[data-theme', /\[data-theme[^\]]*\]/g],
  ['dark-mode / darkmode', /dark-?mode/gi],
  ['theme attribute', /\bdata-(?:color-)?scheme\b/g],
  ['@media blocks', /@media[^{]{0,80}\{/g],
]) {
  const hits = uniq((blob.match(re) || []).map((s) => s.trim()));
  console.log(`${label.padEnd(24)} ${(blob.match(re) || []).length} 次 | 形态: ${hits.slice(0, 8).join(' | ') || '—'}`);
}

// ---------- 3) 媒体查询类型 ----------
const mq = new Map();
for (const m of blob.matchAll(/@media([^{]+)\{/g)) {
  const q = m[1].replace(/\s+/g, ' ').trim().slice(0, 60);
  mq.set(q, (mq.get(q) || 0) + 1);
}
console.log('\n=== @media 条件 TOP ===');
for (const [k, v] of [...mq].sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log(`  ${String(v).padStart(4)}  ${k}`);

// ---------- 4) 硬编码颜色 vs 令牌 ----------
const hexAll = blob.match(/#[0-9a-fA-F]{3,8}\b/g) || [];
const rgbAll = blob.match(/rgba?\([^)]*\)/g) || [];
const varUse = blob.match(/var\(\s*--[\w-]+/g) || [];
const hexInVar = (blob.match(/var\([^)]*\)/g) || []).length;
console.log('\n=== 颜色使用方式 ===');
console.log(`  hex 字面量        ${hexAll.length}`);
console.log(`  rgb/rgba 字面量   ${rgbAll.length}`);
console.log(`  var(--x) 引用     ${varUse.length}`);
const hexTop = new Map();
for (const h of hexAll) { const k = h.toLowerCase(); hexTop.set(k, (hexTop.get(k) || 0) + 1); }
console.log('  hex TOP20:', [...hexTop].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([k, v]) => `${k}(${v})`).join(' '));

const white = hexAll.filter((h) => /^#(fff|ffffff)$/i.test(h)).length;
const nearWhite = hexAll.filter((h) => /^#(f[0-9a-f]|e[0-9a-f]|f7f8f9|fafbfc)/i.test(h)).length;
console.log(`  纯白 #fff/#ffffff: ${white} | 近白: ${nearWhite}`);

// ---------- 5) :root 令牌块 ----------
console.log('\n=== :root / html 令牌块（前 3 个）===');
let shown = 0;
for (const { f, text } of all) {
  for (const m of text.matchAll(/(?::root|html)\s*\{([^{}]{40,})/g)) {
    if (shown++ >= 3) break;
    console.log(`--- ${f} ---`);
    console.log(m[1].split(';').filter((s) => s.trim()).slice(0, 40).join(';\n').slice(0, 3000));
  }
  if (shown >= 3) break;
}

// ---------- 6) 最大的文件里，选择器形态 ----------
const main = all.find((x) => x.f.includes('Cv4ia_mR'));
if (main) {
  const sels = main.text.match(/[^{}]+\{/g) || [];
  console.log(`\n=== 主包 ${main.f}: ${sels.length} 条规则 ===`);
  const withVar = sels.filter((s) => s.includes('var(')).length;
  console.log(`  含 var() 的规则: ${withVar}`);
}

fs.writeFileSync(
  path.resolve('research/css-inventory.json'),
  JSON.stringify(
    {
      totalBytes: blob.length,
      customProps: [...defined].map(([name, r]) => ({ name, files: [...r.files], samples: r.samples })),
      hexTop: [...hexTop].sort((a, b) => b[1] - a[1]).slice(0, 80),
      mediaQueries: [...mq].sort((a, b) => b[1] - a[1]),
    },
    null,
    2,
  ),
  'utf8',
);
console.log('\n→ research/css-inventory.json');
