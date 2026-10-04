# 楼中楼卡片化 — 实现说明与真机事实（Lead 冻结版）

本文件是本次迭代的**唯一权威规格**。任何与真机不符的推断都以本文件为准；发现冲突立即回报 Lead。

---

## 0. 现状与目标

**目标**：把评论区**楼中楼**（`.comment-children-item`）每条回复重构成卡片：

1. 第一行：用户头像 + 用户名 + 回复对象 + 发言时间（IP 可留在时间旁），行尾一枚序号徽标 `N#`
2. 第二行起：回复正文（含 emoji、图片、多段）
3. 卡片末尾：一个**纸飞机**图标按钮，点击弹出输入框，对该条回复作答
4. 一级评论不改版式，但操作条里多一枚「折叠 / 展开 N 条」，把整楼的楼中楼收起
   （本轮迭代加入，参考页对照见 `research/comment-ui-reference-notes.md`）

一级评论的回复入口沿用 `src/reply-btn.ts` 的行内「回复」按钮。

---

## 1. 真机事实（已在有头 Chrome + 真页面 192688392 上核实）

### 1.1 楼中楼的 DOM（真机逐字抄录）

```html
<div class="comment-children-item" data-comment-id="967363978">
  <a href="/app/user/profile/29344911" class="children-item__comment-creator">夏柒</a>
  <!---->
  <!---->
  <span class="children-item__reply-to">:</span>
  <p class="children-item__comment-content">这个前几天刚看过<span data-emoji="cube_滑稽" class="hb-emoji hb-emoji-cube hb-emoji-cube_34"></span>说实话拍摄水平一般</p>
  <span class="children-item__other-info">
    <span class="children-item__create-time">9小时前</span>
    <span class="children-item__ip">·河北</span>
  </span>
</div>
```

**楼中楼行里没有头像节点**（全文档搜 `children-item__avatar` 为空），也**没有 userid 属性**，`href` 的 `/profile/<userid>` 是唯一的口径。

### 1.2 回复对象：DOM 里大部分时候是空的

站点的渲染函数（`research/js/index-CVVwhh7y.js`，dom-analyst 已定位）：

```
span.children-item__reply-to 的文本 = (replyuser && replyid !== root.commentid)
      ? "回复 " + replyuser.username : ""
    + ":"
```

- 实测两种形态：`":"`（回复主楼）与 `"回复&nbsp;用户名:"`（回复楼中楼里另一个人）
- 该 span 里**没有任何 `<a>`**，回复对象名字不可点击、拿不到 userid
- **真机计数（Lead 亲自复核，`node research/comment-probe-live.mjs replyto` 亦可复现）**：
  我抓的 42 条楼中楼里 **26 条是 `":"`、16 条是 `"回复 用户名:"`**。
  16 条带名字的对象**全部是同楼里另一位楼中楼作者，0 条指向楼主** ——
  与站点的渲染条件 `replyuser && replyid !== root.commentid` 完全吻合。
  我上一版写「42 条全是 `":"`」是**错的**（我当时只看了首屏那 11 条，而那 11 条里 10 条确实在回复楼主）。
- 所以 DOM 侧也能拿到**一部分**回复对象（那 16 条的纯文本、无 userid）；
  但「回复的是不是楼主」这件事 DOM 只能靠「有没有名字」间接判，接口才是权威口径。

### 1.3 接口才有完整数据：`/bbs/app/link/tree`

真机响应结构（`research/live-comment-tree.json` 已落盘；该响应里 **20 主楼 + 11 楼中楼**，
`total_floor_num=31` 是另一个口径，别当成条数）：

```jsonc
{ "status": "ok", "result": { "comments": [ { "comment": [ { /* 评论本体 */ } ] } ] } }
```

评论本体字段（节选）：

