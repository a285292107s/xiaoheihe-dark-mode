import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const mode = process.argv[2] || 'all';
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const NBSP = '\u00a0';
const vis = (s) => String(s ?? '').replace(/\u00a0/g, '{NBSP}');
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
      const end = src.indexOf('-->', lt);
      const parent = stack[stack.length - 1];
      parent.children.push({ tag: '#comment', attrs: {}, children: [], parent, text: '', comment: src.slice(lt + 4, end) });
      i = end < 0 ? src.length : end + 3;
      continue;
    }
    const gt = src.indexOf('>', lt);
    if (gt < 0) break;
    const raw = src.slice(lt + 1, gt);
    if (raw.startsWith('/')) { if (stack.length > 1) stack.pop(); i = gt + 1; continue; }
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
  return rootN;
}
const classes = (n) => (n.attrs.class || '').split(/\s+/).filter(Boolean);
const hasClass = (n, c) => classes(n).includes(c);
function findAll(n, pred, out = []) { for (const k of n.children) { if (pred(k)) out.push(k); findAll(k, pred, out); } return out; }
const byClass = (n, c) => findAll(n, (x) => hasClass(x, c));
const allText = (n) => { let s = n.text; for (const k of n.children) { if (k.tag !== '#comment') s += allText(k); } return s.replace(/\s+/g, ' '); };
function browserText(n) {
  return allText(n).replace(/&nbsp;/gi, NBSP).replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>');
}

const domPath = 'research/live-comment-expanded.html';
const dom = parse(read(domPath));
const domRows = findAll(dom, (n) => hasClass(n, 'comment-children-item'));
const domL1 = findAll(dom, (n) => hasClass(n, 'link-comment__comment-item'));
const rowById = new Map(domRows.map((r) => [r.attrs['data-comment-id'], r]));

const json = JSON.parse(read('research/live-comment-tree.json'));
const payloads = Array.isArray(json) ? json : [json];
const groups = payloads.flatMap((p) => p?.result?.comments ?? []);
const apiRows = [];
for (const g of groups) {
  const list = g.comment ?? [];
  list.forEach((c, idx) => apiRows.push({ ...c, __root: list[0], __isMain: idx === 0, __rootId: list[0]?.commentid }));
}
const apiChildren = apiRows.filter((r) => !r.__isMain);
const apiMain = apiRows.filter((r) => r.__isMain);
const apiById = new Map(apiRows.map((r) => [String(r.commentid), r]));
console.log(`[接口] 顶层 ${Array.isArray(json) ? '数组' : '对象'}；评论组 ${groups.length} 个；共 ${apiRows.length} 条（主楼 ${apiMain.length} + 楼中楼 ${apiChildren.length}）`);

