# 小黑盒深色模式

为小黑盒网页版（[xiaoheihe.cn](https://www.xiaoheihe.cn/app/bbs/home)）提供深色模式的用户脚本。
不是简单反色：它把站点的 CSS 规则当作数据读出来，按「颜色角色」逐条重映射，
因此**伪元素、`:hover`/`:focus` 等交互态、`@keyframes`、JS 写入的内联颜色都能覆盖到**。

```
产物     28.2 KB（gzip 8.7 KB），无运行时依赖
开销     一次遍历 4700~5500 条规则约 45ms；元素级只处理「确实带内联颜色」的那约 20 个元素
例外     1106 字节（人工审计的例外层，其余全部就地改写站点声明）
```

## 安装

需要 [Tampermonkey](https://www.tampermonkey.net/)（或 Violentmonkey 等兼容管理器）。

**安装地址**（点开即安装）：

```
https://raw.githubusercontent.com/a285292107s/xiaoheihe-dark-mode/main/dist/xiaoheihe-dark-mode.user.js
```

脚本头含 `@updateURL` / `@downloadURL`，指向同一地址，因此装一次之后管理器会自动检查更新。

生效范围：`https://www.xiaoheihe.cn/*` 与 `https://xiaoheihe.cn/*`，`run-at: document-start`。

## 使用

- 右下角圆形按钮切换深色/浅色。
- 偏好记在 `localStorage` 的 `heybox-dark-mode` 键（`'1'` / `'0'`）。
  **未设置过时跟随系统** `prefers-color-scheme`。
- 控制台调试接口（正常使用不需要）：

  | 接口 | 作用 |
  |---|---|
  | `__hbSetDark(on)` | 开关（会同步按钮图标） |
  | `__hbIsDark()` | 当前是否深色 |
  | `__hbEngineStats()` | 本次构建：读取样式表数、扫描规则数、改动规则数、改动声明数、关键帧数、跟踪集大小、错误数 |
  | `__hbEngineCss()` | 例外层字节数 + 最近一次构建中被改写的前若干条声明 |
  | `__hbRebuild()` | 强制重建（换路由后样式没跟上时可用） |

## 为什么不是简单反色

两条实测结论决定了整个架构（证据链见 [`research/FINDINGS.md`](research/FINDINGS.md)）：

1. **站点的设计令牌层对渲染是失效的。** 站点定义了 695 个自定义属性（`--hb-*`、`--hb-general-color-*`），
   但把它们全部改成刺眼的红色后，页面上 **0 个元素变色**。真正决定外观的是
   546 条含字面量颜色的规则 —— 所以必须处理字面量，只覆盖变量是空转。
   （Element Plus 的 `--el-*` 令牌是例外，它确实生效，已单独补齐暗色值。）
2. **逐元素写内联样式有三处结构性死角。** 伪元素无法施加内联样式（站点有 426 条规则作用于
   `::before`/`::after`/`::placeholder`）；交互态无法用内联样式表达；SPA 会持续变更 DOM。
   而 CSS 规则天然作用于「当前与未来所有节点，含伪元素与各交互态」。

因此引擎的流程是：读站点样式表 → 判定每条声明的颜色角色（表面 / 文字 / 边框 / 阴影）→
**就地改写站点声明本身**（`CSSStyleDeclaration.setProperty`），层叠顺序、条件块、
原来的 `!important` 全部原样保留。关键帧与内联样式另行就地处理。

映射是**单调**的，不做取反：表面保持「越亮越浮起」的顺序压进深色带（画布 `#0e1116`、
卡片 `#262c33`），文字整体压进浅色带且越重要越亮。取反会丢掉层级关系，页面会变成一片均质灰。

引擎**绝不擅自追加 `!important`**。站点有两条优先级完全相同（(0,2,1)）、靠先后顺序决定胜负的
规则，抢赢站点自己的 `:hover` 规则就会把半透明覆盖层换成不透明板 ——
这正是[第十节](research/FINDINGS.md)记录的缺陷，`verify:cascade` 现在是这条约束的看门人。

## 已知限制

- **照片与图片不做任何处理**（刻意如此）。这是相对 `filter: invert` 方案的决定性优势：
  照片保持原样，等级标签/社区图标/Emoji/二维码也都正常。
- 只覆盖桌面网页版，不含 App 与移动端页面。
- 站点自己的深色模式与脚本可以同时开，但脚本是按「浅色源」设计的，同时开启时结果未经验证。
- `.nav--home` 变体（透明导航压封面图）上的按钮被转成深底浅字，压在照片上对比可能偏低，
  尚未接入真实封面图页面决定是否加例外。
- 详情页在无头浏览器下会撞腾讯验证码（全屏遮罩），因此**自动化验收**的详情页信号弱于首页；
  人工浏览不受影响。

## 开发

```bash
npm install
npm run build        # tsc -b && vite build -> dist/xiaoheihe-dark-mode.user.js
npm run dev          # 预览壳（index.html）：加载 fixtures 里的真实页面 DOM 快照
npm run verify:all   # 构建 + 全部验收（推荐）
```

验收脚本各自独立，也可以单跑：

| 命令 | 覆盖 | 断言数 |
|---|---|---|
| `npm run verify` | 真实首页 / 详情页：浅色表面、低对比文本、泥泞中间调、开关还原 | 出图 + 指标 |
| `npm run verify:ui` | 切换按钮全部行为：Shadow DOM 隔离、初始态、记忆、图标/aria 同步 | 45 |
| `npm run verify:lifecycle` | `<head>` 启动竞态、内联写循环、跟踪集约束、`url()` 保护 | 16 |
| `npm run verify:preview` | 预览壳双向切换与自身样式隔离 | 8 |
| `npm run verify:idempotent` | 反复重建 6 轮的渲染指纹与例外层字节稳定性 | 6 轮 |
| `npm run verify:cascade` | hover 层叠顺序（含阴性对照，证明判据有判别力） | 4 判据 |

四个「看起来只是小改动」的地方都有对应回归，改之前建议先看一眼它们的失败信息：
`<head>` 竞态、内联写循环、`url()` 里的颜色词、hover 层叠顺序。

### 目录

```
src/
  dark-engine.ts   引擎：角色判定 + 就地改写 + 例外层 + 生命周期
  dark-mode.ts     开关状态、偏好存储、基础层注入、订阅
  dark-base.css    基础层：画布底色、color-scheme、滚动条、placeholder、选区
  ui.ts / ui.css   切换按钮（原生 DOM，挂在 Shadow DOM 里）
  main.ts          入口
scripts/           验收脚本（见上表）
research/          证据与复现：FINDINGS.md 是完整结论，其余是可重跑的取证脚本
fixtures/          真实页面 DOM 快照（预览壳与部分脚本依赖）
dist/              构建产物（入库，供 raw 链接安装）
```

### 想自己调配色

改 `src/dark-engine.ts` 顶部的两个锚点即可，其余映射都从它们插值：

```ts
const CANVAS: RGBA = { r: 14, g: 17, b: 22, a: 1 };  // #0e1116 页面画布
const CARD:   RGBA = { r: 38, g: 44, b: 51, a: 1 };  // #262c33 浮起卡片
```

基础层画布色要同步改 `src/dark-base.css`（`html.hb-dark` 的 `background-color`）。
改完必须过一遍 `npm run verify:all`。

## 许可证

尚未声明。在补上之前，默认保留所有权利。