| 字段 | 含义 |
| --- | --- |
| `commentid` | 评论 id，与 DOM 的 `data-comment-id` **一一对应** |
| `userid` / `user.username` / `user.avatar` | 作者 id / 昵称 / 头像 URL |
| `text` | 正文（emoji 是 `[cube_滑稽]` 这种 token） |
| `imgs` | 图片数组（`{thumb,url,width,height,mimetype}`） |
| `create_at` | unix 秒 |
| `ip_location` | 「河北」这种 |
| `child_num` | 楼主楼下的楼中楼总数 |
| `replyid` | **被回复的评论 id**（回复楼主时即楼主 id） |
| `replyuserid` / `replyuser.username` / `replyuser.avatar` | **被回复的人**；回复楼主时它回落成楼主本人 |
| `up` / `is_top` / `floor_num` / `has_more` | 点赞/置顶/楼层/还有更多 |

**关键语义（Lead 用真机数据逐条核对，`research/list-tree-entries.mjs` 可复现）**：

> `replyuser` **总是存在**——回复楼主时它回落成**楼主的用户名与 userid**，回复楼中楼里另一位用户时才是那个人。
> 所以「回复对象」直接用 `replyuser.username`，**不要**判空后回落楼主（回落逻辑服务端已经做了）。

**⚠️ 纠正早期误判**：本规格上一版说「20/31 条 replyuser 缺失」是错的——那是解析脚本没下钻对层数导致的假象。权威计数：一次 `/bbs/app/link/tree` 响应里主楼 20 个、楼中楼 **11 条**（每楼首屏 2 条；31 是 `total_floor_num` 口径，不是本响应里的条数），且**11/11 都有 `replyuser`**。

**⚠️ 不要照搬站点的渲染条件**：站点楼中楼组件用的条件是
`replyuser && replyid !== root.commentid ? "回复 " + replyuser.username : ""`。
真机数据里 11 条中有 **10 条 `replyid === root.commentid` 却带着 `replyuser`**（即回复楼主，该字段=楼主），
按站点条件这些会**渲染成空**。卡片层的口径必须更准：

> 目标是**同楼另一条楼中楼**（接口 `replyid` 能在容器里定位到那条行）→
> 补「回复 #N 名字」，N = 目标卡片在本楼的序号（见 §3.1 的序号徽标）；
> 目标是**楼主**（`replyuserid === 楼主 userid` 且定位不到同楼行）→ 补「回复楼主」，
> **不重复名字**（卡片上方就是那位楼主），并打 `data-hb-reply-kind="root"`；
> 站点自己渲染了「回复 X:」（真机 42 条里 16 条）→ **一个字都不动**；
> **接口完全查不到时**同样保持站点原样，不要编名字。
> 判定「是不是楼主」用 **userid 比对**，不要用 `replyid` 比对（两者在真机 11/11 等价，
> 但 userid 比对不依赖「root 是哪条」这个额外假设）。

> **本轮口径变更（相对上一版）**：上一版在「回复楼主」时**什么都不插**，留着站点那个
> 孤零零的 `:`；迭代后改为补「回复楼主」。理由是参考页（另一家的暗色评论区）
> 在同一个位置**永远写明目标**，而小黑盒真机 42 条里 26 条只有 `:` —— 悬空冒号读不出
> 这条在回谁。不重复名字这一条没变，变的只是「不留悬空冒号」。

理由：回复楼主时名字必然等于卡片上方那一楼楼主，重复显示只是噪声；
真机 42 条里站点自己也不显示（26/42 是 `":"`）。

### 1.4 回复框（纸飞机要驱动的目标）

真机两态 DOM（手抄，完整版见 `research/live-replybox.json`）：

**收起态**
```html
<div class="link-reply collapse link-comment__reply" data-reply_wrapper="true">
  <div class="link-reply__main-box">
    <div class="link-reply__input-wrapper">
      <div class="link-reply__editor link-reply__input">
        <div contenteditable="true" class="ProseMirror hb-editor ProseMirror-focused"><p><br class="ProseMirror-trailingBreak"></p></div>
      </div>
      <div class="link-reply__placeholder">评论 (已有85条评论)</div>
      <div class="link-reply__menu-box">
        <button class="link-reply__menu-item emoji">…</button>
        <button class="link-reply__menu-item cy">…</button>
        <button class="link-reply__menu-btn hb-color__btn--confirm">发送</button>
        <button class="link-reply__menu-btn hb-color__btn--cancel">取消</button>
      </div>
    </div>
  </div>
  <div class="link-reply__operation-box">…点赞 / 收藏 / 评论数…</div>
</div>
```

