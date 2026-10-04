# 离线验收台：楼中楼卡片化

这一层只干一件事：**让「卡片改完到底对不对」有客观判据**。它不实现卡片功能
（那在 `src/comment-cards.ts`），只把真机评论 DOM 挂成可测页面，再用一份断言脚本
把规格（`research/comment-cards-spec.md`）里的每一条判据量出来。

```
harness/comment-fixture.html          真机评论子树 + 回复框 + 模块加载 bootstrap（生成物）
harness/generate-comment-fixture.mjs  生成上面那个页面的脚本（改 fixture 改这里）
scripts/verify-cards.mjs              验收脚本：起浏览器、跑断言、打印 passed/failed
```

---

## 1. 怎么跑

```powershell
node scripts/verify-cards.mjs              # 跑全部断言，结束关掉自己的 cards 会话
node scripts/verify-cards.mjs --keep       # 跑完不关会话，留给下一轮/调试
node scripts/verify-cards.mjs --dump-html  # 只把「注入了模块图」的页面写到 output/，不起浏览器
```

- 退出码：**全绿 0 / 有失败 1**；会话起不来等环境问题返回 2。
- 只用自己的 `playwright-cli -s=cards` 会话，**不碰 `hb` / `verify`**，也绝不调用
  `close-all` / `kill-all`。`--keep` 之外结束时会 `-s=cards close`。
- 只读 `src/`，不写。卡片层改一个字节，下次跑就是新代码（不吃 `dist/`）。

## 2. fixture 里有什么

`harness/comment-fixture.html` 由 `harness/generate-comment-fixture.mjs` 生成
（**不要手改生成物**，改完重跑生成器并 diff）：

| 内容 | 来源 | 处理 |
| --- | --- | --- |
| 19 条一级评论 + 42 条楼中楼 | `research/live-comment-expanded.html` | 去掉 `<!---->` 占位注释；`img src` 换成本地占位（离线用） |
| 站点评论区样式 | `research/css-detail/index-ChemEL1Y.css`、`research/css/index-Cv4ia_mR.css`、`research/css/index-C3LJfapH.css` | 只抠评论子树 / 回复框 / 头像 / emoji / 等级牌相关规则 |
| 缓存预置数据 | `research/live-comment-tree.json` | 整份响应内联成 `window.__hbTreePayload`，由 bootstrap 调 `__ingestTreeResponse` |
| 回复框两态 | `research/live-replybox.json` | 收起态逐字抄；展开态由页面末尾的最小处理器生成 |
| 回复对象映射 | 由 tree 数据算出 | `window.__hbReplyTargets`：`{name, userId, isMain, rootUserId}` |

**接口出入一处**：`research/live-comment-tree.json` 落盘时外面还包了一层数组
（`[{status, result, …}]`，CDP `Network.getResponseBody` 的原样输出），
而规格 §1.3 写的是 `{status, result, …}`。fixture 生成器两种都吃。
`src/comment-api-cache.ts` 的 `__ingestTreeResponse` 也两种都吃，所以内联的是**原始数组形态**。

### 模块怎么进浏览器

直接用 `file://` 打开 `.ts` 是不行的，所以 `scripts/verify-cards.mjs`：

1. 用本地 `typescript` 把 `src/comment-cards.ts` 连同它的相对依赖（`comment-api-cache`、
   `reply-btn`、`*.css?inline`）就地 transpile 成 ESM；
2. 每个模块的 import 说明符改写成它依赖模块的 `data:text/javascript;base64,…` URL
   （依赖先建、后建引用方）；
3. 把这张 URL 表注入 fixture 的 `window.__hbHarnessModules`，fixture 的 bootstrap
   优先用它，拿不到才退回相对路径。

**为什么不本地起 HTTP server**：本仓库用 `execFileSync` 调 `playwright-cli`，那是同步调用，
会把 Node 事件循环整段冻住 —— 页面发出的模块请求一个也回不来，`page.goto` 必然 30s 超时
（实测）。`file://` + `data:` URL 完全不依赖 Node 的 IO，没有这个死结。
窗口模式下用 HTTP 起个静态服务也能直接打开 `harness/comment-fixture.html` 手动看，
只是那时没有注入模块，页面会提示「harness 未注入」。

