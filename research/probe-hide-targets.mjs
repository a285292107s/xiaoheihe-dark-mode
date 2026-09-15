/**
 * 定位「隐藏首页 tab / 隐藏右侧栏」两个改动目标的真实 DOM：
 * 从 fixture 里找出含「首页」文本的候选节点、以及 #page-bbs-community > .content 的子节点。
 *
 *   node research/probe-hide-targets.mjs [fixtures/home.html]
 */
import fs from 'node:fs';
import path from 'node:path';

const file = process.argv[2] || 'fixtures/home.html';
const html = fs.readFileSync(path.resolve(file), 'utf8');

const VOID = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

function parse(src) {
  const root = { tag: '#root', attrs: {}, children: [], parent: null };
  const stack = [root];
  let i = 0;
  while (i < src.length) {
    const lt = src.indexOf('<', i);
    if (lt < 0) break;
    if (lt > i) {
      const text = src.slice(i, lt);
      if (text.trim()) stack[stack.length - 1].children.push({ tag: '#text', text, attrs: {}, children: [], parent: stack[stack.length - 1] });
    }
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
    if (raw.startsWith('!') || raw.startsWith('?')) { i = gt + 1; continue; }
    const selfClose = raw.endsWith('/');
    const tag = raw.match(/^[a-zA-Z0-9-]+/)?.[0]?.toLowerCase();
    if (!tag) { i = gt + 1; continue; }
    const attrs = {};
    for (const m of raw.matchAll(/([\w:.-]+)\s*=\s*"([^"]*)"/g)) attrs[m[1].toLowerCase()] = m[2];
    const node = { tag, attrs, children: [], parent: stack[stack.length - 1] };
    node.parent.children.push(node);
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

/** 收集节点自身的直接文本（不含后代文本） */
function ownText(node) {
  return node.children.filter((c) => c.tag === '#text').map((c) => c.text).join('');
}

function pathOf(node) {
  const parts = [];
  let n = node;
  while (n && n.tag !== '#root') {
    let seg = n.tag;
    if (n.attrs.id) seg += `#${n.attrs.id}`;
    const cls = (n.attrs.class || '').split(/\s+/).filter((c) => c && !c.startsWith('data-v-'));
    if (cls.length) seg += '.' + cls.slice(0, 3).join('.');
    const sibs = n.parent ? n.parent.children.filter((c) => c.tag === n.tag) : [];
    if (sibs.length > 1) seg += `:nth(${sibs.indexOf(n) + 1})`;
    parts.unshift(seg);
    n = n.parent;
  }
  return parts.join(' > ');
}

function textOf(node, limit = 60) {
  const out = [];
  (function walk(n) {
    if (out.join('').length > limit) return;
    if (n.tag === '#text') { out.push(n.text); return; }
    if (n.tag === 'script' || n.tag === 'style') return;
    for (const c of n.children) walk(c);
  })(node);
  return out.join('').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function all(node, out = []) {
  for (const c of node.children) { out.push(c); all(c, out); }
  return out;
}

const nodes = all(tree);
console.log(`总节点：${nodes.length}  (${file})\n`);

console.log('===== 含「首页」文本的节点 =====');
for (const n of nodes) {
  if (n.tag === 'script' || n.tag === 'style') continue;
  const t = textOf(n, 40);
  if (!t.includes('首页')) continue;
  const txt = ownText(n).replace(/\s+/g, ' ').trim();
  if (!txt) continue;
  console.log(`${pathOf(n)}`);
  console.log(`    text=${JSON.stringify(txt)}  ${JSON.stringify(n.attrs).slice(0, 200)}`);
}

console.log('\n===== #page-bbs-community 子树（前 4 层） =====');
const page = nodes.find((n) => n.attrs.id === 'page-bbs-community');
if (!page) {
  console.log('fixture 中没有 #page-bbs-community');
} else {
  (function walk(n, depth) {
    if (depth > 4) return;
    const cls = (n.attrs.class || '').split(/\s+/).filter((c) => c && !c.startsWith('data-v-'));
    const label = n.tag + (n.attrs.id ? `#${n.attrs.id}` : '') + (cls.length ? '.' + cls.slice(0, 3).join('.') : '');
    const t = textOf(n, 40);
    console.log(`${'  '.repeat(depth)}${label}${t ? `   «${t}»` : ''}`);
    for (const c of n.children) walk(c, depth + 1);
  })(page, 0);
}

console.log('\n===== .content 直接子节点 =====');
for (const n of nodes) {
  const cls = (n.attrs.class || '').split(/\s+/);
  if (!cls.includes('content')) continue;
  const kids = n.children.filter((c) => c.tag !== '#text');
  console.log(`${pathOf(n)}  -> ${kids.length} 个元素子节点`);
  kids.forEach((c, i) => {
    const cc = (c.attrs.class || '').split(/\s+/).filter((x) => x && !x.startsWith('data-v-'));
    console.log(`   [${i}] ${c.tag}${c.attrs.id ? '#' + c.attrs.id : ''}${cc.length ? '.' + cc.slice(0, 4).join('.') : ''}   «${textOf(c, 50)}»`);
  });
}
