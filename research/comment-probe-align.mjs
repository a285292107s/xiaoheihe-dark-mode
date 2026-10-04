import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const section = (t) => console.log(`\n${'='.repeat(78)}\n${t}\n${'='.repeat(78)}`);

const VOID = new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);
function parse(src) {
  const rootN = { tag: '#root', attrs: {}, children: [], parent: null, text: '' };
  const stack = [rootN];
  let i = 0;
  const pushText = (t) => { const x = t.replace(/\s+/g, ' '); if (x.trim()) stack[stack.length - 1].text += x; };
  while (i < src.length) {
    const lt = src.indexOf('<', i);
    if (lt < 0) { pushText(src.slice(i)); break; }
    pushText(src.slice(i, lt));
    if (src.startsWith('<!--', lt)) {
      const e = src.indexOf('-->', lt);
      const parent = stack[stack.length - 1];
      parent.children.push({ tag: '#comment', attrs: {}, children: [], parent, text: '', comment: src.slice(lt + 4, e < 0 ? src.length : e) });
      i = e < 0 ? src.length : e + 3; continue;
    }
    const gt = src.indexOf('>', lt);
    if (gt < 0) break;
    const raw = src.slice(lt + 1, gt);
    if (raw.startsWith('/')) { if (stack.length > 1) stack.pop(); i = gt + 1; continue; }
    const tag = raw.match(/^[a-zA-Z0-9-]+/)?.[0]?.toLowerCase();
    if (!tag) { i = gt + 1; continue; }
    const attrs = {};
    for (const m of raw.matchAll(/([\w:.-]+)\s*=\s*"([^"]*)"/g)) attrs[m[1].toLowerCase()] = m[2];
    const n = { tag, attrs, children: [], parent: stack[stack.length - 1], text: '' };
    n.parent.children.push(n);
    if (tag === 'script' || tag === 'style') { const c = src.toLowerCase().indexOf(`</${tag}`, gt); i = c < 0 ? src.length : src.indexOf('>', c) + 1; continue; }
    if (!raw.endsWith('/') && !VOID.has(tag)) stack.push(n);
    i = gt + 1;
  }
  return rootN;
}
const findAll = (n, p, out = []) => { for (const k of n.children) { if (p(k)) out.push(k); findAll(k, p, out); } return out; };
const cls = (n) => (n.attrs.class || '').split(/\s+/).filter(Boolean);
const has = (n, c) => cls(n).includes(c);
const byClass = (n, c) => findAll(n, (x) => has(x, c));
const allText = (n) => { let s = n.text; for (const k of n.children) if (k.tag !== '#comment') s += allText(k); return s.replace(/\s+/g, ' ').trim(); };
const browserText = (n) => allText(n).replace(/&nbsp;/gi, '\u00a0').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>');
const vis = (s) => String(s ?? '').replace(/\u00a0/g, '{NBSP}');

const domExp = parse(read('research/live-comment-expanded.html'));
const domDec = parse(read('research/live-comment.decoded.html'));
const rowById = new Map(
  findAll(domExp, (n) => has(n, 'comment-children-item')).map((r) => [r.attrs['data-comment-id'], r]),
);

const ids = (d) => ({
  l1: findAll(d, (n) => has(n, 'link-comment__comment-item')).map((n) => n.attrs['data-comment-id']),
  child: findAll(d, (n) => has(n, 'comment-children-item')).map((n) => n.attrs['data-comment-id']),
});

const json = JSON.parse(read('research/live-comment-tree.json'));
const apiMain = [], apiChild = [];
for (const p of (Array.isArray(json) ? json : [json])) {
  for (const g of (p?.result?.comments ?? [])) {
    (g.comment ?? []).forEach((c, i) => (i === 0 ? apiMain : apiChild).push(c));
  }
}
const apiMainIds = apiMain.map((c) => String(c.commentid));
const apiChildIds = apiChild.map((c) => String(c.commentid));

section('接口 vs 真机 DOM 的 ID 对齐');
for (const [label, d] of [['live-comment-expanded.html', domExp], ['live-comment.decoded.html', domDec]]) {
  const { l1, child } = ids(d);
  console.log(`\n### ${label}`);
  console.log(`  一级行 ${l1.length} / 楼中楼行 ${child.length}`);
  console.log(`  接口主楼（${apiMainIds.length}）中 DOM 缺的： ${apiMainIds.filter((x) => !l1.includes(x)).join(', ') || '(无)'}`);
  console.log(`  DOM 一级行（${l1.length}）中接口没有的： ${l1.filter((x) => !apiMainIds.includes(x)).join(', ') || '(无)'}`);
  console.log(`  接口楼中楼（${apiChildIds.length}）中 DOM 缺的： ${apiChildIds.filter((x) => !child.includes(x)).join(', ') || '(无)'}`);
  const extra = child.filter((x) => !apiChildIds.includes(x));
  console.log(`  DOM 楼中楼（${child.length}）中接口没有的： ${extra.length} 条${extra.length ? '（首 10：' + extra.slice(0, 10).join(', ') + '）' : ''}`);
}

