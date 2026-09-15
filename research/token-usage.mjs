/**
 * 令牌角色审计：统计每个令牌被引用多少次、被哪些「角色属性」使用。
 * 这决定深色模式下能否安全反转该令牌。
 * node research/token-usage.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const dir = path.resolve('research/css');
const blob = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith('.css'))
  .map((f) => fs.readFileSync(path.join(dir, f), 'utf8'))
  .join('\n');

// 把 blob 切成 { selector, body } 规则
const rules = [];
for (const m of blob.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
  rules.push({ sel: m[1].trim(), body: m[2] });
}
console.log(`规则数: ${rules.length}`);

// 属性名归一：background-color / background / color / border-color / box-shadow ...
const ROLE = (prop) => {
  const p = prop.toLowerCase();
  if (p === 'color' || p.endsWith('-color') && !p.startsWith('background')) {
    if (p === 'color') return 'FG(text)';
    if (p.includes('background')) return 'BG';
    if (p.includes('border') || p.includes('outline')) return 'BORDER';
    if (p.includes('shadow')) return 'SHADOW';
    if (p.includes('fill') || p.includes('stroke')) return 'SVG';
    return 'OTHER:' + p;
  }
  if (p === 'background' || p.startsWith('background')) return 'BG';
  if (p.includes('box-shadow') || p.includes('text-shadow')) return 'SHADOW';
  if (p === 'fill' || p === 'stroke' || p.startsWith('stroke-')) return 'SVG';
  if (p.includes('border') || p.includes('outline')) return 'BORDER';
  return 'OTHER:' + p;
};

const stats = new Map(); // token -> { total, roles: Map, sels: [] }
function bump(token, role, sel) {
  if (!stats.has(token)) stats.set(token, { total: 0, roles: new Map(), sels: [] });
  const s = stats.get(token);
  s.total++;
  s.roles.set(role, (s.roles.get(role) || 0) + 1);
  if (s.sels.length < 4) s.sels.push(sel.replace(/\s+/g, ' ').slice(0, 80));
}

for (const { sel, body } of rules) {
  for (const decl of body.split(';')) {
    const idx = decl.indexOf(':');
    if (idx < 0) continue;
    const prop = decl.slice(0, idx).trim();
    const val = decl.slice(idx + 1);
    if (!val.includes('var(')) continue;
    for (const vm of val.matchAll(/var\(\s*(--[\w-]+)/g)) {
      bump(vm[1], ROLE(prop), sel);
    }
  }
}

const KEY = [
  '--hb-primary',
  '--hb-primary-dynamic',
  '--hb-white-100',
  '--hb-black-100',
  '--hb-other-1',
  ...[100, 200, 300, 400, 500, 600, 700, 800].map((n) => `--hb-neutral-${n}`),
  '--hb-blue-100', '--hb-green-100', '--hb-red-100', '--hb-orange-100', '--hb-yellow-100',
  '--hb-general-color-primary', '--hb-general-color-plain',
  '--hb-general-color-text-1', '--hb-general-color-text-2', '--hb-general-color-text-3',
  '--hb-general-color-text-4', '--hb-general-color-text-5', '--hb-general-color-text-6',
  '--hb-general-color-stroke-0', '--hb-general-color-stroke-1', '--hb-general-color-stroke-2', '--hb-general-color-stroke-3',
  '--hb-general-color-bg-0', '--hb-general-color-bg-1', '--hb-general-color-bg-2',
  '--hb-general-color-bg-3', '--hb-general-color-bg-4', '--hb-general-color-bg-5', '--hb-general-color-bg-6',
];

console.log('\n=== 关键令牌的角色分布（引用计数）===');
console.log('token'.padEnd(34), 'total'.padStart(6), '  roles');
for (const k of KEY) {
  const s = stats.get(k);
  if (!s) { console.log(k.padEnd(34), '0'.padStart(6), '  (无引用)'); continue; }
  const roles = [...s.roles].sort((a, b) => b[1] - a[1]).map(([r, n]) => `${r}:${n}`).join(' ');
  console.log(k.padEnd(34), String(s.total).padStart(6), ' ', roles);
}

console.log('\n=== 各令牌的示例选择器 ===');
for (const k of KEY) {
  const s = stats.get(k);
  if (!s || !s.sels.length) continue;
  console.log(`\n${k}`);
  for (const sel of s.sels) console.log(`   ${sel}`);
}

// 原子层 vs 语义层的总引用量
let atom = 0, sem = 0, other = 0;
for (const [k, s] of stats) {
  if (/^--hb-general-/.test(k)) sem += s.total;
  else if (/^--hb-(neutral|primary|white|black|blue|green|red|orange|yellow|other)/.test(k)) atom += s.total;
  else other += s.total;
}
console.log(`\n=== 引用总量 ===\n  语义层 --hb-general-*: ${sem}\n  原子层 --hb-*: ${atom}\n  其他(el-*/nav-*等): ${other}`);

// 输出完整 json 便于后续生成覆盖层
fs.writeFileSync(
  path.resolve('research/token-usage.json'),
  JSON.stringify(
    [...stats].map(([token, s]) => ({
      token,
      total: s.total,
      roles: Object.fromEntries(s.roles),
      samples: s.sels,
    })).sort((a, b) => b.total - a.total),
    null,
    2,
  ),
  'utf8',
);
console.log('→ research/token-usage.json');
