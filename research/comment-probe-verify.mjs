import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const doc = fs.readFileSync(path.join(root, 'research/comment-dom.md'), 'utf8');
const fixtures = {
  'fixtures/detail.html': fs.readFileSync(path.join(root, 'fixtures/detail.html'), 'utf8'),
  'fixtures/detail-full.html': fs.readFileSync(path.join(root, 'fixtures/detail-full.html'), 'utf8'),
};
const sources = {
  'js/index-CVVwhh7y.js': fs.readFileSync(path.join(root, 'research/js/index-CVVwhh7y.js'), 'utf8'),
  'css-detail/index-ChemEL1Y.css': fs.readFileSync(path.join(root, 'research/css-detail/index-ChemEL1Y.css'), 'utf8'),
  'css/index-Cv4ia_mR.css': fs.readFileSync(path.join(root, 'research/css/index-Cv4ia_mR.css'), 'utf8'),
  'css-detail/index-D2QWFmGt.css': fs.readFileSync(path.join(root, 'research/css-detail/index-D2QWFmGt.css'), 'utf8'),
};
const live = {
  'live-expanded.html': fs.readFileSync(path.join(root, 'research/live-comment-expanded.html'), 'utf8'),
  'live-decoded.html': fs.readFileSync(path.join(root, 'research/live-comment.decoded.html'), 'utf8'),
  'live-tree.json': fs.readFileSync(path.join(root, 'research/live-comment-tree.json'), 'utf8'),
  'live-replybox.json': fs.readFileSync(path.join(root, 'research/live-replybox.json'), 'utf8'),
  'live-reply-open.json': fs.readFileSync(path.join(root, 'research/live-reply-open.json'), 'utf8'),
};

