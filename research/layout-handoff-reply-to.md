# 真机布局缺陷移交：站点自带「回复 X:」的卡片，第一行被拆成 3 列

## 现象

真机页面 192688392 上，**站点自己渲染了 `回复 X:`** 的那 16 条楼中楼，卡片第一行错位：

```
铜潼铜潼                                          回复 墨墨:      ← 回复对象跑到最右边
  [图] 那也行啊，他一万的电池卖我八千的价我血赚，谁这么做慈…   4小时前·北京  ← 时间又跑到下/右
                                            [回复]  ✈
```

期望（规格 `research/comment-cards-spec.md` §3）：

```
[头像] 铜潼铜潼  回复 墨墨:  4小时前·北京
       <正文第一行>
       <正文第二行>              [回复]  ✈
```

而站点只渲染 `":"` 的 26 条**是对的**（第一行三段并排）。差别只在于：
那 16 条 `.children-item__reply-to` 里**有文字**（`回复 墨墨:`），26 条只有 `:`。

## 已经查清的事实（可直接采信，不必重查）

1. **不是选择器不匹配**。`replyTo.matches('html.hb-comment-cards [data-hb-tc] > .children-item__reply-to')` = true，
   `<html>` 上 `hb-comment-cards` 类在，卡片上 `data-hb-tc="1"` 在，`replyTo.parentElement === card`。
   （`scripts/probe-live-display-why.mjs`）
2. **不是 `!important` 没生效**。元素上 `style="display: inline !important;"` 已设上，
   但 `getComputedStyle(el).display` 仍报 `block` —— 这是**网格项的 blockification**：
   网格容器的直接子元素即使声明 `display: inline`，计算值也会被块化成 `block`。
   `scripts/probe-live-node-identity.mjs` 的 `aInlineStyle` 与 `aDisplay` 两行就是证据。
3. **不是节点被替换**。`sameNode` / `aConnected` / `afterWaitSameNode` 全为 true。
4. **所以真正的问题是：站点那 3 个节点（creator / reply-to / other-info）都是网格项**，
   被自动放置算法排进了**不同的列**。实测卡片列宽：
   `grid-template-columns: 33px 404.72px 60.28px`（外加一个隐式列），
   `creator` 在 col2、`reply-to` 落在 col3（宽 60px）、`other-info` 再落一列。
   第一行因此读成「左 / 右 / 下一行」。
5. 早期把 reply-to 设成 `display: contents` 会更糟：它的文字变成网格里的**匿名项**，
   被丢进 13px 窄格，渲染成每字一行的竖排（真机截图 `output/cards-live-closeup.png` 的旧版）。

## 你要做的

让**第一行只保留一个网格项**，其余两段跟着它按行内流排 —— 纯 CSS，**不许搬动站点节点**（硬约束，见规格 §3.1）。
已试过但不行的路子（省得重走）：
- `display: contents` → 匿名项被压成竖排；
- 只写 `display: inline` / `inline-flex` → 仍被 blockify 成网格项，各自占列；
- 加 `!important` → 同上，不是优先级问题；
- `grid-area: auto !important` → 会解析成 `auto / auto / auto / auto`，改成网格项落到别的行。

可用的思路（挑一个，用真机量测决定）：
- **A** 让 `.children-item__comment-creator` 成为第一行唯一的网格项、并给它
  `grid-column: 2 / -1`；把 reply-to 与 other-info 的 `display` 设成
  **不触发 blockification 的行内级**（例如 `display: inline-flex` 依旧会被块化，
  所以真正的解法可能是给它们 `position: absolute` 之外的东西 —— 自行实验），
  或
- **B** 反转口径：把这三段全部包进**同一个网格项**的视觉行 —— 例如让 creator 用
  `display: flow-root`/`inline-block` 承载行内流，另两段设 `display: inline-flex` 后
  通过 `grid-column: 2 / -1; grid-row: 1` 与 `justify-self: start` 叠在同一格里，
  再用 `margin-left` 手动让位（不推荐，脆弱）；
- **C** 承认站点节点是网格项这一事实，把第一行改成**两行内嵌套**的观感：
  creator 一行、reply-to 与 other-info 紧跟在同一行的**同一格内**（`grid-row: 1; grid-column: 2`），
  靠 `align-self` 与间距对齐，而不是靠列。

无论选哪个，**判据是量出来的**，不是看着像：对 `[data-comment-id="967572600"]`（站点自带 `回复 墨墨:`）
与 `[data-comment-id="967363978"]`（站点只有 `:`）两张卡，都要满足：

- `creator`、`reply-to`、`other-info` 三者的**文字首行 top 相差 ≤ 4px**（同一行）
- `content` 的文字首行 top **大于** creator 的 top（第二行起）
- 三者**没有水平重叠**：`replyTo.left >= creator.right`（或按实际视觉顺序）
- 站点那句 `回复 墨墨:` 的文字仍是**一行**（`Range.getClientRects().length === 1`）

## 现成工具（会话 `live` 已登录，别 close）

```bash
node scripts/probe-live-named-card.mjs      # 量 [data-comment-id="967572600"] 的全部子节点
node scripts/probe-live-display-why.mjs     # 证明「选择器匹配 / important 生效 / 块化」
node scripts/probe-live-node-identity.mjs   # 证明「不是节点被替换」
node scripts/capture-cards-closeup.mjs      # 重拍 output/cards-live-closeup.png
node scripts/verify-live-cards.mjs          # 20 条真机断言（改完必须仍全绿）
```

改完请复跑 `npm run build` + `node scripts/verify-live-cards.mjs` + `node scripts/verify-cards.mjs`（77/77）
+ `npm run verify:reply-btn`（55/55），并把两张卡的量测数据与 `output/cards-live-closeup.png` 发我。

## 写域

`src/comment-cards.css` 优先；确实需要改 DOM 结构时只允许 `src/comment-cards.ts`
（且不得搬动站点 4 个节点）。`src/comment-cards.ts` 与 `.css` 之外的文件不要碰。