**展开态**：根 class 变 `link-reply expand link-comment__reply`，并在 `main-box` **之前**插入引用区：
```html
<div class="link-comment__target-box">
  <div class="hb-cpt-avatar link-comment__target--avatar" style="--hb-avatar-size: 24px; --hb-avatar-deraction-size: 38px;">
    <img class="hb-avatar__image" src="…" alt="">
  </div>
  <p class="link-comment__target--comment">被回复的那条评论原文</p>
</div>
```

实测（`research/probe-reply-open.mjs` 输出）：
- 点楼中楼行 → 根 class 变 `expand`，`target--comment` 文本 = **所点那条楼中楼的正文**（逐字一致）
- 点一级评论正文 → `target--comment` 变该楼正文
- 两种情况下都出现「发送」按钮（`hb-color__btn--confirm`），`ProseMirror` 拿到焦点
- 取消入口 = `button.link-reply__menu-btn.hb-color__btn--cancel`（点它回 `collapse` 且 target-box 被移除）

### 1.4.1 发送时站点真正提交的字段（源码实锤）

`research/js/index-CVVwhh7y.js` 里发评论的构造（原文压缩后节选）：

```js
const X = {
  is_cy: T.is_cy ? 1 : 0,
  link_id: String(n.link.linkid),
  reply_id: r.value ? String(r.value.commentid) : "-1",   // 被回复的那条
  root_id:  h.value ? String(h.value.commentid) : "-1",   // 所在主楼
  text: T.text,
};
```

回复状态的唯一入口是一个全局事件：

```js
ze("PageBBSLink:setReplyComment", _)   // _ = (replyComment, rootComment) => …
// 内部：r.value = T（被回复的那条）; h.value = B（主楼）
// 之后调用回复框的 onReply()，并把该条 commentid 交给站点自己的滚动/高亮逻辑
```

结论：**点楼中楼行 → 站点用它自己的处理器把 `reply_id` 设成那条楼中楼、`root_id` 设成主楼**。
纸飞机只要在行上合成同一次 click，就能拿到完全一致的 `reply_id` / `root_id`（比手搓输入框更不容易错）。
若哪天要手搓，可用的落点就是这个全局事件 `PageBBSLink:setReplyComment`（注册/触发函数在 `Extension-BI5IRNqK.js` 的 `ze`/`yt` 一族里）。

**纸飞机的实现口径**：在目标楼中楼行上合成一次 `click`（与 `src/reply-btn.ts` 的既有做法一致，站点处理器不检查 `isTrusted`），站点的冒泡处理器就会展开回复框并引用该条。**不要自己另写输入框**，除非实测证明站点拒绝「回复楼中楼」。

### 1.5 点击热区（来自 `research/FINDINGS.md` 第十六节，非本次新测）

- `click` 监听挂在**行本身**（`.comment-children-item` 与 `.link-comment__comment-item`，各 2 个非 capture）
- **两级评论整行都是热区**：点正文、点时间/IP、点行内空白都会展开回复框
- 站点自己的 `<a>`/`button`/输入区反而是安全的
- 现有 `src/reply-btn.ts` 已在捕获阶段拦下「点正文」，仅放行自己的 `.hb-reply` 按钮

### 1.6 类名冲突（已实测排除）

站点 CSS 里**没有** `.hb-reply` 规则（只存在 `.link-reply`），现有按钮类名安全。

---

## 2. 对外接口（跨模块契约，不要改签名）

```ts
// src/comment-cards.ts
/** 一条楼中楼回复的补全数据；拿不到时返回 null，卡片必须仍可用 */
export interface ThreadReplyMeta {
  authorAvatar?: string;      // 回复作者的头像 URL（**必须取 author 的，不是被回复者的**）
  authorName?: string;        // 回复作者昵称（DOM 里其实也有，备用）
  replyToName?: string;       // 被回复者昵称；服务端已回落成楼主，取到就能直接用
  replyToUserId?: string;     // 被回复者 userid，用于与楼主 userid 比对
  replyId?: string;           // 被回复的那条评论 id（接口 replyid），用来在同楼定位目标卡片
}
```