const docClasses = new Set();
for (const m of doc.matchAll(/\.([a-z][a-z0-9]*(?:-[a-z0-9]+)*(?:__[a-z0-9-]+)*(?:--[a-z0-9-]+)*(?:_[a-z0-9]+)?)/g)) {
  const c = m[1];
  if (/^(md|min|js|ts|css|html|json|mjs|png|gif|jpg|webp|exe|list|value|index|research|fixtures|node|href|style|class|com|org|net|app)\b/.test(c)) continue;
  if (c.length < 3) continue;
  docClasses.add(c);
}
const candidates = [...docClasses].filter((c) => /__|-|^hb/.test(c)).sort();
const docAttrs = [...new Set([...doc.matchAll(/data-[a-z0-9_-]+/g)].map((m) => m[0]))].sort();
const iconIds = [...new Set([...doc.matchAll(/#(icon-[a-z0-9_-]+)/g)].map((m) => m[1]))].sort();

const search = (needle, dict, prefix) => Object.entries(dict).filter(([, t]) => t.includes(needle)).map(([f]) => prefix + f);

const notFound = [], found = [];
for (const c of candidates) {
  const where = [
    ...search(c, fixtures, ''),
    ...search(c, sources, ''),
    ...search(c, live, '真机:'),
  ];
  (where.length ? found : notFound).push([c, where.join(', ')]);
}
const hasLive = (c) => search(c, live, '').length > 0;
const liveOnly = found.filter(([c]) => !search(c, fixtures, '').length && !search(c, sources, '').length);

console.log(`\n=== 类名断言复核（共 ${candidates.length} 个）===`);
console.log(`  [有据] ${found.length} 个`);
console.log(`    其中「只有真机素材能证」的：${liveOnly.length} 个 → ${liveOnly.map(([c]) => c).join(', ') || '(无)'}`);
console.log(`  [无据] ${notFound.length} 个`);
for (const [c] of notFound) console.log(`    ✗ ${c}`);
console.log('\n  （逐条明细见文件尾部；下面只列真机独有 + 无据）');

console.log(`\n=== data-* 属性复核（共 ${docAttrs.length} 个）===`);
for (const a of docAttrs) {
  const where = [...search(a, fixtures, ''), ...search(a, sources, ''), ...search(a, live, '真机:')];
  console.log(`  ${where.length ? '✓' : '✗'} ${a.padEnd(34)} ${where.join(', ') || '（仅文档/仅推理）'}`);
}

if (iconIds.length) {
  console.log(`\n=== 图标 id 复核（共 ${iconIds.length} 个）===`);
  for (const id of iconIds) {
    const where = [...search(id, fixtures, ''), ...search(id, sources, ''), ...search(id, live, '真机:')];
    console.log(`  ${where.length ? '✓' : '✗'} ${id.padEnd(44)} ${where.join(', ') || '（仅文档/仅推理）'}`);
  }
}

console.log('\n=== 关键计数复核（fixture） ===');
const counts = [
  ['fixtures/detail.html', 'link-comment__comment-item', 'class="link-comment__comment-item"'],
  ['fixtures/detail.html', 'comment-children-item', 'class="comment-children-item"'],
  ['fixtures/detail.html', 'link-comment__comment-children', 'class="link-comment__comment-children'],
  ['fixtures/detail.html', 'slide-tab__tab-item', 'slide-tab__tab-item'],
  ['fixtures/detail.html', 'scroll-list__no-more-desc', 'scroll-list__no-more-desc'],
  ['fixtures/detail.html', 'comment-item__image-box', 'comment-item__image-box'],
  ['fixtures/detail.html', 'comment-item__tag-line', 'comment-item__tag-line'],
  ['fixtures/detail-full.html', 'children-item__writer-tag', 'children-item__writer-tag'],
  ['fixtures/detail-full.html', '回复&nbsp;', '回复&nbsp;'],
  ['fixtures/detail-full.html', 'children 裸类', 'class="link-comment__comment-children"'],
  ['fixtures/detail.html', 'children can-load', 'class="link-comment__comment-children can-load"'],
];
for (const [f, label, needle] of counts) console.log(`  ${String(fixtures[f].split(needle).length - 1).padStart(4)}  ${label.padEnd(34)} @ ${f}`);
for (const f of Object.keys(fixtures)) {
  const m = fixtures[f].match(/slide-tab__tab-cnt[^>]*>(\d+)</);
  console.log(`  tab 评论总数 @ ${f} = ${m ? m[1] : '?'}`);
}

console.log('\n=== 关键计数复核（真机 F/H/G，§13 的立论数字） ===');
const exp = live['live-expanded.html'], dec = live['live-decoded.html'];
const countIn = (t, s) => t.split(s).length - 1;
console.log(`  F 一级行        ${countIn(exp, 'class="link-comment__comment-item"')}   （文档 §13.1 写 19）`);
console.log(`  F 楼中楼行      ${countIn(exp, 'class="comment-children-item"')}   （文档 §13.1 写 42）`);
console.log(`  F reply-to span ${countIn(exp, 'children-item__reply-to')}   （文档 §13.1/13.8 写 42）`);
console.log(`  F "回复&nbsp;"  ${countIn(exp, '回复&nbsp;')}   （文档 §13.8 写 16）`);
console.log(`  F ":" 形态      ${countIn(exp, 'children-item__reply-to">:</span>')}   （文档 §13.8 写 26）`);
console.log(`  F can-load      ${countIn(exp, 'can-load')}   （文档 §13.6 写 0）`);
console.log(`  F load-all      ${countIn(exp, 'comment-children__load-all')}   （文档 §13.6 写 0）`);
console.log(`  F 查看更多回复   ${countIn(exp, '查看更多回复')}   （文档 §13.6 写 0）`);
console.log(`  F hb-loading    ${countIn(exp, 'hb-loading')}   （文档 §13.7 写 0）`);
console.log(`  F comment-item__image*  ${countIn(exp, 'comment-item__image')}   （文档 §13.3 写 0）`);
console.log(`  F tag-line      ${countIn(exp, 'comment-item__tag-line')}   （文档 §13.4 写 0）`);
console.log(`  F info-box__writer-tag  ${countIn(exp, 'info-box__writer-tag')}   （文档 §13.5 写 0）`);
console.log(`  H 一级行        ${countIn(dec, 'class="link-comment__comment-item"')}   （文档 §13.1 写 3）`);
console.log(`  H 楼中楼行      ${countIn(dec, 'class="comment-children-item"')}   （文档 §13.1 写 5）`);
console.log(`  H can-load      ${countIn(dec, 'can-load')}   （文档 §13.6 写 2）`);
console.log(`  H 全部&nbsp;6&nbsp;条回复  ${countIn(dec, '全部&nbsp;6&nbsp;条回复')}   （文档 §13.6 写 1）`);
const tree = JSON.parse(live['live-tree.json']);
const apiRows = [];
for (const p of (Array.isArray(tree) ? tree : [tree])) for (const g of (p?.result?.comments ?? [])) (g.comment ?? []).forEach((c, i) => apiRows.push({ ...c, __isMain: i === 0 }));
console.log(`  G 评论组 ${(Array.isArray(tree) ? tree : [tree]).flatMap((p) => p?.result?.comments ?? []).length} 个；共 ${apiRows.length} 条（主楼 ${apiRows.filter((r) => r.__isMain).length} + 楼中楼 ${apiRows.filter((r) => !r.__isMain).length}）   （文档 §13.1 写 20 + 11）`);
const flagDist = (k) => { const m = new Map(); for (const r of apiRows) m.set(r[k], (m.get(r[k]) || 0) + 1); return [...m].map(([a, b]) => `${a}×${b}`).join(' '); };
console.log(`  G is_author_award 分布 ${flagDist('is_author_award')}   （文档 §13.4 写全 0）`);
console.log(`  G is_link_owner 分布   ${flagDist('is_link_owner')}   （文档 §13.5 写全 0）`);
console.log(`  G 带 imgs 的条数       ${apiRows.filter((r) => r.imgs !== undefined).length}   （文档 §13.3/14.1 写 1）`);
console.log(`  G 带 replyuser 的条数  ${apiRows.filter((r) => r.replyuser).length}   （文档 §13.8 写 11）`);
const rootOf = new Map();
for (const p of (Array.isArray(tree) ? tree : [tree])) for (const g of (p?.result?.comments ?? [])) { const list = g.comment ?? []; list.forEach((c, i) => rootOf.set(String(c.commentid), i === 0 ? String(c.commentid) : String(list[0]?.commentid))); }
const replyNeqRoot = apiRows.filter((r) => !r.__isMain && r.replyuser && String(r.replyid) !== rootOf.get(String(r.commentid)));
console.log(`  G 里 replyid !== rootid 的条数 ${replyNeqRoot.length}（文档 §13.8 表里写 1）→ ${replyNeqRoot.map((r) => r.commentid).join(',')}`);
console.log(`  G result.sort_filter 项数 ${((Array.isArray(tree) ? tree[0] : tree).result.sort_filter || []).length}   （文档 §14.1 写 3）`);
console.log(`  G result.total_floor_num ${(Array.isArray(tree) ? tree[0] : tree).result.total_floor_num}   （文档 §14.1 写 31）`);
const rb = JSON.parse(live['live-replybox.json']);
console.log(`  I first.boxClassList ${JSON.stringify(rb.first.boxClassList)} 高度 ${rb.first.boxRect.height}   （文档 §14.2 写 expand / 127）`);
console.log(`  I second.boxClassList ${JSON.stringify(rb.second.boxClassList)} 高度 ${rb.second.boxRect.height}   （文档 §14.2 写 collapse / 60）`);
const ro = JSON.parse(live['live-reply-open.json']);
const childSnap = ro.find((s) => s.label === 'after-child-click');
console.log(`  J after-child-click targetText = ${JSON.stringify(childSnap?.targetText)}   （文档 §14.2 引用）`);
console.log(`  J after-child-click wrapClass  = ${JSON.stringify(childSnap?.wrapClass)}`);

console.log('\n=== 对照：文档里列为「仍然无实例」的类名，在真机素材里的命中数 ===');
for (const c of ['comment-item__image-box', 'comment-item__image-wrapper', 'comment-item__image', 'comment-item__tag-line', 'comment-item__writer-like', 'info-box__writer-tag', 'comment-schoolmate-tag', 'can-load', 'comment-children__load-all', 'scroll-list__no-more-desc']) {
  const e = countIn(exp, c), d = countIn(dec, c), f1 = countIn(fixtures['fixtures/detail.html'], c), f2 = countIn(fixtures['fixtures/detail-full.html'], c);
  console.log(`  ${c.padEnd(30)} F=${e} H=${d} A=${f1} B=${f2}`);
}

console.log('\n[done]');
