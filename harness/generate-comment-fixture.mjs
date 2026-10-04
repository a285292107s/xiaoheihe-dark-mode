import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const root = path.resolve(import.meta.dirname, '..');
const OUT = path.join(root, 'harness/comment-fixture.html');

const AVATAR_PLACEHOLDER =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40">' +
      '<rect width="40" height="40" fill="#c8cdd2"/></svg>',
  );

const CSS_NEEDLES = [
  'link-comment',
  'comment-children',
  'children-item__',
  'comment-item__content',
  'comment-item-header',
  'info-box__',
  'comment-schoolmate-tag',
  '.link-reply',
  'link-reply__',
  'hb-cpt-avatar',
  'hb-avatar__',
  'hb-emoji',
  'hb-level-tag',
  'hb-level-',
];

const CSS_FILES = [
  'research/css-detail/index-ChemEL1Y.css',
  'research/css/index-Cv4ia_mR.css',
  'research/css/index-C3LJfapH.css',
];

const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');


function rewriteAttr(html, attr, map) {
  const token = `${attr}="`;
  let out = '';
  let i = 0;
  for (;;) {
    const start = html.indexOf(token, i);
    if (start === -1) {
      out += html.slice(i);
      return out;
    }
    const valueStart = start + token.length;
    const end = html.indexOf('"', valueStart);
    if (end === -1) {
      out += html.slice(i);
      return out;
    }
    const value = html.slice(valueStart, end);
    out += html.slice(i, valueStart) + (map(value) ?? value);
    i = end;
  }
}

function buildSubtree() {
  let html = read('research/live-comment-expanded.html');

  html = html.split('<!---->').join('');

  html = rewriteAttr(html, 'src', (v) => (/^https?:/.test(v) ? AVATAR_PLACEHOLDER : null));

  return `<div class="layout-normal" id="page-bbs-link">${html}</div>`;
}


function collectCss() {
  const seen = new Set();
  const rules = [];
  for (const rel of CSS_FILES) {
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) continue;
    const css = fs.readFileSync(abs, 'utf8').replace(/^@charset[^;]*;/, '');
    for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const text = `${m[1]}{${m[2]}}`;
      if (seen.has(text)) continue;
      if (!CSS_NEEDLES.some((n) => text.includes(n))) continue;
      seen.add(text);
      rules.push(text.replace(/\s+/g, ' ').trim());
    }
  }
  return rules.join('\n');
}


function buildPayload() {
  const raw = JSON.parse(read('research/live-comment-tree.json'));
  const tree = Array.isArray(raw) ? raw[0] : raw;
  const flat = [];
  for (const item of tree.result.comments) for (const e of item.comment) flat.push(e);

  const mainIds = new Set(
    flat.filter((e) => !e.replyid).map((e) => String(e.commentid)),
  );
  const byId = new Map(flat.map((e) => [String(e.commentid), e]));
  const rootOf = new Map();
  for (const e of flat) {
    if (!e.replyid) continue;
    let root = byId.get(String(e.replyid));
    const seen = new Set();
    while (root && root.replyid && !seen.has(String(root.commentid))) {
      seen.add(String(root.commentid));
      root = byId.get(String(root.replyid));
    }
    if (root) rootOf.set(String(e.commentid), root);
  }

  const replyTargets = {};
  for (const e of flat) {
    const id = String(e.commentid);
    let entry;
    if (e.replyid) {
      const root = rootOf.get(id);
      const ru = e.replyuser && typeof e.replyuser === 'object' ? e.replyuser : null;
      const name = ru && typeof ru.username === 'string' && ru.username ? ru.username : '';
      const userId = String(
        (ru && ru.userid != null ? ru.userid : e.replyuserid != null ? e.replyuserid : '') || '',
      );
      entry = { name, userId, isMain: !!root && userId !== '' && userId === String(root.userid) };
    } else {
      entry = { name: '', userId: String(e.userid ?? ''), isMain: false };
    }
    const root = rootOf.get(id) || e;
    replyTargets[id] = { ...entry, rootUserId: String(root.userid ?? '') };
  }

  return { payload: tree, replyTargets, flat: flat.length, mains: mainIds.size };
}


const subtree = buildSubtree();
const css = collectCss();
const { payload, replyTargets, flat, mains } = buildPayload();

const CARD_REPLY_CLASS = 'hb-card-reply';

const EARLY = `<script>
window.__hbPageErrors = [];
window.addEventListener('error', (e) => {
  window.__hbPageErrors.push('error: ' + (e && e.message ? e.message : String(e)));
});
window.addEventListener('unhandledrejection', (e) => {
  const r = e && e.reason;
  window.__hbPageErrors.push('unhandledrejection: ' + (r && r.message ? r.message : String(r)));
});
</script>`;

