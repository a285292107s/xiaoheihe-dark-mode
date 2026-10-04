import fs from 'node:fs';
import path from 'node:path';

const mode = process.argv[2] || 'all';
const file = process.argv[3] || 'fixtures/detail.html';
const html = fs.readFileSync(path.resolve(file), 'utf8');

const VOID = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta',
  'param', 'source', 'track', 'wbr',
]);

function parse(src) {
  const root = { tag: '#root', attrs: {}, children: [], parent: null, text: '' };
  const stack = [root];
  let i = 0;
  const pushText = (t) => {
    const txt = t.replace(/\s+/g, ' ');
    if (txt.trim()) stack[stack.length - 1].text += txt;
  };
  while (i < src.length) {
    const lt = src.indexOf('<', i);
    if (lt < 0) { pushText(src.slice(i)); break; }
    pushText(src.slice(i, lt));
    if (src.startsWith('<!--', lt)) {
      const end = src.indexOf('-->', lt);
      const body = src.slice(lt + 4, end < 0 ? src.length : end);
      const parent = stack[stack.length - 1];
      parent.children.push({ tag: '#comment', attrs: {}, children: [], parent, text: body, comment: body });
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
    if (!tag) { i = gt + 1; continue; }
    const attrs = {};
    for (const m of raw.matchAll(/([\w:.-]+)\s*=\s*"([^"]*)"/g)) attrs[m[1].toLowerCase()] = m[2];
    const node = { tag, attrs, children: [], parent: stack[stack.length - 1], text: '' };
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

function classes(node) {
  return (node.attrs.class || '').split(/\s+/).filter(Boolean);
}
function hasClass(node, cls) {
  return classes(node).includes(cls);
}
function findAll(node, pred, out = []) {
  for (const kid of node.children) {
    if (pred(kid)) out.push(kid);
    findAll(kid, pred, out);
  }
  return out;
}
const byClass = (node, cls) => findAll(node, (n) => hasClass(n, cls));
const byTag = (node, tag) => findAll(node, (n) => n.tag === tag.toLowerCase());

function ownText(node) {
  return node.text.replace(/\s+/g, ' ').trim();
}
function allText(node) {
  let s = node.text;
  for (const kid of node.children) {
    if (kid.tag === '#comment') continue;
    s += allText(kid);
  }
  return s.replace(/\s+/g, ' ').trim();
}

const SKIP_ATTRS = new Set(['class', 'style']);

function label(node, opts = {}) {
  const bits = [node.tag];
  const cls = classes(node);
  if (cls.length) bits.push('.' + cls.slice(0, opts.maxCls || 6).join('.'));
  for (const [k, v] of Object.entries(node.attrs)) {
    if (SKIP_ATTRS.has(k) || k.startsWith('data-v-')) continue;
    bits.push(`${k}="${v.length > 60 ? v.slice(0, 60) + '…' : v}"`);
  }
  return bits.join(' ');
}

function dump(node, depth, maxDepth, out, opts = {}) {
  const indent = '  '.repeat(depth);
  if (node.tag === '#comment') {
    out.push(`${indent}#comment<!--${node.comment}-->`);
    return;
  }
  const t = ownText(node);
  const tail = t ? `   #text ${JSON.stringify(t.length > 70 ? t.slice(0, 70) + '…' : t)}` : '';
  out.push(`${indent}${label(node, opts)}${tail}`);
  if (depth >= maxDepth) {
    if (node.children.length) out.push(`${indent}  … (${node.children.length} children 截断)`);
    return;
  }
  for (const kid of node.children) dump(kid, depth + 1, maxDepth, out, opts);
}

function lineItemSkeleton(row, maxDepth, opts = {}) {
  const out = [];
  dump(row, 0, maxDepth, out, opts);
  return out.join('\n');
}

function section(title) {
  console.log(`\n${'='.repeat(78)}\n${title}\n${'='.repeat(78)}`);
}

const firstLevelRows = findAll(tree, (n) => hasClass(n, 'link-comment__comment-item'));
const childRows = findAll(tree, (n) => hasClass(n, 'comment-children-item'));
const childrenBoxes = findAll(tree, (n) => hasClass(n, 'link-comment__comment-children'));

if (mode === 'tree' || mode === 'all') {
  section(`一级评论行骨架（共 ${firstLevelRows.length} 行；取第 1 行，深 8 层）`);
  console.log(lineItemSkeleton(firstLevelRows[0], 8));

  section('一级评论行骨架（含 @提及 / emoji / 图片 的那一行，深 8 层）');
  const rich = firstLevelRows.find((r) => byClass(r, 'hb-emoji').length) || firstLevelRows[0];
  console.log(lineItemSkeleton(rich, 8));

  section(`楼中楼行骨架（共 ${childRows.length} 行；逐行原样输出，深 4 层）`);
  childRows.forEach((r, i) => {
    console.log(`\n--- comment-children-item #${i + 1}  data-comment-id=${r.attrs['data-comment-id']} ---`);
    console.log(lineItemSkeleton(r, 4));
  });
}

if (mode === 'fields' || mode === 'all') {
  section('一级评论可抓取字段');
  const rows = [];
  for (const row of firstLevelRows) {
    const avatarBox = byClass(row, 'comment-item-header__avatar')[0];
    const avatarImg = avatarBox ? byTag(avatarBox, 'img').find((im) => hasClass(im, 'hb-avatar__image')) : null;
    const decoration = avatarBox ? byTag(avatarBox, 'img').find((im) => hasClass(im, 'hb-avatar__avatar-decoration')) : null;
    const headerLink = byClass(row, 'link-comment__comment-item-header')[0]?.children.find((n) => n.tag === 'a');
    const usernameLink = byClass(row, 'info-box__username')[0];
    const level = byClass(row, 'info-box__level')[0];
    const time = byClass(row, 'info-box__create-time')[0];
    const ip = byClass(row, 'info-box__ip')[0];
    const likeCnt = byClass(row, 'like-box__cnt')[0];
    const content = byClass(row, 'comment-item__content')[0];
    const emojis = byClass(row, 'hb-emoji');
    const imgs = content ? byTag(content, 'img') : [];
    const mentions = findAll(row, (n) => n.tag === 'a' && (
      (n.attrs.href || '').includes('/user/profile') || (n.attrs.href || '').includes('mention')
    ));
    rows.push({
      id: row.attrs['data-comment-id'],
      头像: avatarImg?.attrs.src,
      头像装饰: decoration?.attrs.src,
      头像包裹: avatarBox ? classes(avatarBox).join('.') : null,
      主页href: headerLink?.attrs.href,
      用户名: usernameLink ? ownText(usernameLink) : null,
      用户名href: usernameLink?.attrs.href,
      等级class: level ? classes(level).find((c) => c.startsWith('hb-level-')) : null,
      等级文本: level ? allText(level) : null,
      时间: time ? ownText(time) : null,
      IP: ip ? ownText(ip) : null,
      点赞数: likeCnt ? ownText(likeCnt) : null,
      正文: content ? allText(content) : null,
      正文emoji数: emojis.length,
      正文img数: imgs.length,
      正文直接子节点: content ? content.children.map((c) => c.tag === '#comment' ? '#comment' : `${c.tag}.${classes(c)[0] || ''}`).join('|') : null,
      '@提及_子树内profile链接数': mentions.length,
    });
  }
  console.table(rows);
  console.log('\n[debug] 每行正文 emoji 计数明细：');
  firstLevelRows.forEach((row, i) => {
    const c = byClass(row, 'comment-item__content')[0];
    console.log(`  row#${i + 1} id=${row.attrs['data-comment-id']}  content存在=${!!c}  子树emoji=${c ? byClass(c, 'hb-emoji').length : 'n/a'}  行级emoji=${byClass(row, 'hb-emoji').length}`);
  });

  section('楼中楼可抓取字段');
  const crows = childRows.map((row) => {
    const creator = byClass(row, 'children-item__comment-creator')[0];
    const replyTo = byClass(row, 'children-item__reply-to')[0];
    const content = byClass(row, 'children-item__comment-content')[0];
    const otherInfo = byClass(row, 'children-item__other-info')[0];
    return {
      行data_comment_id: row.attrs['data-comment-id'],
      creator_tag: creator?.tag,
      creator_class: creator ? classes(creator).join('.') : null,
      creator_href: creator?.attrs.href,
      creator_text: creator ? ownText(creator) : null,
      行内所有a标签: findAll(row, (n) => n.tag === 'a').map((a) => `${classes(a).join('.') || '(无class)'} → href=${a.attrs.href} → text=${JSON.stringify(ownText(a))}`).join(' ; '),
      replyTo_tag: replyTo?.tag,
      replyTo_class: replyTo ? classes(replyTo).join('.') : null,
      replyTo_text: replyTo ? JSON.stringify(ownText(replyTo)) : null,
      replyTo_childCount: replyTo?.children.length,
      content_tag: content?.tag,
      content_class: content ? classes(content).join('.') : null,
      content_以at开头: content ? ownText(content).startsWith('@') : null,
      正文: content ? allText(content) : null,
      正文直接子节点: content ? content.children.map((c) => c.tag === '#comment' ? '#comment' : `${c.tag}.${classes(c)[0] || ''}`).join('|') : null,
      正文emoji数: content ? byClass(content, 'hb-emoji').length : 0,
      正文img数: content ? byTag(content, 'img').length : 0,
      otherInfo_text: otherInfo ? allText(otherInfo) : null,
      otherInfo子: otherInfo ? otherInfo.children.map((c) => `${c.tag}.${classes(c).join('.')}`).join('|') : null,
    };
  });
  console.table(crows);

  section('「回复对象」取证：楼中楼行内全部文本与全部 a/span 的原文');
  childRows.forEach((row, i) => {
    const parts = [];
    (function walk(n) {
      if (n.tag === '#comment') return;
      const t = ownText(n);
      if (t) parts.push(`${n.tag}${classes(n).length ? '.' + classes(n)[0] : ''} = ${JSON.stringify(t)}`);
      n.children.forEach(walk);
    })(row);
    console.log(`#${i + 1} id=${row.attrs['data-comment-id']}  行 HTML 还原文本: ${JSON.stringify(allText(row))}`);
    console.log(`    逐节点文本: ${parts.join('  |  ')}`);
  });

  section('一级评论行内全部 <a>（检查是否存在 @提及 之外的用户链接 / topic 链接）');
  firstLevelRows.forEach((row, i) => {
    const as = findAll(row, (n) => n.tag === 'a');
    console.log(`#${i + 1} id=${row.attrs['data-comment-id']}`);
    as.forEach((a) => console.log(`    ${classes(a).join('.') || '(无class)'}  href=${a.attrs.href}  text=${JSON.stringify(ownText(a))}`));
  });
}

if (mode === 'children' || mode === 'all') {
  section(`.link-comment__comment-children 容器（共 ${childrenBoxes.length} 个）`);
  childrenBoxes.forEach((box, i) => {
    const row = box.parent;
    const btn = byClass(box, 'comment-children__load-all')[0];
    console.log(`\n--- 容器 #${i + 1}  属于一级评论 id=${row?.attrs?.['data-comment-id']} ---`);
    console.log(`  class            = ${JSON.stringify(box.attrs.class)}`);
    console.log(`  直接子节点顺序    = ${box.children.map((c) => c.tag === '#comment' ? '#comment<!--' + c.comment + '-->' : `${c.tag}.${classes(c).join('.')}`).join('  →  ')}`);
    console.log(`  子节点数          = ${box.children.length}`);
    if (btn) {
      console.log(`  load-all 按钮     = button.${classes(btn).join('.')}  文本=${JSON.stringify(allText(btn))}`);
      console.log(`    load-all 内部    = ${btn.children.map((c) => `${c.tag}.${classes(c).join('.')}`).join(' → ')}`);
    } else {
      console.log('  load-all 按钮     = 不存在');
    }
  });

  section('楼中楼行（comment-children-item）直接子节点顺序逐行对照');
  childRows.forEach((row, i) => {
    const seq = row.children.map((c) => {
      if (c.tag === '#comment') return '#comment(空占位)';
      const cl = classes(c)[0] || '(无class)';
      return `${c.tag}.${cl}`;
    });
    console.log(`#${i + 1} id=${row.attrs['data-comment-id']}: ${seq.join('  →  ')}`);
  });
}

if (mode === 'header' || mode === 'all') {
  section('评论区头部 / 排序 / 分页 / 加载更多');
  const list = findAll(tree, (n) => hasClass(n, 'link-comment__list'))[0];
  const commentRoot = list?.parent;
  if (commentRoot) {
    console.log('--- .link-comment 头部骨架（深 5 层）---');
    const out = [];
    dump(commentRoot, 0, 5, out);
    console.log(out.join('\n'));
  }

  section('slide-tab / pagination 相关节点原文');
  for (const sel of ['hb-cpt__pagination', 'slide-tab__tab-item', 'slide-tab__tab-label', 'slide-tab__tab-cnt', 'slide-tab-tab__bar', 'hb-cpt__pagination-inner', 'hb-cpt__pagination-outer', 'load-more', 'comment__load-more', 'scroll-list__to-login']) {
    const hits = byClass(tree, sel);
    console.log(`\n.class ${sel}  命中 ${hits.length}`);
    hits.forEach((h) => console.log(`   <${h.tag}> class=${JSON.stringify(h.attrs.class)} text=${JSON.stringify(allText(h).slice(0, 90))}`));
  }

  section('回复框 / 引用相关（.link-reply）');
  const replies = byClass(tree, 'link-reply');
  console.log(`.link-reply 命中 ${replies.length}`);
  replies.slice(0, 3).forEach((r) => {
    const out = [];
    dump(r, 0, 5, out);
    console.log(out.join('\n'));
    console.log('---');
  });
  for (const sel of ['link-comment__target--comment', 'link-reply__placeholder', 'ProseMirror', 'link-reply__operation-box']) {
    const hits = byClass(tree, sel);
    console.log(`.class ${sel} 命中 ${hits.length}  ${hits.map((h) => JSON.stringify(allText(h).slice(0, 60))).join(' | ')}`);
  }
}

if (mode === 'counts' || mode === 'all') {
  section('类名统计（全 fixture）');
  const classCount = new Map();
  const attrCount = new Map();
  (function count(n) {
    for (const c of classes(n)) classCount.set(c, (classCount.get(c) || 0) + 1);
    for (const k of Object.keys(n.attrs)) attrCount.set(k, (attrCount.get(k) || 0) + 1);
    n.children.forEach(count);
  })(tree);
  const tags = ['link-comment', 'link-comment__list', 'link-comment__comment-item', 'link-comment__comment-item-header',
    'comment-item-header__avatar', 'hb-cpt-avatar', 'hb-avatar__image', 'hb-avatar__avatar-decoration',
    'comment-item-header__info-box', 'info-box__line-1', 'info-box__username', 'info-box__level', 'hb-level-tag',
    'info-box__line-2', 'info-box__create-time', 'info-box__ip', 'comment-item-header__operation-box', 'like-box', 'like-box__cnt',
    'comment-item__content-container', 'comment-item__content', 'comment-item__image-box', 'comment-item__image-wrapper',
    'comment-item__tag-line', 'link-comment__comment-children', 'comment-children-item', 'children-item__comment-creator',
    'children-item__reply-to', 'children-item__comment-content', 'children-item__other-info', 'comment-children__load-all',
    'load-all__text', 'hb-emoji', 'hb-emoji-cube', 'link-comment__reply', 'link-reply', 'link-reply__main-box',
    'link-reply__input-wrapper', 'link-reply__editor', 'link-reply__placeholder', 'link-reply__operation-box',
    'link-reply__operation-item', 'link-reply__operation-desc', 'link-comment__target--comment', 'comment__comment-header',
    'hb-cpt__pagination', 'hb-cpt__slide-tab', 'hb-cpt__pagination-inner', 'hb-cpt__pagination-outer', 'slide-tab__tab-item',
    'slide-tab__tab-label', 'slide-tab__tab-cnt', 'slide-tab-tab__bar', 'scroll-list__to-login', 'scroll-list__to-login-btn'];
  console.log('类名 / 出现次数：');
  for (const t of tags) console.log(`  ${String(classCount.get(t) || 0).padStart(5)}  ${t}`);
  console.log('\n其它以 comment/children/reply 开头的类名：');
  for (const [k, v] of [...classCount].sort()) {
    if (/comment|children|reply|load|slide-tab|pagination|mention|emoji/i.test(k)) {
      console.log(`  ${String(v).padStart(5)}  ${k}`);
    }
  }
  console.log('\ndata-* 属性：');
  for (const [k, v] of [...attrCount].sort()) if (k.startsWith('data-') && !k.startsWith('data-v-')) console.log(`  ${String(v).padStart(5)}  ${k}`);
  console.log('\ndata-v-* scope：');
  for (const [k, v] of [...attrCount].sort()) if (k.startsWith('data-v-') && k !== 'data-v-app') console.log(`  ${String(v).padStart(5)}  ${k}`);

  section('data-comment-id 全量');
  const ids = findAll(tree, (n) => n.attrs && n.attrs['data-comment-id'] !== undefined)
    .map((n) => `${n.tag}.${classes(n).join('.')} = ${n.attrs['data-comment-id']}`);
  ids.forEach((x) => console.log('  ' + x));
  console.log(`合计 ${ids.length}`);
}

if (mode === 'debug') {
  section('debug：第 2 行的 comment-item__content 子树');
  const c = byClass(firstLevelRows[1], 'comment-item__content')[0];
  console.log('content node:', c && label(c));
  console.log('content.children:', c && c.children.map((k) => label(k)).join('\n  '));
  console.log('content.text:', JSON.stringify(c && c.text));
  console.log('byClass(row,hb-emoji):', byClass(firstLevelRows[1], 'hb-emoji').length);
  console.log('content 子树 hb-emoji:', byClass(c, 'hb-emoji').length);
}

if (mode === 'context') {
  section('评论区在页面里的位置：.link-comment 的祖先链');
  const list0 = findAll(tree, (n) => hasClass(n, 'link-comment__list'))[0];
  const commentRoot = findAll(tree, (n) => hasClass(n, 'link-comment'))[0];
  if (commentRoot) {
    const chain = [];
    let p = commentRoot;
    while (p) { chain.unshift(`${p.tag}${classes(p).length ? '.' + classes(p).join('.') : ''}`); p = p.parent; }
    console.log(chain.join('  >  '));
  }
  if (commentRoot?.parent) {
    console.log('\n.link-comment 的兄弟节点顺序：');
    commentRoot.parent.children.forEach((c, i) => {
      console.log(`  ${i}: ${c.tag}${classes(c).length ? '.' + classes(c).join('.') : ''}${c.attrs.id ? '#' + c.attrs.id : ''}`);
    });
    console.log('\n.link-comment 上一层骨架（深 3 层）：');
    const out = [];
    dump(commentRoot.parent, 0, 3, out);
    console.log(out.join('\n'));
  }
  section('page-bbs-link / 评论列表容器 id 线索');
  const idHits = findAll(tree, (n) => n.attrs.id && /bbs|link|comment/i.test(n.attrs.id));
  idHits.forEach((n) => console.log(`  <${n.tag}> id=${n.attrs.id} class=${JSON.stringify(n.attrs.class || '')}`));
  section('.link-comment 内部一层结构');
  if (commentRoot) {
    const out = [];
    dump(commentRoot, 0, 2, out);
    console.log(out.join('\n'));
  }
}

if (mode === 'sentinel') {
  section('.link-comment__list 直接子节点明细（末日哨兵 / 空占位）');
  const l = findAll(tree, (n) => hasClass(n, 'link-comment__list'))[0];
  l.children.forEach((c, i) => {
    console.log(`  ${i}: ${c.tag === '#comment' ? '#comment<!--' + c.comment + '-->' : label(c)}`);
  });
  section('评论区相关的全部带 id 的元素');
  findAll(tree, (n) => n.attrs.id && /comment|reply|scroll|bbs-link|loading/i.test(n.attrs.id))
    .forEach((n) => console.log(`  <${n.tag}> id=${n.attrs.id} class=${JSON.stringify(n.attrs.class || '')}`));
  section('hb-loading 在树里的位置');
  findAll(tree, (n) => hasClass(n, 'hb-loading')).forEach((n) => {
    const chain = [];
    let p = n;
    while (p) { chain.unshift(`${p.tag}${classes(p).length ? '.' + classes(p)[0] : ''}`); p = p.parent; }
    console.log('  ' + chain.join(' > '));
  });
}

console.log('\n[done]');