### bootstrap 做了什么

`window.__hbCardsReady` 这个 Promise 里按顺序：

1. `import('./comment-cards')`（拿不到就记 `__hbCardsLoadError` 并返回 false）；
2. `import('./comment-api-cache')` → 有 `__ingestTreeResponse` 就灌入真机响应，
   没有就退到 `window.__ingestTreeResponse`（都没有则是「缓存不可用」的降级路径）；
3. `exposeCommentCardsHooks()` 再 `initCommentCards()` —— 顺序不能反，反了下面的
   钩子判据会先命中并 return（实测踩过）；
4. 校验 `__hbSetCommentCards` 真的挂上了。

验收脚本要拿这层状态，所以**目前必须由脚本注入模块图来跑**；卡片层交付后要用浏览器
手动看，也可以自己起个静态服务。

## 3. 每条断言在验什么

判据统计口径：括号里是**指标来源**，`规格 §x` = `research/comment-cards-spec.md` 的章节，
`新测` = 本次为这套 fixture 新增、规格里没有明写的判据。

### 分组一 · fixture 与模块加载（10 条）

| 断言 | 来源 |
| --- | --- |
| fixture 页面能打开并读到 DOM | 新测（环境自检：会话/页面坏了要能和卡片层没实现区分开） |
| 19 条一级评论行 / 42 条楼中楼行都在 | 规格 §5 冻结素材（19/42） |
| 回复框骨架在位、收起态、带「发送」 | 规格 §1.4 |
| 缓存预置：`__ingestTreeResponse` ingest 成功 | 规格 §2 契约 + §5 素材 |
| 卡片模块能从 `src/comment-cards.ts` 加载 | 新测（data: 模块图这条路本身） |
| `__hbSetCommentCards` / `__hbIsCommentCards` 已挂 | 规格 §2 + 与 `reply-btn.ts` 同款口径 |
| 开箱即开启态 | 规格 §0 目标（默认开） |

### 分组二 · 42 条全部成为卡片（结构 + 版式，46 条）

| 断言 | 来源 |
| --- | --- |
| 42 条 `.comment-children-item` 全部 `data-hb-tc="1"` | 规格 §3.1 |
| 每条恰好 **1** 个头像 / **1** 个序号徽标 / **1** 个纸飞机（数量断言，不是「存在」） | 规格 §3.1 |
| 站点原有 4 个子节点一个没搬走，新增的只有我们自己的那几个 | 规格 §3.1（就地改造） |
| 纸飞机是 `<button>` 且带 `aria-label`；会画出图标（svg/img/i/path ≥ 1） | 规格 §3.1 |
| 头像 / 序号 / 纸飞机都带 `data-hb-own`（深色引擎跳过） | 规格 §3.2 深色两态可读 |
| 纸飞机没有插进正文里 | 规格 §3.1（不打扰文字流） |
| 头像有真实渲染尺寸、有内容（命中给 img / 未命中给降级块） | 规格 §2（0 命中也必须完整可用） |
| 回复口径三态：`root` 补「回复楼主」、`other` 有「回复 #N 名字」或「回复 @名字」、站点自己渲染的原文不动 | 规格 §1.3（本轮升级：不再留悬空冒号，也不重复楼主名字） |
| 接口未命中的条目没有多插「回复对象」（不臆造） | 规格 §3.1 |
| 接口命中的条目里没有「补不出对象」的裸冒号残留（对照真机 26/42 条只有 `:`） | 规格 §1.3（新口径的反向判据） |
| 「回复楼主」与站点紧跟其后的冒号读成一个短语（间隙被抵消） | 新测（视觉：`回复 楼主 :` 是错读） |
| 序号徽标文本 = 本楼内的次序 `N#`（逐个对齐 DOM 位置）、每卡唯一 | 规格 §3.1（序号，本轮新增） |
| 序号徽标在作者行（第一行）的右端、在「:」右侧、不压正文 | 同上（`order` + `margin-left:auto`，不用绝对定位） |
| 序号徽标是纯展示（`pointer-events:none` + `user-select:none`） | 同上（不干扰行点击与拖选） |
| 折叠入口只长在「有楼中楼的那几楼」的操作条里，没有楼中楼的一楼不长 | 规格 §3.1（折叠，本轮新增） |
| 折叠入口是 `<button>`、带 `aria-expanded` 与 `aria-label`、文案是「折叠」 | 同上（可访问） |
| 站点 emoji 节点一个没丢（真机 21 个 `data-emoji`） | 规格 §5 素材（`comment-dom.md` §5：没有 link 级样式，正文纯文本） |
| 卡片是 `display:flex` + `flex-wrap:wrap`、间距 6px / 8px、有背景/圆角/描边/内边距 | 规格 §3.2 |
| 用户名在第一行（与回复对象、站点的 `:` 同排） | 规格 §3.2 |
| 时间/IP **独占一行**：在作者行下方、正文上方，且与正文同一左缘（误差 ≤ 2px） | 规格 §3.2（本轮版式：作者行 / 时间·IP 行 / 正文行） |
| 正文在时间/IP 之下、独占一行 | 规格 §3.2 |
| 头像占左列、在正文左侧、与正文盒子不水平重叠 | 规格 §3.2（**新测**：量两个盒子，不量首字 Range 落点 —— 那个会被 emoji 带偏） |
| 正文仍在站点节点里、文本未丢；纸飞机 `user-select:none` / `cursor:pointer` | 规格 §3.1 |