if (mode === 'replyto' || mode === 'all') {
  section('核心核对：接口的 replyuser  vs  DOM 的 children-item__reply-to');
  console.log(`DOM 楼中楼行 ${domRows.length} 条 / 接口楼中楼 ${apiChildren.length} 条 / 接口主楼 ${apiMain.length} 条\n`);

  const apiWithReplyUser = apiChildren.filter((c) => c.replyuser != null);
  const apiWithout = apiChildren.filter((c) => c.replyuser == null);
  console.log(`接口带 replyuser 的楼中楼： ${apiWithReplyUser.length} 条`);
  console.log(`接口不带 replyuser 的：   ${apiWithout.length} 条\n`);

  const report = [];
  for (const c of apiChildren) {
    const id = String(c.commentid);
    const row = rowById.get(id);
    const span = row ? byClass(row, 'children-item__reply-to')[0] : null;
    const domText = span ? browserText(span) : null;
    report.push({
      id,
      api_replyuser: c.replyuser ? c.replyuser.username : null,
      api_replyid: c.replyid,
      api_rootId: c.__rootId,
      dom有一个span: !!span,
      dom_replyto文本: domText,
      dom含回复二字: domText ? domText.startsWith('回复') : null,
      DOM行存在: !!row,
    });
  }

  const withUser = report.filter((r) => r.api_replyuser);
  console.log('--- 接口有 replyuser 的，逐条看 DOM ---');
  for (const r of withUser) console.log(`  id=${r.id}  api_replyuser=${r.api_replyuser}  replyid=${r.api_replyid}  rootId=${r.api_rootId}  → DOM=${JSON.stringify(vis(r.dom_replyto文本))}  行存在=${r.DOM行存在}`);

  const noUser = report.filter((r) => !r.api_replyuser);
  console.log(`\n--- 接口无 replyuser 的 ${noUser.length} 条：DOM 文本分布 ---`);
  const dist = new Map();
  for (const r of noUser) dist.set(vis(r.dom_replyto文本), (dist.get(vis(r.dom_replyto文本)) || 0) + 1);
  for (const [k, v] of dist) console.log(`  ${v} 条 → ${JSON.stringify(k)}`);

  const withUserDist = new Map();
  for (const r of withUser) withUserDist.set(vis(r.dom_replyto文本), (withUserDist.get(vis(r.dom_replyto文本)) || 0) + 1);
  console.log(`\n--- 接口有 replyuser 的 ${withUser.length} 条：DOM 文本分布 ---`);
  for (const [k, v] of withUserDist) console.log(`  ${v} 条 → ${JSON.stringify(k)}`);

  console.log('\n--- 判定 ---');
  console.log('  ⚠️ 下面的分母说明：接口 11 条只覆盖 DOM 42 行中的 11 行，');
  console.log('     所以「匹配率」要分两种口径看 —— 别看混。');

  const matched = withUser.filter((r) => r.dom_replyto文本 && r.dom_replyto文本.startsWith('回复')).length;
  console.log(`\n  [口径 A·接口对得上的行] 接口有 replyuser 且 DOM 以「回复」开头： ${matched} / ${withUser.length}`);
  console.log('      → 这里几乎全是 ":" 的原因见 §13.8：那 10 条的 replyid === 本楼楼主的 commentid（真·回复楼主）');

  const allDomTexts = domRows.map((r) => browserText(byClass(r, 'children-item__reply-to')[0] || { text: '', children: [] }));
  const colonRows = allDomTexts.filter((t) => t === ':').length;
  const replyRows = allDomTexts.filter((t) => t.startsWith('回复')).length;
  console.log(`\n  [口径 B·全部 DOM 行（权威）] ${domPath} 共 ${domRows.length} 行：`);
  console.log(`     文本恰为 ":" 的有：        ${colonRows}`);
  console.log(`     文本以「回复」开头的有：   ${replyRows}`);
  const spanWithAnchor = domRows.filter((r) => {
    const s = byClass(r, 'children-item__reply-to')[0];
    return s && findAll(s, (x) => x.tag === 'a').length;
  }).length;
  console.log(`     reply-to span 内含 <a> 的行： ${spanWithAnchor}（应为 0 → 回复对象拿不到 userid）`);
  console.log(`\n  [对齐覆盖率] 接口楼中楼 ${apiChildren.length} 条；DOM 楼中楼 ${domRows.length} 行；`);
  console.log(`     接口里 DOM 也有的：${report.filter((r) => r.DOM行存在).length} 条（其余 ${domRows.length - report.filter((r) => r.DOM行存在).length} 行来自后续分页请求）`);

  const domTexts = domRows.map((r) => browserText(byClass(r, 'children-item__reply-to')[0] || { text: '', children: [] }));
  const domDist = new Map();
  for (const t of domTexts) domDist.set(vis(t), (domDist.get(vis(t)) || 0) + 1);
  console.log(`\n--- 只数 DOM（${domPath}）的 42 行 reply-to 文本 ---`);
  for (const [k, v] of [...domDist].sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(3)} 条 → ${JSON.stringify(k)}`);

  section('DOM 里 16 条「回复 X:」的原文（前 5 条，含节点结构）');
  let n = 0;
  for (const r of domRows) {
    const span = byClass(r, 'children-item__reply-to')[0];
    if (!span || !browserText(span).startsWith('回复')) continue;
    n++; if (n > 5) break;
    console.log(`  #${n} row id=${r.attrs['data-comment-id']}  span 子节点数=${span.children.length}  文本=${JSON.stringify(vis(browserText(span)))}`);
    console.log(`      span 内是否有 <a>：${findAll(span, (x) => x.tag === 'a').length > 0}`);
  }
}