section('接口里带图的评论 967402162 去哪了');
const imgRow = apiMain.find((c) => String(c.commentid) === '967402162');
console.log('  接口记录:', JSON.stringify({ commentid: imgRow.commentid, text: imgRow.text, imgs: imgRow.imgs?.length, user: imgRow.user?.username, floor_num: imgRow.floor_num, is_top: imgRow.is_top }));
for (const [label, d] of [['expanded', domExp], ['decoded', domDec]]) {
  const l1 = ids(d).l1;
  console.log(`  ${label} 的一级行共 ${l1.length} 条：${l1.join(', ')}`);
  console.log(`  ${label} 是否含 967402162：${l1.includes('967402162')}`);
}

section('接口有、DOM 无的字段（按评论聚合，用于卡片数据源设计）');
const domAllIds = new Set([...ids(domExp).l1, ...ids(domExp).child]);
const missing = [...apiMain, ...apiChild].filter((c) => !domAllIds.has(String(c.commentid)));
console.log(`  接口 31 条中不在展开态 DOM 里的： ${missing.length} 条`);
for (const c of missing) console.log(`    id=${c.commentid} 主楼=${apiMainIds.includes(String(c.commentid))} 用户=${c.user?.username} 正文=${JSON.stringify(String(c.text).slice(0, 40))} imgs=${c.imgs?.length ?? 0}`);