const emojiClasses = new Set();
for (const m of subtree.matchAll(/class="[^"]*hb-emoji-cube_\d+/g)) {
  for (const c of m[0].matchAll(/hb-emoji-cube_\d+/g)) emojiClasses.add(c[0]);
}

const page = `<!doctype html>
<html lang="zh-CN">
<head>
${EARLY}
<meta charset="utf-8">
<title>楼中楼卡片化 · 离线验收 fixture</title>
<style>
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: #fff; color: #14191e; }
body {
  font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
}
#page-bbs-link { width: 760px; margin: 0 auto; padding: 16px 0 320px; }

${css}

.hb-avatar__image { display: block; object-fit: cover; background: #c8cdd2; }

.link-reply { position: fixed; bottom: 0; left: 0; right: 0; background: #fff; z-index: 501; }
.link-reply .link-reply__main-box { display: flex; align-items: center; }
.link-reply .link-reply__main-box .link-reply__input-wrapper { flex: 1; display: flex; flex-direction: column; align-items: flex-end; position: relative; padding: 8px 10px; background: #f7f8f9; border-radius: 5px; }
.link-reply .link-reply__main-box .link-reply__input-wrapper .link-reply__menu-box { display: none; }
.link-reply.expand .link-reply__main-box .link-reply__input-wrapper .link-reply__menu-box { display: flex; }
.link-reply__menu-box { align-items: center; justify-content: flex-end; gap: 8px; height: 38px; padding-top: 8px; }
.link-reply__menu-btn { width: 48px; height: 30px; font-size: 12px; line-height: 30px; text-align: center; border: 0; border-radius: 3px; cursor: pointer; }
.link-reply__menu-item { width: 20px; height: 20px; }
.hb-color__btn--confirm { background: #3ea3e3; color: #fff; }
.hb-color__btn--cancel { background: #f3f4f5; color: #64696e; }
.link-comment__target-box { display: flex; align-items: center; margin-bottom: 12px; height: 24px; }
.link-comment__target--comment { flex: 1; margin-left: 8px; font-size: 14px; line-height: 22px; color: #8c9196; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

</style>
</head>
<body>
<main>
${subtree}

<div class="link-reply collapse link-comment__reply" data-reply_wrapper="true">
  <div class="link-reply__main-box">
    <div class="link-reply__input-wrapper">
      <div class="link-reply__editor link-reply__input">
        <div contenteditable="true" translate="no" class="ProseMirror hb-editor" style=""><p><br class="ProseMirror-trailingBreak"></p></div>
      </div>
      <div class="link-reply__placeholder">评论 (已有85条评论)</div>
      <div class="link-reply__menu-box">
        <button class="link-reply__menu-item emoji" type="button">😀</button>
        <button class="link-reply__menu-item cy" type="button">cy</button>
        <button class="link-reply__menu-btn hb-color__btn--confirm" type="button">发送</button>
        <button class="link-reply__menu-btn hb-color__btn--cancel" type="button">取消</button>
      </div>
    </div>
  </div>
  <div class="link-reply__operation-box">
    <button class="link-reply__operation-item" type="button"><span class="link-reply__operation-desc">110</span></button>
    <button class="link-reply__operation-item" type="button"><span class="link-reply__operation-desc">4</span></button>
    <button class="link-reply__operation-item" type="button"><span class="link-reply__operation-desc">85</span></button>
  </div>
</div>
</main>

<script>
window.__hbTreePayload = ${JSON.stringify(payload)};
window.__hbReplyTargets = ${JSON.stringify(replyTargets)};
window.__hbExpected = { mainRows: 19, childRows: 42, treeMains: ${mains}, treeReplies: ${flat - mains}, emojiClasses: ${JSON.stringify([...emojiClasses])} };
document.addEventListener('click', (e) => {
  const a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
  if (a) e.preventDefault();
}, true);
window.__hbCardsModuleLoaded = false;
window.__hbCardsLoadError = null;
window.__hbCacheIngest = null;
window.__hbCardsReady = (async () => {
  const M = window.__hbHarnessModules || {};
  const cardsSpec = M['./comment-cards.ts'] || './comment-cards.ts';
  const cacheSpec = M['./comment-api-cache.ts'] || './comment-api-cache.ts';

  if (!window.__hbHarnessReady) {
    window.__hbCardsLoadError =
      'harness 未注入：请用 node scripts/verify-cards.mjs 跑本页（见 harness/README.md）';
    return false;
  }

  let mod = null;
  try {
    mod = await import(/* @vite-ignore */ cardsSpec);
    window.__hbCardsModuleLoaded = true;
  } catch (err) {
    window.__hbCardsLoadError = String((err && err.message) || err);
    return false;
  }

  let ingest = null;
  let cacheExports = {};
  try {
    cacheExports = await import(/* @vite-ignore */ cacheSpec);
  } catch {  }
  if (typeof cacheExports.__ingestTreeResponse === 'function') ingest = cacheExports.__ingestTreeResponse;
  else if (typeof window.__ingestTreeResponse === 'function') ingest = window.__ingestTreeResponse;

  let ingested = false;
  if (ingest) {
    try {
      ingest(window.__hbTreePayload);
      ingested = true;
    } catch (err) {
      window.__hbCardsLoadError = 'ingest failed: ' + String((err && err.message) || err);
    }
  }
  window.__hbCacheIngest = {
    found: !!ingest,
    fromModule: typeof cacheExports.__ingestTreeResponse === 'function',
    fromWindow: typeof window.__ingestTreeResponse === 'function',
    ok: ingested,
    exported: Object.keys(cacheExports),
  };

  if (typeof mod.exposeCommentCardsHooks === 'function') {
    try { mod.exposeCommentCardsHooks(); } catch (err) { window.__hbCardsLoadError = 'expose failed: ' + err; }
  }
  if (typeof mod.initCommentCards === 'function') {
    try { mod.initCommentCards(); } catch (err) { window.__hbCardsLoadError = 'init failed: ' + err; }
  }
  if (typeof window.__hbSetCommentCards !== 'function') {
    window.__hbCardsLoadError =
      (window.__hbCardsLoadError || '') +
      ' | __hbSetCommentCards 未挂载（卡片层没有 exposeCommentCardsHooks）';
    return false;
  }
  window.__hbCardsExports = Object.keys(mod);
  return true;
})();
</script>


<script>
(() => {
  const box = document.querySelector('.link-reply[data-reply_wrapper]');
  const mainBox = box.querySelector('.link-reply__main-box');
  const editor = box.querySelector('.ProseMirror');
  const COMMENT_BY_ID = {};
  for (const row of document.querySelectorAll('.comment-children-item[data-comment-id]')) {
    COMMENT_BY_ID[row.dataset.commentId] = row.querySelector('.children-item__comment-content');
  }
  for (const row of document.querySelectorAll('.link-comment__comment-item[data-comment-id]')) {
    COMMENT_BY_ID[row.dataset.commentId] = row.querySelector('.comment-item__content');
  }

  const collapse = () => {
    box.classList.remove('expand');
    box.classList.add('collapse');
    box.querySelector('.link-comment__target-box')?.remove();
    if (editor) editor.classList.remove('ProseMirror-focused');
  };

  const expandWith = (row) => {
    const id = row.dataset.commentId;
    const content = COMMENT_BY_ID[id] || row.querySelector('.children-item__comment-content, .comment-item__content');
    const target = (window.__hbReplyTargets || {})[id] || {};
    box.classList.remove('collapse');
    box.classList.add('expand');
    let tb = box.querySelector('.link-comment__target-box');
    if (!tb) {
      tb = document.createElement('div');
      tb.className = 'link-comment__target-box';
      tb.innerHTML =
        '<div class="hb-cpt-avatar link-comment__target--avatar" style="--hb-avatar-size: 24px; --hb-avatar-deraction-size: 38px;">' +
        '<img class="hb-avatar__image" src="${AVATAR_PLACEHOLDER}" alt=""></div>' +
        '<p class="link-comment__target--comment"></p>';
      mainBox.parentElement.insertBefore(tb, mainBox);
    }
    const p = tb.querySelector('.link-comment__target--comment');
    const text = (content && content.textContent ? content.textContent : '').trim();
    p.textContent = text;
    p.dataset.commentId = id || '';
    window.__hbLastTarget = { id: id || '', text, replyTarget: target.name || '', isMain: !!target.isMain };
    if (editor && editor.focus) editor.focus();
  };

  for (const row of document.querySelectorAll('.comment-children-item, .link-comment__comment-item')) {
    row.addEventListener('click', (e) => {
      const el = e.target;
      if (!el || !el.closest) return;
      if (el.closest('a, button, [contenteditable]') && !el.closest('.${CARD_REPLY_CLASS}')) return;
      e.stopPropagation();
      expandWith(row);
    });
  }
  box.querySelector('.hb-color__btn--cancel').addEventListener('click', (e) => {
    e.stopPropagation();
    collapse();
  });
  window.__hbReplyBox = { collapse, box };
})();
</script>
</body>
</html>
`;

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, page, 'utf8');

const kb = (n) => `${(n / 1024).toFixed(1)}KB`;
console.log(`生成 ${path.relative(root, OUT)}  ${kb(Buffer.byteLength(page))}`);
console.log(`  评论子树 ${kb(Buffer.byteLength(subtree))}（一级 19 / 楼中楼 42）`);
console.log(`  站点 CSS 子集 ${kb(Buffer.byteLength(css))}`);
console.log(`  tree payload ${kb(Buffer.byteLength(JSON.stringify(payload)))}（${flat} 条实体，${Object.keys(replyTargets).length} 条有 reply 关系）`);
console.log(`  出现的 emoji 类：${[...emojiClasses].join(', ') || '（无）'}`);