if (mode === 'replyto' || mode === 'all') {
  section('DOM 自洽核对：16 条「回复 X:」里的 X 是不是同一楼里另一条楼中楼的作者？');
  const groupsDom = [];
  for (const l1 of domL1) {
    const box = byClass(l1, 'link-comment__comment-children')[0];
    if (!box) continue;
    groupsDom.push({ l1Id: l1.attrs['data-comment-id'], owner: allText(byClass(l1, 'info-box__username')[0] || { text: '', children: [] }), rows: byClass(box, 'comment-children-item') });
  }
  let ok = 0, bad = 0;
  for (const g of groupsDom) {
    const names = g.rows.map((r) => allText(byClass(r, 'children-item__comment-creator')[0] || { text: '', children: [] }));
    for (const r of g.rows) {
      const span = byClass(r, 'children-item__reply-to')[0];
      const t = span ? browserText(span) : '';
      if (!t.startsWith('回复')) continue;
      const target = t.replace(/^回复/, '').replace(/[:：]$/, '').replace(/\u00a0/g, ' ').trim();
      const inGroup = names.includes(target);
      const isOwner = target === g.owner;
      if (inGroup) ok++; else bad++;
      console.log(`  楼 ${g.l1Id}（楼主 ${g.owner}）行 ${r.attrs['data-comment-id']} → 回复对象 ${JSON.stringify(target)} | 同楼内存在该昵称=${inGroup} | 等于楼主=${isOwner}`);
    }
  }
  console.log(`\n  指向「同楼内另一位楼中楼作者」：${ok} 条；指向本楼楼主：${bad} 条`);
}