### 分组二·补 · 长楼折叠（10 条）

点「折叠」→ 该楼容器带 `hb-tc--folded`、该楼的行全部 `display:none`、其它楼不受影响、
按钮变「展开 N 条」且 `aria-expanded=false`；再点一次全部恢复（含 `aria` 回到 `true`）。
两侧点击都在行上装了冒泡探针，断言**没有冒到一级评论行上**（否则会顺路弹回复框），
且站点的回复框仍是收起态。判据来源：规格 §3.1（折叠）+ 新测。

### 分组三 · 纸飞机驱动站点回复框（8 条 + 7 条 = 15 条）

| 断言 | 来源 |
| --- | --- |
| 起始：收起态、无引用区、收起态看不到「发送」 | 规格 §1.4 |
| 点纸飞机 → 根 class `collapse` → `expand` | 规格 §1.4 / §1.5（合成 click，站点处理器不检查 `isTrusted`） |
| 出现 `.link-comment__target-box` 与「发送」按钮 | 规格 §1.4 |
| 引用文本 = 被点那条的正文（逐字一致） | 规格 §1.4 实测结论 |
| 编辑器在位 / 拿到焦点 | 规格 §1.4（无头环境下站点不一定抢焦点，故焦点这条放宽为「focused 或 activeElement」） |
| 展开后仍能取消 | 规格 §1.4 |
| 换一条点：引用文本跟着换 | 新测（防「硬编码上一次结果」假通过） |
| 展开态只有 1 个引用区 / 1 个回复框 | 新测（没有重复插入） |

**这一段量的是 fixture 里的站点替身**：`file://` 页面加载不了站点的 Vue，
所以「点行 → 引用并展开」由 fixture 末尾约 60 行最小处理器复刻（行为口径来自
`research/probe-reply-open.mjs` 的真机实测）。卡片层要负责的是**在行上合成一次 click**，
不是自己开框。

### 分组四 · 幂等（10 条）

| 断言 | 来源 |
| --- | --- |
| 连续两次 `__hbSetCommentCards(true)`：纸飞机 / 头像 / 序号徽标总数仍是 42、折叠入口仍是 6 | 规格 §3.3 |
| 没有任何卡片出现第 2 个纸飞机 / 第 2 个头像 / 第 2 个序号徽标 / 第 2 个回复对象 | 规格 §3.3 |
| 两次增强后仍是 42 条卡片、增强同步完成（<3s，无 await 竞态） | 规格 §3.3 |

### 分组五 · 阴性对照（16 条）

