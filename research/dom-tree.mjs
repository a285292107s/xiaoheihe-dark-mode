/**
 * 从 fixture 中还原 DOM 骨架：输出带 class / 关键属性的树，用于理解页面结构。
 * node research/dom-tree.mjs [fixtures/home.html] [maxDepth] [maxChildrenPerNode]
 */
import fs from 'node:fs';
import path from 'node:path';

const file = process.argv[2] || 'fixtures/home.html';
const maxDepth = Number(process.argv[3] || 6);
const maxKids = Number(process.argv[4] || 12);

const html = fs.readFileSync(path.resolve(file), 'utf8');

// 极简解析器：只关心标签 / class / id / data-v / 文本长度，跳过 script 内容
const VOID = new Set([
  'area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr',
]);

function parse(src) {
  const root = { tag: '#root', attrs: {}, children: [], depth: -1 };
  const stack = [root];
  let i = 0;
  while (i < src.length) {
    const lt = src.indexOf('<', i);
    if (lt < 0) break;
    if (src.startsWith('<!--', lt)) {
      const end = src.indexOf('-->', lt);
      i = end < 0 ? src.length : end + 3;
      continue;
    }
    const gt = src.indexOf('>', lt);
    if (gt < 0) break;
    const raw = src.slice(lt + 1, gt);
    if (raw.startsWith('/')) {
      if (stack.length > 1) stack.pop();
      i = gt + 1;
      continue;
    }
    const selfClose = raw.endsWith('/');
    const tag = raw.match(/^[a-zA-Z0-9-]+/)?.[0]?.toLowerCase();
    if (!tag) {
      i = gt + 1;
      continue;
    }
    const attrs = {};
    for (const m of raw.matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)) attrs[m[1].toLowerCase()] = m[2];
    const node = { tag, attrs, children: [], textLen: 0 };
    const parent = stack[stack.length - 1];
    parent.children.push(node);
    node.parent = parent;
    // 记录文本长度（粗略）
    if (tag === 'script' || tag === 'style') {
      const close = src.toLowerCase().indexOf(`</${tag}`, gt);
      i = close < 0 ? src.length : src.indexOf('>', close) + 1;
      continue;
    }
    if (!selfClose && !VOID.has(tag)) stack.push(node);
    i = gt + 1;
  }
  return root;
}

const tree = parse(html);

const lines = [];
let nodes = 0;
function walk(node, depth) {
  if (depth > maxDepth) return;
  const kids = node.children;
  const shown = kids.slice(0, maxKids);
  for (const kid of shown) {
    nodes++;
    const cls = (kid.attrs.class || '').split(/\s+/).filter(Boolean);
    const scoped = cls.filter((c) => c.startsWith('data-v-'));
    const real = cls.filter((c) => !c.startsWith('data-v-'));
    const bits = [];
    if (kid.attrs.id) bits.push(`#${kid.attrs.id}`);
    if (real.length) bits.push(`.${real.slice(0, 4).join('.')}`);
    if (scoped.length) bits.push(`[scoped]`);
    for (const k of ['role','href','aria-label','data-theme','type','placeholder','src']) {
      if (kid.attrs[k]) bits.push(`${k}=${JSON.stringify(kid.attrs[k]).slice(0, 46)}`);
    }
    const ownKids = kid.children.length;
    lines.push(`${'  '.repeat(depth)}${kid.tag}${bits.join(' ')}${ownKids ? `  (${ownKids})` : ''}`);
    walk(kid, depth + 1);
  }
  if (kids.length > shown.length) {
    lines.push(`${'  '.repeat(depth)}… +${kids.length - shown.length} more`);
  }
}

walk(tree, 0);
console.log(lines.join('\n'));
console.log(`\n--- shown nodes: ${nodes} | maxDepth=${maxDepth} ---`);

// 统计
const tagCount = new Map();
const classCount = new Map();
(function count(n) {
  for (const c of n.children) {
    tagCount.set(c.tag, (tagCount.get(c.tag) || 0) + 1);
    for (const cl of (c.attrs.class || '').split(/\s+/).filter(Boolean)) {
      if (cl.startsWith('data-v-')) continue;
      classCount.set(cl, (classCount.get(cl) || 0) + 1);
    }
    count(c);
  }
})(tree);
console.log('\nTOP TAGS:', [...tagCount].sort((a, b) => b[1] - a[1]).slice(0, 18).map(([k, v]) => `${k}:${v}`).join(' '));
console.log('TOP CLASSES:', [...classCount].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([k, v]) => `${k}:${v}`).join(' '));
console.log('TOTAL ELEMENTS:', [...tagCount.values()].reduce((a, b) => a + b, 0));