section('回复框两态核对（live-replybox.json / live-reply-open.json）');
const rb = JSON.parse(read('research/live-replybox.json'));
const ro = JSON.parse(read('research/live-reply-open.json'));
console.log('  live-replybox.json 键：', Object.keys(rb).join(', '));
console.log('  first（展开态）boxClassList:', JSON.stringify(rb.first.boxClassList), ' 高度:', rb.first.boxRect.height);
console.log('  second（收起态）boxClassList:', JSON.stringify(rb.second.boxClassList), ' 高度:', rb.second.boxRect.height);
console.log('  first.targetBox 存在:', !!rb.first.targetBox, ' second.targetBox:', rb.second.targetBox);
const t = (html) => (html.match(/<p class="link-comment__target--comment">([\s\S]*?)<\/p>/) || [])[1];
console.log('  first.target--comment 文本:', JSON.stringify(t(rb.first.reply.html)));
console.log('  first 里的菜单按钮:', [...rb.first.reply.html.matchAll(/<button class="(link-reply__menu-[a-z-]+[^"]*)"/g)].map((m) => m[1]).join(' | '));
console.log('  second 里的菜单按钮:', [...rb.second.reply.html.matchAll(/<button class="(link-reply__menu-[a-z-]+[^"]*)"/g)].map((m) => m[1]).join(' | ') || '(无)');
console.log('  collapsed 事件:', JSON.stringify(rb.collapsed));
console.log('\n  live-reply-open.json 四步：');
for (const s of ro) console.log(`    [${s.label}] wrap=${s.wrapClass} | targetText=${JSON.stringify(s.targetText)} | hasConfirm=${s.hasConfirm} | active=${s.activeEl}`);

section('交叉核对：点第一条楼中楼 → 引用文本 == 该行正文？（三方对齐）');
const firstChildId = ids(domExp).child[0];
const apiFirst = apiChild.find((c) => String(c.commentid) === firstChildId);
const row = findAll(domExp, (n) => has(n, 'comment-children-item') && n.attrs['data-comment-id'] === firstChildId)[0];
const creator = row ? allText(findAll(row, (n) => n.tag === 'a')[0]) : null;
const body = row ? allText(findAll(row, (n) => has(n, 'children-item__comment-content'))[0]) : null;
const clickedSnapshot = ro.find((s) => s.label === 'after-child-click');
console.log(`  probe-reply-open.mjs 点的第一条 .comment-children-item = DOM 里的 ${firstChildId}`);
console.log(`    该行作者（DOM）  = ${JSON.stringify(creator)}`);
console.log(`    该行正文（DOM）  = ${JSON.stringify(body)}`);
console.log(`    接口该条 username = ${JSON.stringify(apiFirst?.user?.username)}`);
console.log(`    接口该条 text     = ${JSON.stringify(apiFirst?.text)}`);
console.log(`    回复框引用文本     = ${JSON.stringify(clickedSnapshot?.targetText)}`);
console.log(`    引用文本 == 该行正文？ ${body === clickedSnapshot?.targetText}`);
console.log(`    行内正文（去 emoji）== 接口 text？ ${body?.replace(/\s+/g, '') === String(apiFirst?.text).replace(/\s+/g, '')}`);

section('点一级评论正文 → 引用文本 == 该楼正文？');
const mainId = ids(domExp).l1[0];
const apiMain0 = apiMain.find((c) => String(c.commentid) === mainId);
const mainRow = findAll(domExp, (n) => has(n, 'link-comment__comment-item') && n.attrs['data-comment-id'] === mainId)[0];
const mainBody = mainRow ? allText(findAll(mainRow, (n) => has(n, 'comment-item__content'))[0]) : null;
const mainSnap = ro.find((s) => s.label === 'after-main-click');
console.log(`  DOM 第一条一级行 = ${mainId}`);
console.log(`    行正文（DOM） = ${JSON.stringify(mainBody)}`);
console.log(`    接口 text     = ${JSON.stringify(apiMain0?.text)}`);
console.log(`    回复框引用文本 = ${JSON.stringify(mainSnap?.targetText)}`);
console.log(`    引用 == 行正文？ ${mainBody === mainSnap?.targetText}`);

section('引用区头像 == 被引用作者的头像？（target--avatar vs 接口 user.avatar）');
const tb = rb.first.targetBox?.html ?? '';
const av = (tb.match(/<img class="hb-avatar__image" src="([^"]+)"/) || [])[1];
console.log(`  target--avatar 的 img src = ${av}`);
console.log(`  接口第一条一级评论 user.avatar = ${apiMain0?.user?.avatar}`);
console.log(`  两者相同？ ${av === apiMain0?.user?.avatar}`);
const childAv = apiChild[0]?.user?.avatar;
const childSnap = ro.find((s) => s.label === 'after-child-click');
console.log(`  点楼中楼后的引用头像（live-reply-open.json）= ${childSnap?.targetAvatar}`);
console.log(`  接口第一条楼中楼 user.avatar          = ${childAv}`);
console.log(`  两者相同？ ${childSnap?.targetAvatar === childAv}`);

section('11 条 replyuser 的双向判定表（replyid/rootid 与 replyuserid/楼主 userid 两种等价判法）');
const rootIdByChild = new Map();
const rootUserMap = new Map();
for (const p of (Array.isArray(json) ? json : [json])) {
  for (const g of (p?.result?.comments ?? [])) {
    const list = g.comment ?? [];
    list.forEach((c, i) => {
      rootIdByChild.set(String(c.commentid), String(list[0]?.commentid));
      if (i === 0) rootUserMap.set(String(c.commentid), String(c.userid));
    });
  }
}
let hitA = 0, hitB = 0;
for (const c of apiChild) {
  const id = String(c.commentid);
  const rootId = rootIdByChild.get(id);
  const row = rowById.get(id);
  const span = row ? byClass(row, 'children-item__reply-to')[0] : null;
  const domT = span ? browserText(span) : null;
  const domSaysReply = domT ? domT.startsWith('回复') : null;
  const byReplyId = String(c.replyid) !== rootId;
  const byUserId = String(c.replyuserid) !== rootUserMap.get(rootId);
  if (byReplyId === domSaysReply) hitA++;
  if (byUserId === domSaysReply) hitB++;
  console.log(`  ${id}  replyid=${c.replyid} rootid=${rootId} (${byReplyId ? '≠' : '='})  replyuserid=${c.replyuserid} 楼主userid=${rootUserMap.get(rootId)} (${byUserId ? '≠' : '='})  DOM=${JSON.stringify(vis(domT))}`);
}
console.log(`\n  「replyid !== rootid」与「DOM 显示回复」一致： ${hitA} / ${apiChild.length}`);
console.log(`  「replyuserid !== 楼主 userid」与「DOM 显示回复」一致： ${hitB} / ${apiChild.length}`);

section('空占位注释的数量（Vue v-if 分支）');
for (const [label, d] of [['expanded', domExp], ['decoded', domDec]]) {
  const rows = findAll(d, (n) => has(n, 'comment-children-item'));
  const counts = new Map();
  for (const r of rows) {
    const n = r.children.filter((c) => c.tag === '#comment').length;
    counts.set(n, (counts.get(n) || 0) + 1);
  }
  console.log(`  ${label}: 楼中楼行 ${rows.length} 条；每行空注释数分布 ${JSON.stringify([...counts])}`);
}

console.log('\n[done]');