| 断言 | 来源 |
| --- | --- |
| `__hbSetCommentCards(false)` 后 `__hbIsCommentCards()` 为 false | 规格 §2 |
| `data-hb-tc` 全消失；纸飞机 / 头像 / 回复对象 / 序号徽标计数为 0 | 规格 §3.3 |
| 折叠入口计数为 0、`hb-tc--folded` 类名一个不剩、42 条行全部可见 | 规格 §3.1（折叠必须完全回到展开原样） |
| `data-hb-reply-kind` 标记也撤了（不留我们的痕迹） | 规格 §3.3 |
| 42 条楼中楼行、19 条一级评论行**仍在** | 规格 §3.1（只撤自己的改动） |
| 站点 4 个子节点关掉后仍完好 | 规格 §3.1 |
| 卡片样式也撤了（不再 `display:flex`、`display:grid` 都不在） | 规格 §3.2 |
| 观察器也断开：新插进来的一行没有被增强 | 规格 §3.3 |
| 回复框回到收起态 | 新测（前置动作是脚本自己收的，这条量的是「撤掉卡片不会顺手点开/关掉站点框」） |

### 分组六 / 七（5 条）

| 断言 | 来源 |
| --- | --- |
| 再开回来 → 42 条卡片、42 枚序号、6 个折叠入口全部回来、`__hbIsCommentCards()` 为 true | 规格 §2（开关可逆） |
| fixture 运行期 0 未捕获错误（`error` / `unhandledrejection`） | 新测 |
| 打开 fixture 过程 0 报错 | 新测 |

**阴性对照的意义**：只断言「开的时候对」的话，「什么都没做」也能通过一部分；
分组五是「关掉后必须回到站点原样」的反向判据，两组一起才说明这一层真的只碰自己的东西。

## 4. 与规格不一致的地方（都已按实现/实测口径验，差异记录在此）

1. **纸飞机类名**：规格 §3.1 写 `.hb-tc__reply`，实现导出的是
   `CARD_REPLY_CLASS = 'hb-card-reply'`。验收脚本**以模块自己的公开导出为准**
   （再退到探针），所以类名以后再改也不会把验收脚本改红；输出里会明确点出这处差异。
2. **头像是降级块还是 img**：规格 §2 说命中率 0 时用降级块。实现是「命中给 `img`，
   图片加载失败时换成字母降级块」，断言只要求「有内容」，两种都算过。
3. **接口响应的外层数组**：见 §2 末「接口出入一处」。
4. **回复对象**：规格 §1.2 的原始措辞是「`replyuser` 存在 ⟺ 回复楼中楼里另一位用户」，
   实测被推翻（11 条里 10 条是回复楼主）。现行口径（本轮迭代后）：**判 `replyToUserId`
   与楼主 userid 是否相等** —— 相等写「回复楼主」（不重复名字，也不再留站点那个孤零零的 `:`）；
   不相等且接口 `replyid` 能在同楼定位到那条卡片时写「回复 #N 名字」；站点自己渲染了
   `回复 X:` 时一个字都不动。fixture 上「站点原文不动」与「补回复楼主」两支都有真实用例；
   「回复 #N 名字」那一支真机素材里一条都没有（站点渲染条件与我们的判定口径几乎等价），
   当前没有断言覆盖 —— 这是**已知的覆盖缺口**，改动那一支时要手动在真页面确认。
5. **回复框替身不是站点行为**：见分组三说明。真机行为已在 `probe-reply-open.mjs` 实测，
   离线只做到「有真实对象」。
6. **折叠是规格 §3 没写的新能力**：本轮按参考页（另一家的暗色评论区）加入，
   取舍与对照见 `research/comment-ui-reference-notes.md`。它的「隐藏站点节点」是本层
   唯一一处例外，所以分组五专门盯着「关掉开关后行全部可见」。
7. **时间/IP 的版式**：卡片是「作者行 / 时间·IP 行 / 正文行」三行，时间/IP 不在作者那一行 ——
   参考页是同一行，但那在我们这里会读成「回复楼主：9小时前·安徽」；改法与小黑盒的
   主楼版式（`.info-box__line-2`）一致。

## 5. 已知坑（改这套东西之前先读）

### 5.1 playwright-cli 会话会互相干扰（最要紧的一条）

**存在另一个 playwright-cli 浏览器会话时，本脚本的 `cards` daemon 会被抖动打死。**
Lead 复现三次，同一份代码同一份 fixture：

| 条件 | 结果 |
| --- | --- |
| 开着 `-s=live`（有头、真页面）跑 | 第一次 `passed 64 / failed 12`，第二次 `passed 23 / failed 53` |
| 关掉 `live` 后立刻跑 | `passed 76 / failed 0` |
| 开着 `-s=noise`（about:blank）跑 | `passed 77 / failed 0`（自愈兜住，日志里有环境警告） |