判定回复对象（见 §1.3 的纠正）：
`replyToUserId` 与「该楼楼主」的 userid 不同 → 显示 `回复 @{replyToName}`；
相同 → 语义上是回复楼主，可显示 `回复 @{replyToName}`（等同楼主）或留空；
**两者都要与「完全查不到」区分开**——查不到时回落到站点 `:` 的原样，不要编名字。

楼主的 userid 从哪来：该楼一级评论行的 `a[href^="/app/user/profile/"]` 的 href 尾段
（`.link-comment__comment-item` → `.comment-item-header__avatar` 的父 `<a>` 或 `.info-box__username` 的 href）。

/** 装上/卸下这一层（幂等）。由 main.ts 与 ui.ts 调用 */
export function applyCommentCards(enabled: boolean): void;
export function isCommentCardsEnabled(): boolean;
export function initCommentCards(): boolean;
export function onCommentCardsChange(fn: (enabled: boolean) => void): () => void;
export function exposeCommentCardsHooks(): void;   // window.__hbSetCommentCards / __hbIsCommentCards
```

`getThreadMeta` 的**唯一**提供者默认是 `src/comment-api-cache.ts` 导出的 `lookupMeta(commentId)`；
卡片模块**不得**直接 fetch，也不得假设它一定命中——命中率 0 时卡片必须完整可用（头像用降级块）。

---

## 3. 卡片的结构与样式口径

### 3.1 结构（就地改造，不搬走站点节点）

楼中楼行**自身**当卡片，站点原有 4 个子节点**一个都不移动**（避免 Vue 重渲染错位）：

```html
<div class="comment-children-item hb-tc" data-comment-id="…" data-hb-tc="1">
  <a class="children-item__comment-creator">夏柒</a>
  <span class="children-item__reply-to">:</span>
  <p class="children-item__comment-content">…</p>
  <span class="children-item__other-info">…</span>
  <!-- 本脚本新增的节点：头像 / 序号徽标 / 纸飞机（一级评论上另有折叠按钮） -->
  <span class="hb-tc__avatar" data-hb-own="">…img 或降级块…</span>
  <span class="hb-tc__floor" data-hb-own="">1#</span>
  <button class="hb-card-reply" type="button" data-hb-own="" aria-label="回复这条评论" title="回复这条评论">…纸飞机 svg…</button>
</div>
```

> 类名以**实现为准**（`src/comment-cards.ts` 导出的 `CARD_REPLY_CLASS = 'hb-card-reply'`、
> `CARD_FLOOR_CLASS = 'hb-tc__floor'`、`CARD_FOLD_CLASS = 'hb-tc__fold'`，
> 头像 `hb-tc__avatar`，回复对象 `hb-tc__replyto`）。验收脚本一律读模块导出值，
> 不再硬编码 —— 早期规格里写的 `.hb-tc__reply` 作废。

**序号徽标**：每条卡片一枚 `N#`，N = 它在所属 `.link-comment__comment-children` 里的次序（1 起），
只由 DOM 位置算出（不依赖接口，0 命中也有）。它就是「回复 #N 名字」里那个 N。

**回复对象文本的补写**（口径见 §1.3）：站点 `reply-to` 只有 `":"` 时，在 `:` **之前**插入
`<span class="hb-tc__replyto" data-hb-own="">`，文本按三态取「回复楼主」/「回复 #N 名字」/
「回复 @名字」；站点已经渲染了 `"回复 X:"` 时**不要重复插**；接口查不到时保持站点原样。

**一级评论的折叠按钮**：`.hb-tc__fold` 追加进站点自己的
`.comment-item-header__operation-box`（与点赞并排），文案「折叠」/「展开 N 条」，
`aria-expanded` 同步；点击只切换楼中楼容器上的 `hb-tc--folded`（本层唯一一处隐藏站点节点），
并且**必须 `stopPropagation`**（一级评论整行是热区，不拦会顺路弹回复框）。

### 3.2 版式（用 CSS，别用 JS 搬节点）

**实际版式 = flex 换行三行**（grid 方案在真机上失败，原因见 `src/comment-cards.css` 顶部注释：
网格项会被块化，站点那三段文字各占一列）：