if (mode === 'fields' || mode === 'json' || mode === 'all') {
  section('接口字段清单（/bbs/app/link/tree）');
  const all = apiRows;
  const keys = new Map();
  for (const r of all) for (const k of Object.keys(r)) if (!k.startsWith('__')) keys.set(k, (keys.get(k) || 0) + 1);
  const present = new Set(domRowTextsAll());
  console.log(`样本：${all.length} 条（主楼 ${apiMain.length} + 楼中楼 ${apiChildren.length}）\n`);
  console.log('顶层字段（出现次数 / 是否非空）:');
  for (const [k, v] of [...keys].sort((a, b) => b[1] - a[1])) {
    const nonEmpty = all.filter((r) => r[k] !== undefined && r[k] !== null && r[k] !== '' && !(Array.isArray(r[k]) && !r[k].length)).length;
    console.log(`  ${String(v).padStart(3)}/${all.length}  ${k.padEnd(22)} 非空 ${String(nonEmpty).padStart(3)}`);
  }
  console.log('\nuser 子字段:');
  const ukeys = new Map();
  for (const r of all) for (const k of Object.keys(r.user ?? {})) ukeys.set(k, (ukeys.get(k) || 0) + 1);
  for (const [k, v] of [...ukeys].sort((a, b) => b[1] - a[1])) {
    const nonEmpty = all.filter((r) => r.user?.[k]).length;
    console.log(`  ${String(v).padStart(3)}/${all.length}  user.${k.padEnd(20)} 非空 ${String(nonEmpty).padStart(3)}`);
  }
  console.log('\nreplyuser 子字段:');
  const rkeys = new Map();
  for (const r of all) for (const k of Object.keys(r.replyuser ?? {})) rkeys.set(k, (rkeys.get(k) || 0) + 1);
  for (const [k, v] of [...rkeys].sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(3)}/${all.length}  replyuser.${k}`);

  console.log('\n样例（第一条主楼 + 其第一条楼中楼，全字段展开，长文本截断）:');
  const sample = apiMain[0];
  const sampleChild = apiChildren.find((c) => String(c.__rootId) === String(sample?.commentid));
  const shrink = (o) => JSON.stringify(o, (k, v) => (typeof v === 'string' && v.length > 120 ? v.slice(0, 120) + '…' : v), 1);
  if (sample) console.log('\n[主楼]\n' + shrink(sample));
  if (sampleChild) console.log('\n[其楼中楼]\n' + shrink(sampleChild));

  section('接口有、DOM 里没有的字段（对卡片化最关键）');
  const domHas = {
    avatar: 'hb-avatar__image / children-item 行内无 img',
    replyuser: 'children-item__reply-to 文本（仅用户名，无 userid）',
    up: 'like-box__cnt（仅主楼；楼中楼行内无）',
    create_at: 'info-box__create-time（已格式化为「4小时前」）',
  };
  console.log('  接口字段 → DOM 对应物：');
  for (const [k, v] of Object.entries(domHas)) console.log(`    ${k.padEnd(12)} → ${v}`);
  for (const k of ['userid', 'ip_location', 'replyid', 'replyuserid', 'child_num', 'has_more', 'floor_num', 'is_top', 'imgs']) {
    const some = all.find((r) => r[k] !== undefined);
    console.log(`    ${k.padEnd(12)} → DOM 无独立节点${some !== undefined ? '' : '（接口自身也没这个键）'}`);
  }
  console.log('\n  楼中楼行内 <img> 计数:');
  const imgCounts = new Map();
  for (const r of domRows) imgCounts.set(findAll(r, (x) => x.tag === 'img').length, (imgCounts.get(findAll(r, (x) => x.tag === 'img').length) || 0) + 1);
  for (const [k, v] of imgCounts) console.log(`    ${v} 行有 ${k} 个 img`);

  function domRowTextsAll() { return []; }
}

if (mode === 'mentions' || mode === 'all') {
  section('@提及：DOM 里 @ 出现的全部位置');
  const domSrc = read(domPath);
  let i = 0;
  for (const m of domSrc.matchAll(/.{0,220}@.{0,220}/g)) {
    i++;
    console.log(`--- 命中 ${i} ---\n${m[0]}\n`);
  }
  console.log(`合计 ${i} 处`);
  section('正文里的 <a>（一级 + 楼中楼，排除作者链接）');
  for (const [label, rows] of [['一级', domL1], ['楼中楼', domRows]]) {
    console.log(`\n[${label}]`);
    for (const r of rows) {
      const content = byClass(r, 'comment-item__content')[0] || byClass(r, 'children-item__comment-content')[0];
      if (!content) continue;
      const as = findAll(content, (x) => x.tag === 'a');
      if (!as.length) continue;
      console.log(`  id=${r.attrs['data-comment-id']} 正文内 <a> ${as.length} 个：`);
      for (const a of as) console.log(`      class=${JSON.stringify(a.attrs.class || '')} href=${a.attrs.href} text=${JSON.stringify(allText(a))}`);
    }
  }
  console.log('\n判定：上面若为空，则该快照里没有 @提及 实例。');
}

if (mode === 'images' || mode === 'all') {
  section('图片评论：comment-item__image-box 内层结构');
  const domSrc = read(domPath);
  const hits = [...domSrc.matchAll(/comment-item__image/g)];
  console.log(`${domPath} 里 comment-item__image 命中 ${hits.length}`);
  const boxes = findAll(dom, (n) => hasClass(n, 'comment-item__image-box'));
  console.log(`解析出的 .comment-item__image-box 节点数：${boxes.length}`);
  boxes.slice(0, 3).forEach((b, i) => {
    console.log(`\n--- box #${i + 1}（${b.children.length} 个子节点）---`);
    console.log(JSON.stringify(b, (k, v) => (k === 'parent' ? undefined : v), 1).slice(0, 1200));
  });
  const wrappers = findAll(dom, (n) => hasClass(n, 'comment-item__image-wrapper'));
  console.log(`\n.comment-item__image-wrapper 节点数：${wrappers.length}`);
  wrappers.slice(0, 2).forEach((w) => console.log('  ' + JSON.stringify({ tag: w.tag, attrs: w.attrs, kids: w.children.map((c) => ({ tag: c.tag, attrs: c.attrs })) })));
  const meta = JSON.parse(read('research/live-comment-tree.json'));
  const imgs = [];
  const allApi = [];
  for (const p of (Array.isArray(meta) ? meta : [meta])) for (const g of p?.result?.comments ?? []) (g.comment ?? []).forEach((c, i) => { if (c.imgs !== undefined) imgs.push({ id: c.commentid, __isMain: i === 0, imgs: c.imgs }); allApi.push({ ...c, __isMain: i === 0 }); });
  console.log(`\n接口里含 imgs 键的评论：${imgs.length} 条`);
  imgs.forEach((x) => console.log('  ' + JSON.stringify(x)));
  const domIds = new Set(findAll(dom, (n) => n.attrs['data-comment-id']).map((n) => n.attrs['data-comment-id']));
  console.log(`\nDOM 里 data-comment-id 共 ${domIds.size} 个（含一级与楼中楼）`);
  console.log('接口 31 条里，DOM 里存在的：');
  const hit = allApi.filter((c) => domIds.has(String(c.commentid)));
  console.log(`  ${hit.length} / ${allApi.length}`);
  for (const x of imgs) console.log(`  带图评论 ${x.id} 在 DOM 里？${domIds.has(String(x.id))}`);
  for (const x of imgs) {
    const row = findAll(dom, (n) => hasClass(n, 'link-comment__comment-item') && n.attrs['data-comment-id'] === String(x.id))[0];
    if (!row) { console.log(`  → 该行不在 DOM 里，无法核对图片节点结构`); continue; }
    const cc = byClass(row, 'comment-item__content-container')[0];
    console.log(`  → 该行 content-container 子节点: ${cc.children.map((c) => c.tag === '#comment' ? '#comment<!--' + c.comment + '-->' : `${c.tag}.${classes(c).join('.')}`).join(' | ')}`);
  }
  section('DOM 里所有 <img>（排除头像/图标）');
  const allImg = findAll(dom, (n) => n.tag === 'img');
  const dist = new Map();
  for (const im of allImg) {
    const key = (classes(im).join('.') || '(无class)') + ' | src=' + String(im.attrs.src || '').slice(0, 70);
    dist.set(key, (dist.get(key) || 0) + 1);
  }
  for (const [k, v] of dist) console.log(`  ${String(v).padStart(3)}  ${k}`);
}