失败形态全是同一族：`The browser 'cards' is not open`、
`Target page, context or browser has been closed`、
`页面取证失败（阴性对照取证）：page.evaluate: Target page, context or browser has been closed`。

脚本现在的处理（三层，都不需要人工干预）：

1. **启动时探测**：`cli(['list'])` 列出别人的会话（排除自己），在日志里明确告警，
   并写进结尾的「环境提示」——这是**环境提示，不是断言失败**。
2. **掉线自愈**：每次 CLI 调用失败且错误命中
   `/is not open|has been closed|Target page, context or browser|Connection closed|Protocol error/i`
   时，`close → open → 重新 goto fixture → 把页面拨回初始态（卡片开、回复框收起）→
   重试当前这一步一次`；只有重试也失败才记 failed。重开用**新的片段文件**
   （同一路径被首次调用占用后会 `fetch failed`）。
3. **绝不碰别人的会话**：不调用 `close-all` / `kill-all`，只 `-s=cards close`。

自测：`HB_KILL_DAEMON_ONCE=1 node scripts/verify-cards.mjs` 会先**硬杀**自己的 cards
daemon（不是优雅 `close` —— 那样 `sessionAlive` 先被置 false，反而绕过自愈，试过），
应当看到 `↻ 会话掉线…重开…` 且最终仍全绿。若结果异常，先关掉其它会话复跑一次确认：
自愈能兜住干扰，但「无干扰环境」才是判据的干净基线。

### 5.2 其它已踩过的坑

- **`page.addInitScript` + `page.waitForFunction` 会让 `cards` 会话在下一个 CLI 调用前
  失效**（实测：boot 拿得到 title，紧接着就 `The browser 'cards' is not open`）。
  现改为「goto + 在 `page.evaluate` 里轮询钩子」，稳定。
- **`cli(['open', url])` 的 url 参数在本机不生效**（打开的还是 about:blank），
  导航一律走 `runCode` 里的 `page.goto`。
- **`--filename=<path>` 不能包引号**：`execFileSync` 走 `cmd.exe` 时引号会被算进路径，
  实测 `ENOENT`。
- **`out.replace()` 的回调参数个数随正则变**：静态 `from '…'` 与动态 `import('…')`
  必须分开两遍改，否则第二遍会把第一遍刚插进去的 URL 前的东西削掉
  （表现为模块抛 `Unexpected string`）。
- **Node 模板字符串里的 `\D` 会退化成 `D`**：验收脚本里凡是在模板字符串内部的正则，
  反斜杠都要写 `\\`。这条坑掉过一次「头像占左列」的断言；本轮又把
  `/^回复 (楼主|#\d+ .+)$/` 写成了单反斜杠，正则变成 `#d+` 静默失效 —— 真机那条断言
  因此报红一次。**凡是注入页面的正则，先确认它里面没有单反斜杠。**
- **注入页面的代码里不能出现反引号**：`pageEval(\`…\`)` 本身就是模板字符串，
  body 里写一个反引号（哪怕在注释里）就会把模板提前闭合，报
  `SyntaxError: missing ) after argument list`。注释里要提反引号，写「反引号」三个字。
- **`:first-of-type` / `:last-of-type` 在 fixture 里有歧义**：6 个
  `.link-comment__comment-children` 容器各命中一条，`.last()` 拿到的是最后一楼那条。
  点某一行请用 `[data-comment-id="<id>"]`。
- **flex 换行里 `flex-grow` 撑不住换行**：分行在「假设主尺寸」阶段就定了，grow 只分配
  分行**之后**的剩余空间。想让某一项之后的内容换行，必须让某一项**占满一行**
  （`flex-basis: 100%` / `calc(100% - 41px)`）。做「时间/IP 独占一行」时先试了
  「让站点的 `:` 用 `flex: 1 1 auto` 吃满第一行」，真机上完全没换行 —— 项已经排在同一行，
  grow 只是把它撑宽。
- fixture 里 `.link-reply` 与卡片的背景色都来自站点 CSS，量到的颜色是真实值。