```
┌────────────────────────────────────────────────┐
│ (头像)  夏柒  回复 #2 火种:                  1# │  第一行：作者 + 回复对象（+ 站点 `:`）+ 序号徽标
│         9小时前·河北                            │  第二行：时间 / IP
│         这个前几天刚看过 [emoji] ……             │  第三行起：正文
│                                            ✈   │  末尾：纸飞机
└────────────────────────────────────────────────┘
```

- `[data-hb-tc]` 用 `display: flex` + `flex-wrap: wrap`，行间距 `6px`、列间距 `8px`；
  卡片加背景/圆角/内边距/边框，配色走 `--hb-tc-*` 令牌（浅色/深色两态都读得出来）
- `hb-tc__avatar` → `flex: 0 0 33px`（固定 33px，不用 `auto`：`auto` 会算出小数，
  头像右缘与内容列会错开）
- 作者行：`children-item__comment-creator`（order 1）+ `hb-tc__replyto`（order 2）+
  站点 `children-item__reply-to`（order 3），三者 `white-space: nowrap`
- 序号徽标 `hb-tc__floor` → order 4 + `margin-left: auto`（落在作者行右端；**不是绝对定位**，
  否则会压住文字）
- 时间/IP `children-item__other-info` → order 5 + `flex-basis: calc(100% - 41px)` +
  `margin-left: 41px`（**占满一行** = 后面的项必然换行；`flex-grow` 做不到这件事，
  分行发生在 grow 之前）
- 正文 `children-item__comment-content` → order 9 + `flex-basis: calc(100% - 41px)` +
  `margin-left: 41px` + `white-space: pre-wrap`（保留正文里的真换行；emoji 是空 span，
  靠 CSS 显示，**不许重写 textContent**）
- 纸飞机 `hb-card-reply` → 绝对定位到卡片右下（与卡片内边距对齐，见 CSS 注释）
- 41px = 头像列 33px + 列间距 8px：两行的左缘因此与用户名左缘对齐
- **深色**：站点深色由本脚本的 `html.hb-dark` 驱动，卡片配色必须两态都可读（用 CSS 变量，勿写死）
- 尊重 `@media (prefers-reduced-motion: reduce)`；`forced-colors` 下给纸飞机与折叠按钮系统色

### 3.3 幂等与重渲染（最高风险）

- 每次扫描先判 `row.dataset.hbTc === '1'` 且新增节点仍在，否则重建缺失的节点
- `button.comment-children__load-all` 点击后站点会**整棵 `.link-comment__comment-children` 重渲染**
  （dom-analyst §10.1 列为高风险）→ 必须有 `MutationObserver` 兜底，且观察器回调里**不得**再写 DOM 造成回环
- 参考 `src/reply-btn.ts` 的 `decorateAll()` / `ensureObserver()` / `attach()` / `detach()` 骨架

---

## 4. 交付与验收

- 每个任务只碰自己的写域；完成后 `npx tsc -b` 必须过、`npm run build` 必须过
- 交付前跑一次 `npm run verify:reply-btn`（现有行级验收，卡片层不许把它弄红）
- 卡片层自己的判据：`npm run verify:cards`（离线 113 条）、
  `npm run verify:card-api`（离线 77 条）、`npm run verify:cards-live`（真机 22 条）
- 截图证据放 `output/`（离线：`output/cards-offline/cards-fixture.png`；
  真机：`output/cards-live-*.png`）
- **不要在真页面上点「发送」**，除 Lead 单独安排的最终联调

---

## 5. 已冻结的真机素材（可直接用，勿重抓）

| 文件 | 内容 |
| --- | --- |
| `research/live-comment-expanded.html` | **19 条一级 + 42 条楼中楼**，全部展开后的真实 DOM（48KB） |
| `research/live-comment-tree.json` | 真机 `/bbs/app/link/tree` 响应（20 主楼 + 31 楼中楼，含头像与 replyuser） |
| `research/live-comment.decoded.html` | 未展开态评论子树（3 主楼 + 5 楼中楼，含 `":"` 形态） |
| `research/live-replybox.json` | 回复框收起/展开两态完整 DOM |
| `research/comment-dom.md` | dom-analyst 的 788 行结构文档（19 条稳定锚点 / 23 条脆弱点） |