if (mode === 'tags' || mode === 'all') {
  section('作者赞过（comment-item__tag-line）/ 作者徽章（writer-tag / schoolmate-tag）');
  for (const c of ['comment-item__tag-line', 'comment-item__writer-like', 'info-box__writer-tag', 'children-item__writer-tag', 'comment-schoolmate-tag', 'hb-level-tag']) {
    const inDom = findAll(dom, (n) => hasClass(n, c)).length;
    console.log(`  ${c.padEnd(30)} DOM 节点 ${inDom}`);
  }
  section('DOM 里所有含「作者」二字的片段');
  const src = read(domPath);
  let i = 0;
  for (const m of src.matchAll(/.{0,160}作者.{0,160}/g)) { i++; if (i <= 8) console.log(`--- ${i} ---\n${m[0]}\n`); }
  console.log(`合计 ${i} 处`);
  section('DOM 里所有 is_link_owner / is_author_award 相关类名的出现');
  for (const c of ['writer-tag', 'writer-like', 'tag-line']) console.log(`  ${c}: ${[...src.matchAll(new RegExp(c, 'g'))].length}`);
}

if (mode === 'loading' || mode === 'all') {
  section('can_load（查看更多回复）与展开期 loading');
  const domSrc = read(domPath);
  for (const c of ['can-load', 'comment-children__load-all', 'load-all__text', '查看更多回复', '全部', 'hb-loading', 'hb-loading-spinner', 'loading-circle', 'hiding=']) {
    console.log(`  ${c.padEnd(28)} ${[...domSrc.matchAll(new RegExp(c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'))].length}`);
  }
  section('楼中楼容器的 class 形态分布');
  const boxes = findAll(dom, (n) => hasClass(n, 'link-comment__comment-children'));
  const dist = new Map();
  for (const b of boxes) dist.set(b.attrs.class, (dist.get(b.attrs.class) || 0) + 1);
  console.log(`  .link-comment__comment-children 节点 ${boxes.length} 个`);
  for (const [k, v] of dist) console.log(`    ${v} → class=${JSON.stringify(k)}`);
  section('每个容器的子节点构成（楼中楼条数 + 是否有按钮）');
  boxes.forEach((b, i) => {
    const kids = b.children.map((c) => (c.tag === '#comment' ? '#comment' : `${c.tag}.${classes(c)[0] || ''}`));
    console.log(`  #${i + 1} 楼中楼 ${b.children.filter((c) => hasClass(c, 'comment-children-item')).length} 条 | 子节点: ${kids.join(' + ')}`);
  });
  section('其它可能的 loading 节点（全 DOM 带 loading 的 class）');
  const loadCls = new Set();
  (function walk(n) { for (const c of classes(n)) if (/load|spin|skeleton/i.test(c)) loadCls.add(c); n.children.forEach(walk); })(dom);
  console.log('  ' + ([...loadCls].join(', ') || '(无)'));
}

