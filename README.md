# 小黑盒深色模式

为小黑盒网页版（[xiaoheihe.cn](https://www.xiaoheihe.cn/app/bbs/home)）提供深色模式的用户脚本。
不是简单反色：它把站点的 CSS 规则当作数据读出来，按「颜色角色」逐条重映射，
因此**伪元素、`:hover`/`:focus` 等交互态、`@keyframes`、JS 写入的内联颜色都能覆盖到**。
照片与图片不做任何处理。

除深色本身外，另带两个可开关的功能，和一个常驻的修复层：

| 功能 | 入口 | 做什么 |
|---|---|---|
| **深色模式** | 右下角按钮（月亮 / 太阳） | 深色 / 浅色，未设置过时跟随系统 |
| **精简模式** | 右下角按钮（面板），默认开启 | 隐藏顶部导航的「首页」入口，以及社区页信息流与帖子详情页右侧的那一栏 |
| **评论区增强** | 右下角按钮（气泡），默认开启 | 一个开关管两层：**评论免打扰**把「回复此楼」的触发从「点整行任意位置」收进发言内容右下方一枚纸飞机按钮 —— 点正文只选中文字，不再弹出回复框、不再抢走焦点；**楼中楼卡片化**把每条回复排成一张卡片（头像 / 用户名 / 回复对象 / 序号 + 时间 · IP + 正文），回复入口是卡片末尾的纸飞机 |
| **复制解锁** | 无按钮，常驻开启 | 点评论会毁掉正在建立的选区，脚本在 3 秒内用快照救回一次 Ctrl+C |

深色与精简两个开关互不依赖、可单独开关；评论区增强是一层开关管两层实现，一起开一起关；
复制解锁与它们互不干扰 —— 它正常工作时用户什么都感知不到，所以没有给它按钮，
应急/调试可用控制台 `__hbSetCopy(false)`。

```
产物     80 KB（gzip 20 KB），无运行时依赖
开销     一次遍历 4700~5500 条规则约 20~35ms（实测）；元素级只处理「确实带内联颜色」的那约 20 个元素
例外     1556 字节（人工审计的例外层，其余全部就地改写站点声明）
精简     274 字节（一层惰性规则，不改站点任何声明）
复制     944 字节 CSS + 四个事件监听（无样式重排开销）
免打扰   2.4 KB 注入 CSS（含共享令牌）+ 一个捕获期 click 监听（只在评论行内生效）
卡片化   7.6 KB 注入 CSS（含共享令牌）+ 一个忽略自己节点的 MutationObserver；数据靠截获站点自己的评论接口（不发额外请求）
令牌     src/tokens.css 是上面两层的**唯一**颜色 / 字号 / 圆角来源，两层各注入一份
```

## 安装

先装一个用户脚本管理器，推荐 [**脚本猫 ScriptCat**](https://scriptcat.org/zh-CN) ——
国产扩展，中文界面，Chrome / Edge / Firefox 商店都能直装
（[Chrome](https://chromewebstore.google.com/detail/scriptcat/ndcooeababalnlpkfedmmbbbgkljhpjf) ·
[Edge](https://microsoftedge.microsoft.com/addons/detail/scriptcat/liilgpjgabokdklappibcjfablkpcekh) ·
[Firefox](https://addons.mozilla.org/zh-CN/firefox/addon/scriptcat/)），
也有配套的中文脚本站与[中文文档](https://docs.scriptcat.org/docs/use/use/)。
[Tampermonkey](https://www.tampermonkey.net/) 与
[Violentmonkey](https://violentmonkey.github.io/) 同样可用。

本脚本不依赖任何管理器专有 API（`GM_*` 一个都不用，偏好只写 `localStorage`），
所以上面三个管理器里跑起来完全一致；前提是脚本头里的 `@run-at document-start`
要被真正遵守，否则楼中楼卡片会补不上首屏那批头像
（原因见 [docs/known-limits.md](docs/known-limits.md#卡片化数据与降级)）。

**安装地址**（点开即安装）：

```
https://raw.githubusercontent.com/a285292107s/xiaoheihe-dark-mode/main/dist/xiaoheihe-dark-mode.user.js
```

脚本头含 `@updateURL` / `@downloadURL`，指向同一地址，因此装一次之后管理器会自动检查更新。

生效范围：`https://www.xiaoheihe.cn/*` 与 `https://xiaoheihe.cn/*`，`run-at: document-start`。

## 使用

右下角三个圆形按钮，上下叠成一列：

| 按钮 | 作用 | 偏好键 |
|---|---|---|
| 最下面那个（月亮 / 太阳） | 深色 / 浅色 | `localStorage` 的 `heybox-dark-mode`（`'1'` / `'0'`）。**未设置过时跟随系统** `prefers-color-scheme` |
| 倒数第二个（面板） | 精简模式：隐藏首页入口与社区页 / 帖子详情页右侧栏 | `localStorage` 的 `heybox-declutter`（`'1'` / `'0'`）。**未设置过时默认开启** |
| 最上面那个（气泡） | 评论区增强：楼中楼卡片化 + 评论免打扰 | `localStorage` 的 `heybox-comment-cards` 与 `heybox-reply-btn`（`'1'` / `'0'`），一次点击两个键一起读写。**未设置过时默认开启** |

三个按钮的图标画的都是**当前**状态（有没有右侧栏 / 气泡有没有被划掉 / 现在是深是浅），
动作名都在 `title` / `aria-label` 里写全了。

**复制解锁不在按钮列里。** 偏好记在 `localStorage` 的 `heybox-copy`（`'1'` / `'0'`），
应急/调试可用控制台 `__hbSetCopy(false)`（立即生效并记忆）。

### 控制台接口（正常使用不需要）

| 接口 | 作用 |
|---|---|
| `__hbSetDark(on)` / `__hbIsDark()` | 深色开关（会同步按钮图标）/ 查询 |
| `__hbSetDeclutter(on)` / `__hbIsDeclutter()` | 精简开关（会同步按钮图标）/ 查询 |
| `__hbSetCopy(on)` / `__hbIsCopy()` | 复制解锁开关（无按钮，立即生效并记忆）/ 查询 |
| `__hbSetReplyBtn(on)` / `__hbIsReplyBtn()` | 评论免打扰开关（按钮按「两层是否都开」同步图标）/ 查询 |
| `__hbSetCommentCards(on)` / `__hbIsCommentCards()` | 楼中楼卡片化开关（同上）/ 查询 |
| `__hbLookupCommentMeta(id)` | 查某条评论的补全数据（头像 / 回复对象），排查接口命中用 |
| `__hbApiCacheSize()` / `__hbApiCacheAttached()` | 已截获入表的评论条数 / 评论接口钩子是否已挂上 |
| `__hbIngestCommentTree(payload)` | 手动灌一份评论树响应（离线调试用） |
| `__hbEngineStats()` | 本次构建：读取样式表数、扫描规则数、改动规则数、改动声明数、关键帧数、跟踪集大小、错误数 |
| `__hbEngineCss()` | 例外层字节数 + 最近一次构建中被改写的前若干条声明 |
| `__hbRebuild()` | 强制重建（换路由后样式没跟上时可用） |

### 状态出口

CSS 与调试脚本都读它们，不必问内部状态：

| 标记 | 含义 |
|---|---|
| `html.hb-dark` | 深色是否已开启 |
| `html.hb-declutter` | 精简是否已开启 |
| `html.hb-copy` | 复制解锁是否已开启 |
| `html.hb-reply-btn` | 评论免打扰是否已开启 |
| `html.hb-comment-cards` | 楼中楼卡片化是否已开启 |
| `div[data-hb-tc="1"]` | 这一条楼中楼已被改造成卡片 |
| `html[data-hb-engine="ready"]` | 已完成至少一次规则映射；**缺这个属性**表示「已开启但站点样式还没被映射」 |

## 精简模式隐藏了什么

三处（全在 [`src/declutter.css`](src/declutter.css)）：

| 选择器 | 位置 | 说明 |
|---|---|---|
| `.nav .nav-content .nav-links > .nav-link:first-child` | 全站顶部导航 | 「首页」入口。导航项由站点的配置数组渲染，首项恒为「首页」（英文变体是 Home）；CSS 无法按文本匹配，所以只能用位置表达 |
| `#page-bbs-community > .content > .right` | 社区页信息流右侧 | 热门社区 / 下载 App / 页脚那一栏 |
| `#page-bbs-link > .content > .right` | 帖子详情页右侧 | 「相似内容」推荐那一栏，与社区页用的是同一套 `cpt-right-side right` 组件 |

社区页只藏侧栏是不够的：容器宽 1032px，而列表被站点自己的 `max-width:660px` 卡着，
藏完会在右边空出 356px。所以精简层同时复用了站点**自己的** `<1080px` 布局
（侧栏隐藏 + 列表取消上限 + 内容居中），与站点在窄屏下的表现逐条一致。
详情页不用补：主列 `.list` 本来就是 `flex: 1 1 0%`，侧栏一藏就自己撑满容器。

实现上只是 `<html>` 上一个类名 + 一层带 `data-hb-own` 的样式表：
选择器都多一层 `html.hb-declutter` 前缀，权重高过站点规则，因此**不需要 `!important`**，
站点原文一个字节都没动；关掉开关时类名与样式表一起撤除，页面回到站点原样。
两个目标的取证脚本是 [`research/probe-hide-targets.mjs`](research/probe-hide-targets.mjs)。

## 已知限制

影响安装决策的几条（完整清单见 [docs/known-limits.md](docs/known-limits.md)）：

- 只覆盖桌面网页版，不含 App 与移动端页面；站点自己的深色模式与脚本可同时开，但结果未经验证。
- 精简模式隐藏的「首页」入口是**按位置**选的：站点若调整导航顺序，这条规则要跟着改。
- 精简模式只处理社区页与帖子详情页的右侧栏，其它页面不受影响。
- 复制解锁的救回只在**选区被站点毁掉的 3 秒内**有效；先选中、趁编辑器还没抢完焦点按 Ctrl+C 最稳。
- 点评论里的**图片**仍会连带弹出回复框（并照常打开大图），这是站点自己的实现，拆不开。
- 免打扰只认站点那两层评论行结构、且只在详情页生效；站点改类名或改点击实现会**静默**退回原样。
- 卡片的头像是从站点评论接口读来的，接口改结构时会降级成按 userid 着色的字母块。

## 文档

实现在哪、为什么这样做的完整说明见 [docs/](docs/README.md) 索引：

- [docs/comment-ui.md](docs/comment-ui.md) —— 评论区三层（复制解锁 / 评论免打扰 / 楼中楼卡片化）的原理
- [docs/comment-card-spec.md](docs/comment-card-spec.md) —— 卡片的版式与字段口径
- [docs/dark-engine.md](docs/dark-engine.md) —— 深色引擎的架构决定与调配色
- [docs/known-limits.md](docs/known-limits.md) —— 完整已知限制

## 开发

```bash
pnpm install
pnpm run dev         # 预览壳（index.html）：加载 fixtures 里的真实页面 DOM 快照
pnpm run build       # tsc -b && vite build -> dist/xiaoheihe-dark-mode.user.js
```

改动后跑 `pnpm run build`，类型与构建通过是默认的验证要求；本仓库没有自动化测试。

### 目录

```
src/
  dark-engine.ts     引擎：角色判定 + 就地改写 + 例外层 + 生命周期
  dark-mode.ts       深色开关状态、偏好存储、基础层注入、订阅
  dark-base.css      基础层：画布底色、color-scheme、滚动条、placeholder、选区
  declutter.ts       精简开关状态、偏好存储、样式注入、订阅
  declutter.css      精简层：隐藏首页入口与社区页 / 帖子详情页右侧栏（社区列表加宽）
  copy.ts            复制解锁：选区快照 + 夺焦判别 + copy 事件兜底
  copy.css           复制层：把 html/body 钉回 user-select:text
  reply-btn.ts       评论免打扰：捕获期拦两级评论行点击 + 一级评论行内右下角补纸飞机按钮
  reply-btn.css      免打扰层：纸飞机按钮的材质与显隐（只碰自己插的节点）
  comment-api-cache.ts 评论接口缓存：钩 XHR/fetch 截获评论树，建 commentid → 头像/回复对象/replyId 查询表
  comment-cards.ts   楼中楼卡片化：就地改造行结构 + 序号徽标 + 纸飞机 + 一级评论上的折叠 + 可点的跨引用 #N
  comment-cards.css  卡片层：flex 版式、卡片材质、序号 / 纸飞机 / 头像 / 折叠按钮 / 跨引用跳转 / 悬停反馈接管
  row-dock.ts        一级评论行尾 dock：两层共用的建/复用/撤除，以及纸飞机路径
  row-dock.css       行尾 dock 版式：右对齐一行、控件间距（免打扰层与卡片层各注入一份）
  own-style.ts       共享的样式表注入：等 head 出现再注入带 data-hb-own 的样式，撤除时一并取消待注入
  tokens.css         两层共用的唯一令牌源：颜色 / 字号 / 圆角 / 尺寸
  ui.ts / ui.css     右下角三个开关（原生 DOM，挂在同一个 Shadow DOM 里；配色与动效令牌在 ui.css 顶部）
  main.ts            入口
docs/                文档（见 docs/README.md 索引）
harness/             离线复刻页：把真机评论 DOM 挂成可测页面（生成器与产出说明见 harness/README.md）
research/            证据与复现：FINDINGS.md 是深色引擎的完整结论，comment-dom.md 是评论区结构文档，
                     comment-cards-spec.md 是卡片层的规格，comment-ui-reference-notes.md 是参考页对照
fixtures/            真实页面 DOM 快照（预览壳依赖）
dist/                构建产物（入库，供 raw 链接安装）
```

## 许可证

MIT，见 [LICENSE](LICENSE)。

用到的站点资源（图标、CSS 分片、DOM 快照）版权归小黑盒所有，仅用于主题适配研究与回归测试。
本项目与小黑盒官方无关。
