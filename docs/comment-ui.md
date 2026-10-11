# 评论区三层：实现原理

这份文档讲 `src/` 里与评论相关的三层**为什么这样做**：复制解锁（`copy.ts`）、
评论免打扰（`reply-btn.ts`）、楼中楼卡片化（`comment-cards.ts`）。
偏版式与数据口径的部分在 [comment-card-spec.md](comment-card-spec.md)，
证据链在 [`research/FINDINGS.md`](../research/FINDINGS.md) 与
[`research/comment-dom.md`](../research/comment-dom.md)。

## 复制为什么救不回来

症状是评论区与楼中楼复制不出来，而正文可以。取证结论：**不是禁选样式**，
而是「回复此楼」这条流程在跟你抢选区。

**1. CSS 层：把 html/body 钉在 `text`。** 站点样式表里躺着一条休眠的全局禁选规则：

```css
html,body{-webkit-user-select:none;user-select:none}   /* 先 */
html,body{-webkit-user-select:text;user-select:text}   /* 后，靠它赢 */
```

两条权重都是 `(0,0,2)`，胜负纯靠先后顺序。哪次构建翻个序、或把后一条删掉，全站文字即刻锁死。
[`src/copy.css`](../src/copy.css) 用 `html.hb-copy` / `html.hb-copy body`（权重 `(0,1,1)`/`(0,1,2)`）
把它压住，同样**不需要 `!important`**。站点其余 30 条组件级 `user-select:none`（按钮、滑块、
分页器…）刻意不动 —— 那是正常 UI 语义，双击按钮选出一排字才是破坏。

**2. 选区快照。** 点评论区任何一条评论 = 发起「回复此楼」：回复框展开、
ProseMirror 编辑器 `focus()` 抢走焦点、正在建立的选区当场被毁。此后即使在评论上重新拖拽也建不起选区，
Ctrl+C 复制的是编辑器里的空选区。脚本监听 `selectionchange` 记下最近一个真实选区；
当它**在 focusin 之后 500ms 内塌掉**（也就是被夺焦毁的，而不是用户自己点的），
就标记为可救，之后 3 秒内的 Ctrl+C 用这份快照救回。用户主动点进编辑器打字则立刻作废快照。

**3. copy 事件兜底。** 实测还有间歇性的「copy 事件发出时 `clipboardData` 已被清空」：
选区完好、无人 `preventDefault`、主世界无任何 copy 监听，进剪贴板的仍然是空。
脚本在 `copy` 冒泡到 window（传播的最后一站，晚于一切祖先处理器）时检查：
选区有文本而 `clipboardData` 没有 → 写入选区文本并 `preventDefault`。
挂在这一站，无论谁在前面清空的都能救回来。

编辑器自身的复制管线（ProseMirror 的富文本序列化）不受影响：它会先写入 `clipboardData`，
本模块见到非空数据一律不插手；选区落在 `contenteditable` 里时也完全不参与。

## 评论免打扰：为什么加一个「回复」按钮

上一条的快照是**事后救回**。真正的根治是让「点正文」本身不再毁选区 ——
即把「回复此楼」的触发点从「整行」收进一个明确的按钮。

**触发点在哪。** 用 CDP `DOMDebugger.getEventListeners` 在真实详情页查过：`click`
处理器挂在**整行**上（一级评论 `.link-comment__comment-item`、楼中楼
`.comment-children-item` 都是），不在正文节点上。所以点正文、点「:」、点时间/IP、
乃至点行内一大片空白，都会走「回复此楼」。逐点验证（可信鼠标事件）：

| 点的位置 | 站点原行为 |
|---|---|
| 楼中楼正文 / 时间 / 行内空白 | 回复框展开 |
| 一级评论正文 / 行内空白 | 回复框展开 |
| 任意一级的作者链接 | **不展开**（站点自己就排除了链接） |
| 一级评论里的图片 | **开大图，同时也弹回复框** |

两级行的结构（与 [`fixtures/detail-full.html`](../fixtures/detail-full.html) 核对一致）：

```
一级评论 .link-comment__comment-item
  ├ .comment-item-header__info-box > .info-box__line-1
  │   └ .comment-item-header__operation-box > button.like-box
  └ .comment-item__content-container
      ├ .comment-item__content          正文（自己也有 click 监听）
      ├ .comment-item__image-box        图片，点了要看大图
      ├ .comment-item__tag-line         「作者赞过」之类
      ├ .hb-row-dock                    ← 按钮落点（自己插的）
      │   ├ button.hb-tc__fold          折叠按钮（卡片层插的）
      │   └ button.hb-reply            纸飞机（免打扰层插的）
      └ .link-comment__comment-children  楼中楼容器
楼中楼 .comment-children-item
  ├ a.children-item__comment-creator    作者链接
  ├ span.children-item__reply-to        「:」
  ├ p.children-item__comment-content    正文
  └ span.children-item__other-info      时间 / IP
```

**做法。** [`src/reply-btn.ts`](../src/reply-btn.ts) 只做两件事：

1. **捕获阶段拦一次。** 在 `document` 的捕获阶段听 `click`，命中评论行且目标落在
   正文/行空白时 `stopPropagation()`。捕获早于行上的冒泡处理器，站点收不到这一下，
   回复框不开、焦点不被抢、选区原地保留。
2. **补一个按钮。** 一级评论的按钮落进**正文容器末尾的一个右对齐 dock**
   （`.hb-row-dock`，`justify-content: flex-end`），点它时在**同一行**上再合成
   一次 `click` 并打放行标记 —— 站点处理器照常收到，回复框照常展开、并把该条评论
   正确引用进回复框。**回复功能一点没丢，只是换了个明确的入口。**