if (mode === 'raw' || mode === 'all') {
  section('真机原文：含「回复 用户名:」的楼中楼行（原样 outerHTML）');
  const src = read(domPath);
  const nbspRe = new RegExp('回复&nbsp;');
  let idx = 0, shown = 0;
  void nbspRe;
  while (shown < 3) {
    const i = src.indexOf('回复&nbsp;', idx);
    if (i < 0) break;
    const start = src.lastIndexOf('<div class="comment-children-item"', i);
    const oi = src.indexOf('children-item__other-info', i);
    const end = src.indexOf('</div>', src.indexOf('</span>', src.indexOf('</span>', oi) + 7));
    console.log(`\n--- 原文 ${shown + 1}（字符偏移 ${start}）---`);
    console.log(src.slice(start, end + 6));
    idx = i + 10; shown++;
  }
  section('真机原文：楼中楼容器（无 can-load、无按钮）与「全部 N 条回复」（decoded 态）');
  const dec = read('research/live-comment.decoded.html');
  const di = dec.indexOf('link-comment__comment-children');
  console.log(dec.slice(Math.max(0, di - 60), di + 90));
  const bi = dec.indexOf('comment-children__load-all');
  console.log('...\n' + dec.slice(Math.max(0, bi - 60), bi + 200));
  section('真机原文：展开态楼中楼容器的子节点（expanded）');
  const boxes = findAll(dom, (n) => hasClass(n, 'link-comment__comment-children'));
  boxes.slice(0, 2).forEach((b, i) => {
    console.log(`\n--- 容器 ${i + 1} class=${JSON.stringify(b.attrs.class)}，子节点 ${b.children.length} 个，末子节点 ---`);
    const last = b.children[b.children.length - 1];
    console.log(`  <${last.tag}> ${JSON.stringify(last.attrs)} ${last.tag === '#comment' ? '<!--' + last.comment + '-->' : ''}`);
  });
}

console.log('\n[done]');