按钮是**一枚纸飞机图标**（24×24，与楼中楼卡片末尾那枚同一套路径），不写成文字药丸：
一级评论的操作区本来就有赞数与楼层信息，图标按钮才不跟它们抢横向空间。
dock 插在**发言内容之后、楼中楼之前**（`insertBefore` 楼中楼容器），所以它贴着的是
**这条评论自己的话**的右下角，而不是整个主评论区块的右下角 —— 楼中楼再长也不把它顶走。
右缘对齐正文容器右缘，扫过一屏评论时纸飞机落在一条稳定的纵向动作列上。
它比「折叠」重一级（`--hb-ui-ink-muted` 对 `ink-soft`），跟卡片末尾那枚纸飞机完全同款 ——
两处同款图标不套框，逐行加框只是为了分主次，太吵。

按钮刻意**不插进正文的文字流中间**：那会给选中打断一个不可选中的节点，反而打扰选中 ——
正是要修的事；dock 整块 `user-select: none`，行尾留白仍是可选的。站点自己的可交互元素一律放行
（链接、按钮、输入区），并额外放行
**图片框**（点了要看大图）与**楼中楼容器**（它有自己的 click 监听）。

**这一层只作用于一级评论。** 楼中楼的回复入口是卡片层末尾的纸飞机（见下），
所以楼中楼行既不再插按钮、也不再被捕获拦截 —— 整张卡片放行，交给卡片层与站点
自己的处理器。两处都塞一个「回复」入口是重复的，而且会在卡片里挤成两枚按钮。

SPA 换路由后评论区会重渲染，观察器负责给新行补按钮；关掉开关时按钮与样式表一起撤掉，
点正文立刻恢复成「弹回复框」。

一个刻意保留的站点行为：点评论里的**图片**仍然会连带弹出回复框，理由见
[known-limits.md](known-limits.md#评论免打扰与卡片化)。

## 楼中楼卡片化：为什么值得单独一层

楼中楼原本把「谁回复谁、什么时候、说了什么」全挤在一行里：
`夏柒: 这个前几天刚看过 9小时前·河北`。回复一多就成了密排文本，
而且**头像根本没有**、**回复对象时有时无**。卡片把每一条摊成三行（版式与字段口径见
[comment-card-spec.md](comment-card-spec.md)），并补上站点没渲染的那些信息。

### 数据从哪来：截获站点自己的接口，不发额外请求

楼中楼行的 DOM 里**既没有头像节点、也没有 userid 属性**（`children-item__comment-creator`
的 `href` 是唯一的 userid 来源），`span.children-item__reply-to` 又只在「回复楼中楼里另一个人」
时才有名字。头像与准确的回复对象只存在于站点自己的评论树接口里：

```
GET /bbs/app/link/tree?…&link_id=<id>
→ { result: { comments: [ { comment: [ 主楼本体, 该楼的楼中楼… ] } ] } }
```

[`src/comment-api-cache.ts`](../src/comment-api-cache.ts) 在 `document-start` 就把 `XMLHttpRequest`
与 `fetch` 钩上（站点这一路走 XHR），把响应解析成
`commentid → { 头像, 昵称, 回复对象, replyId }` 的表（`replyId` = 被回复的那条，用来定位卡片）；
[`src/comment-cards.ts`](../src/comment-cards.ts) 按行的 `data-comment-id` 查表。
**脚本不自己发请求**，所以不增加任何网络开销，也不碰站点的签名校验。

### 三个容易做错的点

1. **不能照搬站点的渲染条件。** 站点判「要不要显示回复对象」用的是
   `replyuser && replyid !== root.commentid`；而服务端在「回复楼主」时会把 `replyuser`
   **回落成楼主本人** —— 真机 11 条楼中楼里 10 条属于这种情况，照搬站点条件会把这 10 条显示错。
   本层的口径是 **userid 比对**（不是 `replyid` 比对）：`replyToUserId === 楼主userid`
   就是「回复楼主」，写「回复楼主」——不重复名字，但也不留站点那个孤零零的 `:`。
   回复同楼另一位用户时，接口的 `replyid` 能在容器里定位到那条卡片，于是写
   「回复 #N 名字」，N 就是那张卡片右上角的序号。接口完全查不到时保持站点原样，绝不编名字。
2. **不能搬动站点的节点。** 楼中楼行里的 4 个子节点由 Vue 管理，点「全部 N 条回复」
   会**整棵容器重渲染**。所以卡片 = 行本身，只往行里加三个自己的节点
   （头像、序号徽标、纸飞机），版式全部交给 CSS。重渲染后靠「`data-hb-tc` 标记 +
   这几个节点是否还在」幂等补齐 —— 与免打扰层同一套骨架。
3. **折叠按钮的 click 必须拦住冒泡。** 一级评论**整行**是热区，站点「点整行 → 弹回复框」
   的处理器挂在行上。折叠按钮插在同一行的操作条里，不 `stopPropagation` 就会顺路把回复框打开
   （它只是折叠，不该弹输入框）。

### 纸飞机为什么要合成一次 click

站点把「回复谁 + 在哪一楼」的状态收在自己的处理器里，发送时提交的是
`{ link_id, reply_id, root_id, text }`（`reply_id` = 被回复的那条，`root_id` = 所在主楼），
而**点楼中楼行**正是那个处理器把 `reply_id` 设成这一条的入口。所以纸飞机不自己造输入框，
只在行上合成一次 `click`，站点原生的回复框就会展开、引用这一条、把 `reply_id` 记对。

「恰好一次」的保证：免打扰层对纸飞机只做「不要按『点正文』拦」这一步（放行），
合成 click 的只有卡片层一处。
