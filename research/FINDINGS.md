# 小黑盒深色模式：从第一性原理重新设计

> 本文档的所有结论都来自 `research/` 下的实测脚本，不是推测。
> 复现方式见文末。

---

## 一、技术栈与页面事实

| 项 | 结论 | 证据 |
|---|---|---|
| 框架 | **Vue 3 SPA**，Vite 构建、按路由分包 | `data-v-*` 作用域样式 132 处；`index.vue_vue_type_style_index_0_lang-*.js` 分片名 |
| 发布 | `@heybox-spa/website`，资源在 `static.max-c.com` | `<meta name="heybox-project" content="website">`、`heybox-version: 1.2.23` |
| 样式 | 16 个外链 CSS 分片，共 **577KB** | `research/fetch-css.mjs` |
| 组件库 | **Element Plus**（仅少量组件实际渲染） | `el-autocomplete`/`el-popper` 在 DOM 中 |
| 站点组件库 | 自有 `hb-cpt` / `hb-bbs-*` BEM 体系 | `.hb-cpt__bbs-list-content`、`.hb-bbs-link__header` |
| 首页规模 | ~1388 元素；图片 63、SVG 55、canvas/video/iframe 0 | `research/probe-cssom.mjs` |
| 站点 CSS 跨域 | **可读**（`crossorigin` + CORS） | `crossorigin=""` 的 link 正常生效；`sheet.cssRules` 16/16 无异常；`fetch()` 取回 507807 字节 |

### 导航 CTA 的双变体（关键细节）

```css
.nav          { --publish-bg: linear-gradient(46deg,#464b50,#14191e); --publish-color:#ffffff }
.nav--home    { --publish-bg:#ffffff;                                 --publish-color:#14191e }
```

两者恰好互为反转。深色主题必须把 `.nav` 变体也反转过来。

---

## 二、决定性实测：**两套设计令牌对渲染几乎完全无效**

站点 CSS 里有 695 个自定义属性，看起来像一套完整设计系统：

```
--hb-primary / --hb-white-100 / --hb-neutral-100..800
--hb-general-color-text-1..6 / stroke-0..3 / bg-0..6 / plain / primary
```

**但它们在渲染上不起作用。**

### 实验 1：override 全部 `--hb-*` 为刺眼红色

先自检 override 确实生效，再看是否有元素变色：

```
自检:   --hb-neutral-800 = rgb(255,0,0)   ✅ override 生效
        --hb-white-100    = rgb(255,0,0)   ✅
        --hb-general-color-text-2 = rgb(255,0,0) ✅
结果:   变红的元素数 = 0        ❌ 页面毫无变化
```

### 实验 2：override 全部 `--el-*` 为红色

```
自检:   --el-bg-color = rgb(255,0,0)       ⚠️ 这个自检本身是无效的（见下）
结果:   变红的元素数 = 0
```

> **更正（重要）**：这条实验的注入方式与实验 1 最初那次犯了同样的错误 —— 样式在
> document-start 插入，站点 `<link>` 样式表随后加载，**同优先级的 `:root` 覆盖输了级联**，
> 所以"没变红"并不能证明 `--el-*` 失效。
>
> 反证：站点搜索框 `div.el-input__wrapper` 在深色下渲染为 `rgb(27,31,36)`，
> 正是例外层里 `--el-bg-color: #1b1f24` 的值 —— 说明 **Element Plus 令牌对已渲染的
> EP 组件是生效的**。`--el-*` 有 2941 处引用，但只有少数组件真正出现在页面上，
> 所以它在首页观感上权重不大，却并非"死"的。实验 1 的 `--hb-*` 结论不受影响：
> 那是用 `!important` + 末位插入重做过的，自检确认生效，且 0 元素变色。

### 交叉验证：令牌在哪被引用

| 令牌层 | 被 `var()` 引用次数 | 说明 |
|---|---|---|
| `--hb-general-color-*`（语义层） | **0** | 全 577KB CSS 中零引用 |
| `--hb-neutral-*` / `--hb-white-100` 等原子 | 75（全部在自己的定义里） | 只服务语义层，语义层又没人用 |
| `--el-*` | 2941 | 绝大多数属于**未渲染**的 EP 组件 |
| `--nav-*` | 有真实引用 | 少数例外，导航确实消费 |

> **根因**：站点把设计令牌定义出来了，但业务样式基本没用它们。令牌层是"死"的。

---

## 三、真正决定外观的是什么

对详情页做 CSS 语法审计（`research/probe-anatomy.mjs`）：

| 指标 | 数量 |
|---|---|
| 规则总数 | 5502 |
| **用字面量颜色（hex / rgb）的规则** | **546** |
| **作用于伪元素的规则（`::before`/`::after`/`::placeholder`）** | **426** |
| 含渐变的规则 | 59 |
| 含 `url()` 背景的规则 | 63 |
| 含 `box-shadow` 的规则 | 117 |

硬编码颜色用量 TOP：`#14191e`×214、`#fff`×192、`#a8abb2`×81、`#8c9196`×47、
`#e4e7ed`×47、`#909399`×46、`#606266`×43、`#dcdfe6`×40、`#f5f7fa`×34 …

还有少量 **JS 写入的内联样式**（约 20 个元素），值取自与令牌同名的 JS 调色板常量
（`rgb(100,105,110)`、`rgb(243,244,245)`、`rgba(0,75,150,.1)`）。

---

## 四、当前实现（`src/dark-remap.ts`）为什么效果不理想

当前架构是「令牌覆盖 + 逐元素扫描并写内联 `!important`」。对照证据逐条看：

| # | 问题 | 证据 |
|---|---|---|
| 1 | **令牌层是空转**。`src/dark-mode.css` 前 123 行覆盖 `--hb-*`、`--el-*`，对渲染零影响 | 实验 1、2：改红后 0 个元素变色 |
| 2 | **伪元素在物理上无法覆盖**。全站 426 条规则作用于 `::before`/`::after`，内联样式够不到伪元素 | 伪元素规则数 426 |
| 3 | **`:hover`/`:focus`/`:active` 态同样覆盖不到**。内联样式只能表达元素当前态 | 内联样式的表达能力上限 |
| 4 | **性能模型差**。每次扫描对全部 ~1345 个元素调 `getComputedStyle`（`readAll()`），而 SPA 实时流会持续触发重扫（`scheduleScan` + `[500,1200,2800,5000]` 定时 + mutation + scroll） | `dark-remap.ts:188-212, 340-394` |
| 5 | **与框架互搏**。站点重写 `style` 会冲掉内联声明，于是需要 `data-hb*` 标记 + 反复重扫 + 归属校验来打补丁 | `dark-remap.ts:236-254, 349-378` |
| 6 | **判不了渐变/遮罩/阴影**。`remapGradient` 用正则改渐变文本，且只对面积 >1200 的元素生效 | `dark-remap.ts:141-162, 283-286` |

换句话说：**约 85% 的工作量花在一个结构性做不到的机制上**，而真正有效的令牌层是空的。

---

## 五、正确的架构：把站点 CSS 当数据，按角色重映射

### 核心洞见

> CSS 规则天然作用于**当前和未来所有 DOM 节点**，包括伪元素、各种交互态、媒体查询。
> 所以深色模式应该**一次性改写 CSS 规则**，而不是**反复改写 DOM 元素**。

而且站点 CSS **跨域可读**，这条路才可行 —— 这是本项目最大的技术红利。

### 三层结构

```
┌─ 第 1 层：基础层（静态）
│    color-scheme: dark、页面底色、滚动条、EP 暗色令牌
│    作用：消除首屏白闪，兜住表单控件/原生控件
│
├─ 第 2 层：规则重映射引擎（自动，核心）
│    枚举 document.styleSheets → 对每条规则、每条声明：
│      · 按属性名判定颜色"角色"（表面 / 文字 / 边框 / 阴影 / 自定义属性）
│      · 把字面量颜色按角色映射为深色等价
│      · 生成同选择器、同优先级、同媒体条件、排在最末的覆盖样式表
│    覆盖：伪元素、hover 态、@media、@keyframes（就地改写）
│    开销：一次遍历 CSS 规则，零元素级开销
│
└─ 第 3 层：例外层（人工，刻意保持很小）
     通用引擎原理上判不了的情况：站点用「深底浅字」表达强调（实心 CTA），
     深色主题里应改为「浅底深字」，但引擎无法区分它是刻意反转填充、
     还是压在图片上的角标遮罩（后者不该反转）。
     实测全站这类失效点只有导航登录/发布按钮一处。
```

### 颜色映射的角色规则

单调性是关键 —— 不能简单取反，否则会丢掉层级关系：

- **表面**（背景）：中性色保持「越亮越浮起」的顺序，压进深色带 `L∈[5.8%,14.5%]`；
  亮彩块（淡色标签）→ 同色相深色块，配浅字；品牌主色保留。
- **文字**：中性色映射到浅色带且单调（`L=0→245`，`L≥190` 保留）；
  彩色文字够亮就保留，太暗则提亮到 `L≥0.62`。纯白保留（它本来就在深/彩底上）。
- **边框**：浅边框 → 半透明白（越浅越弱），深边框保留。
- **阴影**：不动（深底上深阴影无害）。
- **自定义属性**：先按名字片段整体匹配判角色
  （`(^|-)(text|color|fg|…)($|-)`），名字无信息时按明度推断。
- **绝不碰 `url()`**，所以照片、头像、二维码天然不受影响。

---

## 六、原型验证结果

引擎原型：`research/hb-dark-engine.js`（可直接移植为 userscript 主体）。
运行：`node research/proto-run.mjs`，产出 `output/proto/*.png`。

| 页面 | 浅色表面（面积>40×20，亮度>200） | 低对比文本 | 构建耗时 | 扫描规则 | 改动规则 | 生成 CSS | 报错 |
|---|---|---|---|---|---|---|---|
| 首页 改前 | 26 | 144 | — | — | — | — | — |
| 首页 **改后** | **0** | **1** | **44ms** | 4739 | 296 | 34.9KB | 0 |
| 详情 改前 | 14 | 29 | — | — | — | — | — |
| 详情 **改后** | **0** | **1** | **48ms** | 5501 | 419 | 51.6KB | 0 |

（"低对比 1" 是我诊断脚本没解析 `background-image` 的假阳性，实际为 0。）

肉眼复核 `output/proto/home-light.png` 与 `home-dark.png`：

- 卡片、导航、搜索框、页脚层级正确，卡片比页面底更亮，浮起关系保留
- 登录按钮已正确反转为「浅底深字」
- **照片完全未被改动**（与浅色版逐像素级一致），这是相对 `filter: invert` 方案的决定性优势
- 等级标签、社区图标、Emoji、二维码全部正常

---

## 七、落地结果

| 步骤 | 动作 | 状态 |
|---|---|---|
| 1 | 引擎移植为 `src/dark-engine.ts`（分层：就地改写站点声明 + 例外层 + 关键帧/内联样式） | ✅ |
| 2 | **删除 `src/dark-remap.ts`**（412 行逐元素扫描器），其有效思想（亮度映射的单调性）已并入引擎 | ✅ |
| 3 | **删除 `src/dark-mode.css`**（123 行无效的 `--hb-*`/`--el-*` 覆盖），新建 `src/dark-base.css` 只留基础层 | ✅ |
| 4 | `src/dark-mode.ts` 改为协调「类名 + 基础层 + 引擎启停」，保留 `localStorage` 偏好与系统默认值 | ✅ |
| 5 | `src/main.ts` 挂载切换按钮（Shadow DOM 隔离，`data-hb-own` 让引擎跳过），并暴露验收钩子 | ✅ |
| 6 | SPA 换路由新增 CSS 分片 → 监听 `<head>` 增量重建 | ✅ |
| 7 | 建立验收循环：`verify`（真实页面）/ `verify:idempotent` / `verify:cascade` / `verify:ui` / `verify:lifecycle` / `verify:preview`，全部挂在 `verify:all` | ✅ |
| 8 | `vite.config.ts` 版本 0.3.0，去掉不再需要的 `GM_addStyle` 授权 | ✅ |
| 9 | **移除 React**：切换按钮改为原生 DOM（`src/ui.ts` + `src/ui.css`），产物 585.7KB → 26.3KB | ✅ |

### 验收结果（`node scripts/verify-dark.mjs`，加载 dist 产物）

| 页面 | 指标 | 深色 | 关闭后 | 再开启 |
|---|---|---|---|---|
| 首页 `/app/bbs/home` | 浅色表面 | **0** | 30 | **0** |
| | 低对比文本 | **0** | 8 | **0** |
| | 泥泞中间调 | **0** | — | **0** |
| | 扫描规则 / 改动规则 / 改动声明 | 4739 / 296 / 421（6 关键帧） | — | — |
| 详情 `/app/bbs/link/189860812` | 浅色表面 | **0** | 14 | **0** |
| | 低对比文本 | **0** | 8 | **0** |
| | 泥泞中间调 | **0** | — | **0** |
| | 扫描规则 / 改动规则 / 改动声明 | 5501 / 419 / 585（11 关键帧） | — | — |

「改动规则」是 `stats.changed`（含至少一条被改声明的规则数），「改动声明」是
`stats.declarations`（被改写的声明总数，一条规则可含多条）—— 两者不是同一个量，
早期表格曾把后者写在「改动规则」标签下，已更正。

这三个计数的口径是**引擎当前持有的改动量**，不是「本次构建新写入的次数」。
这不是措辞问题：一次页面加载里会有多轮构建（首屏里程碑 + 换路由新增分片），
若只计新写入，采样点一旦落在增量重建之后就只会读到 14 而不是 421，指标失去可比性 ——
所以重建时「已由引擎写入、本次重算后值不变」的声明必须计入。
`stats.tracked` 是另一类信息：仍被跟踪以便还原的规则声明块数量
（首页 397 / 详情 549），`verify:lifecycle` 场景三用它断言跟踪集不随换路由无界增长。

例外层体积 1106 字节（两页相同，是就地改写之外的唯一额外 CSS），构建耗时 ~45ms，页面报错 0。

`node scripts/verify-idempotent.mjs`：连续重建 6 次，渲染指纹与例外层字节完全不变
（6 轮 `9c77b285` / 1106）。注意指纹取自**线上真实 DOM 的颜色计算值**，
首页信息流每次加载的卡片数量不同，所以跨次运行的指纹值本身不构成基线 ——
有意义的是「同一次页面加载内、6 轮重建前后完全一致」。

> 幂等性不是可选项：关键帧与内联样式是**就地**改写的，站点样式表里存的就是我们写过的值。
> 引擎用 `orig` / `applied` 记账，始终从原值重算；否则边框会被逐轮衰减到 `rgba(255,255,255,0.06)`，
> 页面描边在几次重建后消失。这个缺陷在原型阶段被 `keyframes: 0` 这个异常指标暴露出来。

### 待办 / 已知取舍

- **详情页在无头浏览器下会撞验证码**（全屏遮罩），因此详情页的验收信号弱于首页；
  首页（用户指定的目标页）是完整验证的。
- **`.nav--home` 变体**（透明导航压封面图）：引擎会把它的白底按钮转成深底浅字，
  压在照片上对比可能偏低，需要接入真实封面图页面后决定是否加例外。
- **旧的一次性探测脚本已清理**（`verify-live.mjs`、`verify-interactive.mjs`、`inject-live.mjs`、
  `probe-identity.mjs`、`probe-stuck.mjs`、`chrome-headed.mjs`、`preview-test.mjs`、
  `audit-desktop.mjs`、`dump-*.mjs`）：它们 shim 已被移除的 `GM_addStyle`，
  并用旧类名 `heybox-dark` 判定深色，判定恒为「非深色」，报告必然失真。
  `baseline-live.mjs` **保留** —— 它不注入任何脚本，不受本次架构变更影响。
- ~~**产物 597KB** 主要来自 React（仅用于一个切换按钮）。~~ **已解决**：按钮改为原生 DOM 后
  产物 585.7KB → 26.3KB（gzip 8.3KB），详细测量见第十二节。

---

## 八、一次真实缺陷的复盘：满屏灰色色块

上线后用户反馈：首页搜索栏周边及其他位置出现**奇怪的灰色色块**，色值 `#37404A`。

### 定位

离线反查（`node research/trace-color.mjs 37404a`）指出唯一源色是 **`#f7f8f9`**，
即**站点的页面底色**；命中的规则里有：

```css
:root                                       { background-color:#f7f8f9 }
#page-bbs-community[data-v-a4016135]:before  { position:fixed;top:0;width:100%;height:146px;background-color:#f7f8f9;z-index:5 }
.hb-bbs-home .hb-bbs-home__splitline[data-v-a4016135]:after      { height:4px;background-color:#f7f8f9 }
.hb-bbs-home .hb-bbs-home__feed-splitline[data-v-a4016135]:after { height:4px;background-color:#f7f8f9 }
```

`#page-bbs-community::before` 是一条**整屏固定色带**（全宽 × 146px），
分隔条则是信息流卡片之间 4px 的"间隙"——它们在浅色下等于页面底，看起来就是留白；
深色下被映射成了偏蓝的中间调 `rgb(55,64,74)`，于是变成刺眼的灰色色块。

### 根因：中性/彩色判据用了 HSL 饱和度

`#f7f8f9` 与纯白只差 2 个色阶，但 HSL 饱和度的分母 `2-max-min` 在接近白色时趋近于 0，
把极微弱的色偏放大成 `s = 0.143`，越过了 `s > 0.12` 的阈值 → 被当成"彩色"，
走进了彩色表面分支，产出 `rgb(55,64,74)`。

改用**绝对彩度 + HSV 饱和度**双条件后，近白色天然判为中性：

```ts
function isNeutral(c) {
  const chroma = Math.max(c.r,c.g,c.b) - Math.min(c.r,c.g,c.b);
  if (chroma <= 10) return true;          // 绝对彩度极低
  return chroma / Math.max(c.r,c.g,c.b) <= 0.18;  // HSV 饱和度低
}
```

### 一并修正：页面画布色必须识别出来

即便判为中性，`#f7f8f9`（亮度 247.9）与卡片 `#fff`（255）在单调梯度上仍只差 2 个色阶，
深色下几乎无法区分，而画布又是 `#0e1116` —— 中间会出现断层。
所以引擎现在会**从 `:root` / `html` / `body` 的底色识别出"页面画布色"**，
让它（以及所有用同一颜色的分隔条、固定色带、卡片间隙）直接回到画布色。
若该颜色出现在 `:hover` / `.active` 等交互态上，则改映射到浮起表面 —— 那里它是"高亮填充"，
映射成画布会让高亮彻底消失。

表面梯度也改为带轻微冷调的两级锚点（画布 `#0e1116` → 卡片 `#262c33`），与站点品牌黑同族。

### 验收指标的盲区（同样要修）

最初的指标只统计「背景亮度 > 200 的浅色表面」。`rgb(55,64,74)` 亮度只有 62.8，
**逃过了检测**；而它上面的文字是浅色，对比度也合格。于是缺陷在指标上完全隐形。

新增 **`muddy`（泥泞中间调）** 指标：深色主题只应存在两级表面
（画布亮度 ~15、卡片亮度 ~43），任何面积 ≥ 800px²、亮度落在 55~140、彩度 < 32
的背景都属异常。并**同时扫描 `::before` / `::after`** —— 站点的底纹大量藏在伪元素里，
只看元素节点会完全看不见它们（这正是上一版扫描器与上一版指标共同的盲区）。

修复后：`#37404a` 反查命中 0 条；四个整屏底色层的伪元素全部回到 `rgb(14,17,22)`；
`muddy = 0`（1440 / 1536 / 1728 / 1920 四个宽度均无异常色块）。

### 回归：画布色集合把自己的输出当输入（0.3.5 修复）

上一段结论只对**首轮构建**成立，这里更正。

用户从 DevTools 报来 `#page-bbs-community[data-v-a4016135]::before` 的计算值：

```css
#page-bbs-community[data-v-a4016135]::before {   /* 整屏固定色带，全宽 ×146px */
  position: fixed; top: 0px; width: 100%; height: 146px;
  background-color: rgb(38, 44, 51);             /* ← 卡片色，应为画布色 */
  z-index: 5;
}
```

取证三件套：

1. **历史记录里就是错的** —— `output/verify/verify-result.json` 的 `fixedLayers` 一直是
   `rgb(38, 44, 51)`（当时的 `pass` 只记录、不断言这四个值，缺陷因此长期隐形）。
2. **像素级定位** —— 对 `output/verify/home-dark.png` 逐像素取样：`x < 204` 的顶部是
   `rgb(14,17,22)`，`x ≥ 204` 的顶部 146px 是 `rgb(38,44,51)`。204 正是
   `(1440-1032)/2` —— 固定定位的伪元素没有 `left`，静态位置落在 `#page-bbs-community`
   的左边缘、宽度仍是 100% 视口，于是这条色带**右移 204px**。浅色下它就是页面底
   `#f7f8f9`，右移看不出来；深色下被映射成卡片色，接缝就露出来了。
3. **逐轮复现** —— `node research/repro-canvas-flip.mjs`（离线、站点真实 CSS）：

```
（0.3.4 产物）首轮构建   四层全部 rgb(14, 17, 22)   ← 正确
              重建之后   四层全部 rgb(38, 44, 51)   ← 翻车
```

**根因**：`walk()` 登记「页面画布色」时读的是声明的**当前值**。
`:root{background-color:#f7f8f9}` 这一条本身也在被改写，第 2 轮构建时它已经是我们
上一轮写进去的 `rgb(14,17,22)` —— 画布色集合因此从 `#f7f8f9` 变成 `#0e1116`，
此后凡是「等于页面底色」的整屏层都掉进通用中性表面分支，拿到卡片色。
一次构建正确、再构建就错，而构建次数由站点加载节奏决定（首屏里程碑 4 次 + 生命周期事件
+ `<head>` 新增分片），所以这个缺陷**不是每轮都出现，而是稳定地出现在最终态**。

**修复**：新增 `sourceValue()` —— 凡是从站点样式反推结论的地方，都先经
`orig` / `applied` 记账还原出站点原值，再把结论喂给映射。

**为什么既有指标全都没拦住它**：

| 指标 | 为什么放过 |
|---|---|
| `lightSurfaces` | 卡片色亮度 43，够暗 |
| `muddy` | 判据是亮度 55~140，卡片色 43.2 **刚好在门槛之下** |
| `verify:idempotent` | 指纹只拼元素节点，而整屏底色层全在伪元素上；且 6 轮都是「翻车后」的稳定态，自比自当然一致 |
| `verify:dark` 的 `fixedLayers` | 只记录、不参与 `pass` |
| 采样时机 | 指标只采一次（加载后 7s），此时多轮构建早已跑完 |

**回归**（三处，各自覆盖一个盲区）：

- `node research/repro-canvas-flip.mjs` —— 离线复现「首轮 == 重建」，
  并带**阴性对照**：把引擎换回读当前值的实现，要求判据必须检出差异（否则断言是空跑）。
- `npm run verify` —— 新增 `canvasLayers` 断言：四层必须全部命中、全部等于画布色，
  且**强制重建之后仍然相等**（首页期望 4 层，详情页期望 0 层 —— 避免空集恒真的空跑）。
- `npm run verify:idempotent` —— 指纹纳入四个伪元素底色层，
  并新增「关掉再打开（首轮）== 强制重建」判据。

---

## 九、第二次缺陷复盘：图片占位块变成「大灰板」

用户反馈详情页某层楼被选中时"完全遮挡内容"，并给了截图。

### 取证路径（全部是测量，不是猜测）

1. **对截图做颜色直方图**：那块板是 **100% 单一颜色 `rgb(34,40,46)`，零个异色像素** ——
   没有转圈、没有文字、没有头像。所以不是 loading 幕（那是 `#fff` → `rgb(38,44,51)`），
   也不是"文字变色"。
2. **反推源色**：引擎的中性表面是 `lerp(CANVAS(14,17,22), CARD(38,44,51), t)`，
   由 r 通道反解 `t=0.833` → 源亮度 243.3 → 只有 `#f3f4f5` / `#f4f4f5` 符合。
3. **对几何**：板的 bbox 是 **1256×460（方角）**。而 `1256 ÷ 2 = 628`，`628/460 = 1.365`。
   站点图片容器是 `.hb-cpt__image { aspect-ratio: 4/3 }` —— **正是两张并排的 4:3 图片占位块**。
4. **定位规则**：

```css
.hb-cpt__image { aspect-ratio: 4/3 }
.hb-cpt__image .hb-cpt__image--default { position:absolute; inset:0; background:#f3f4f5; opacity:1; z-index:1 }
.hb-cpt__image.show .hb-cpt__image--default { opacity:0 }   /* 图片加载完成后才隐藏 */
```

### 根因：线性表面梯度放大了「近白差异」

站点表面几乎全部聚集在近白区间（`#fff` / `#fafbfc` / `#f7f8f9` / `#f5f7fa` / `#f3f4f5` /
`#f1f2f3` 都在亮度 241~255）。而最初的实现把这个区间**线性**压进深色带，
于是这 5% 的源区间占用了输出区间的 17% —— 微小差异被放大：

| | 源色亮度 | 相对卡片的亮度差 |
|---|---|---|
| 浅色模式 | `#f3f4f5`=243.9 vs `#fff`=255 | **4.4%**（几乎看不见） |
| 线性映射后 | rgb(34,40,46)=38.3 vs rgb(38,44,51)=43.3 | **9.8%**（放大 2.2 倍，成板） |

在浅色下这只是一层"图片还没加载"的淡色；深色下它被放大成一块边界分明的板，
看起来就像内容被遮住了。

### 修复：缓出曲线

```ts
// t0 = (L - 185) / 70
function surfaceCurve(t0) { const i = 1 - clamp(t0, 0, 1); return 1 - i * i; }
```

近白区间收敛到卡片色，中低亮度仍保留可分辨的"下沉表面"。
`node research/surface-ramp.mjs` 把这套调色板的保真度做成了可审计的表：

| 源色 | 线性→差异 | 缓出→差异 | 相对浅色模式 |
|---|---|---|---|
| `#fafbfc` | 3.6% | **0.2%** | 0.13× |
| `#f7f8f9` | 6.3% | **0.6%** | 0.23× |
| `#f3f4f5`（图片占位） | **9.8%** | **1.6%** | 0.36× |
| `#f1f2f3` | 11.5% | **2.2%** | 0.42× |
| `#dadde0` | 30.2% | 14.8% | 1.10× |
| `#c8cdd2` | 44.4% | 32.2% | 1.62× |

近白（卡片族）全部 ≤0.42×；中低亮度（禁用输入框、标签等真正需要区分"下沉"的底色）
仍保持可分辨。

### 验证

`node research/repro-placeholder.mjs` —— 用站点真实 CSS 渲染「卡片 + 两列 4:3 图片网格 +
未加载占位块」，在本地 HTTP 下（**必须用 HTTP**：`file://` 页面下同目录的 `file://`
样式表会被 Chrome 视为跨域，`cssRules` 抛异常，引擎会整批跳过站点 CSS，测不出真实行为）：

```
图片占位块尺寸: {"grid":"1224x459","tile":"612x459","宽高比":"1.333"}   ← 与用户截图吻合
浅色: 卡片 rgb(255,255,255)  占位块 rgb(243,244,245)   差异 4.4%
深色: 卡片 rgb(38,44,51)     占位块 rgb(37,43,50)      差异 2.3%
放大倍数: 0.53x  ->  PASS ✅（比浅色模式还更不显眼）
```

### 说明与边界

- 占位块**盖住图片区域本身是该站的设计**（图片加载完成前用不透明占位块，加载后
  `.show` 让占位块 `opacity:0`）。修复解决的是"它在深色下变成一块突兀的灰板"，
  让它回到与浅色模式相当的"淡淡的未加载态"。
- 如果图片确实加载失败，占位块会一直留着 —— 那属于站点/网络问题，不是主题问题。

---

## 十、第三次缺陷复盘：hover 时整层楼被不透明板盖住

用户反馈：**只有鼠标移上去**，那层楼的内容才被覆盖。

### 定位

1. 用用户给的精确 outerHTML，在本地 HTTP 下加载**站点真实 CSS** 复现该楼层 ——
   静态渲染完全正常。
2. 模拟 hover 后读 `::before`：站点规则是 `background-color:rgba(20,25,30,.016)`，
   我的引擎并未改写它（1.6% 透明）。**像素差最大仅 12/765**，内容清晰。
3. 于是列出评论区**所有 hover 规则**，盯上这一对（同在 `index-ChemEL1Y.css`）：

```css
.link-comment__comment-item + .link-comment__comment-item:before { background-color:#f3f4f5 }   /* 1px 分隔线 */
.link-comment__comment-item:hover:before { background-color:rgba(20,25,30,.016);
                                           width:100%; height:100%; z-index:300; pointer-events:none }
```

**两条规则优先级完全相同（都是 (0,2,1)），靠先后顺序决定胜负。**

### 根因：覆盖表打乱了站点的层叠顺序

旧实现把改写结果汇总成一张覆盖表，**挂在 `<body>` 末尾** —— 排在站点所有样式表之后。
于是层叠变成：

```
[站点 · 分隔线规则]  <  [站点 · hover 规则]  <  [我的覆盖 · 不透明深色]
```

同优先级下**最后一条赢**，我的覆盖把 hover 覆盖层的背景色换成了不透明色，
而 `width:100%/height:100%/z-index:300` 仍来自站点规则 ——
**鼠标一移上去，整层楼被一块不透明板盖住**。

这也解释了前两次复盘的色值：用户截图里的 `#22282e`（rgb 34,40,46）正是**旧版线性梯度**
下 `#f3f4f5` 的映射值。我上一轮把它误判成图片占位块 —— 两者恰好用同一个源色。

顺带说明：**为什么本地复现没暴露它** —— 我最初只放了一条评论，`+` 兄弟选择器不匹配，
压根没有生成那条覆盖，bug 自然测不到。**回归测试必须放两条评论。**

### 修复：就地改写站点声明，而不是生成覆盖表

实测跨域（CORS）样式表**可写**：用「异源 + `Access-Control-Allow-Origin: *`」验证
`readable: true, writable: true`，写入生效。于是改为直接
`CSSStyleDeclaration.setProperty()` 就地改写：

- 层叠顺序、`@media`/`@supports` 条件块、规则位置**全部原样保留**；
- 不产生重复 CSS（覆盖表 34.5KB → 1.1KB 的例外层）；
- **绝不擅自追加 `!important`** —— 只原样保留原有优先级。
  （测试中我图省事加过一次 `!important`，结果同样击穿了 hover 规则，再次印证优先级就是关键。）

同时按「原值 / 我们写入的值」记账保证幂等，并支持精确还原。

### 验证

`node research/test-hover-cascade.mjs`（**两条**评论 + 站点真实 CSS）：

```
非 hover：第二条评论 ::before = rgb(37,43,50)         1px      -> 分隔线改写生效 ✅
hover   ：第二条评论 ::before = rgba(20,25,30,0.016)  1224x204 z-index:300
                              -> 覆盖层仍是站点原本的半透明值 ✅
hover 前后像素差：最大通道差 4/255、平均 1.181、100% 像素有变化 -> 内容未被盖住 ✅
阴性对照：人为在 <body> 末尾追加同优先级覆盖规则后，覆盖层变成 rgb(38,44,51)，
          最大通道差跳到 217/255 -> 像素判据确实能检出该缺陷 ✅
```

回归：验收（首页/详情 浅色表面 0、低对比 0、泥泞中间调 0）+ 幂等性（6 轮指纹一致）
全部通过；`stats.declarations` 是就地改写的声明数（首页 421 / 详情 585），
`stats.changed` 是其所属的规则数（296 / 419）。

---

## 十一、复现方式

```bash
# 构建 + 验收（推荐）
npm run verify:all   # = build + verify:ui + verify:lifecycle + verify:preview
                     #   + verify + verify:idempotent + verify:cascade

# 单独运行
npm run build
npm run verify              # 真实页面量化 + 出图 -> output/verify/
npm run verify:ui           # ★ 切换按钮回归（本地 HTTP，45 项断言）
npm run verify:lifecycle    # ★ 启动竞态 / 内联写循环 / 跟踪集 / url() 保护（16 项断言）
npm run verify:preview      # ★ 预览壳 index.html 双向切换（8 项断言）
npm run verify:idempotent   # 反复重建的幂等性回归
npm run verify:cascade      # ★ hover 层叠顺序回归（必须两条评论 + 阴性对照）

# 研究用脚本（结论的证据来源）
node research/fetch-css.mjs            # 拉取站点 16 个 CSS 分片 -> research/css/
node research/analyze-css.mjs          # 令牌清单 / 暗色信号 / 字面量统计
node research/token-usage.mjs          # 令牌角色审计
node research/probe-cssom.mjs          # 跨域可读性 + 内联样式 + 资源规模
node research/probe-token-applied.mjs  # ★ 令牌是否被消费（自检 + 红化实验）
node research/probe-anatomy.mjs        # 伪元素/渐变/阴影规模 + EP 令牌自检
node research/probe-cta.mjs            # 反转配对失效诊断 -> research/cta-report.json
node research/probe-blocks.mjs         # 按坐标定位异常色块（elementFromPoint 元素链）
node research/probe-slabs.mjs 1728     # 各宽度枚举大块背景 + 搜索区专项（可传宽度）
node research/trace-color.mjs 37404a   # 离线反查：哪个源色/规则产出目标颜色
node research/surface-ramp.mjs         # 表面调色板映射保真度审计
node research/repro-placeholder.mjs    # 图片占位块可见度复现（本地 HTTP + 站点真实 CSS）
node research/repro-canvas-flip.mjs    # ★ 整屏底色层「首轮 == 重建」复现（离线 + 阴性对照）
node research/repro-floor.mjs          # 用真实楼层 HTML 复现（生成 floor-snippet.html）
node research/repro-stack.mjs          # elementsFromPoint 元素栈（谁压在文字上）
node research/test-cssom-write.mjs     # 跨域样式表可写性验证（异源 + ACAO）
node research/dump-runtime-css.mjs     # 抓运行时 CSS（含 JS 注入的 <style>）
node research/proto-run.mjs            # 原型出图 + 量化 -> output/proto/
```

---

## 十二、移除 React：一个按钮不该背 95.6% 的体积

### 测量（移除前）

产物 `dist/xiaoheihe-dark-mode.user.js` 共 587,051 字符，按行切分归属：

| 区段 | 字符数 | 占比 |
|---|---|---|
| userscript 头 + React + react-dom | 561,710 | **95.7%** |
| 应用代码（引擎 + 状态 + UI） | 25,341 | 4.3% |

其中 React 部分从正文第一行一直到 `require_client`（第 11373 行）都是 `react` / `react-dom/client`
的生产包。**这个包只用来渲染右下角一个按钮**：一个 `<button>`、一个 `<svg>`、一个 click 回调。

### 一个顺带发现：产物是未被压缩的

`vite-plugin-monkey` 的默认值是 `build.minify ?? false`（`dist/node/index.mjs:826`），
所以产物里的 react-dom 是**可读的多行**形式（平均行长 47 字符、最长 2043 字符），
而不是压缩后的长行。也就是说 585.7KB 是"未压缩"的体积，这是该插件的有意选择
（便于审查 userscript），不是配置事故。

### 替换做法

| 关注点 | React 版本 | 原生版本 |
|---|---|---|
| 渲染 | `createRoot().render(<App/>)` | `createElement` + `replaceChildren` |
| 状态 | `useState` | 状态只有一份，存在 `applyDark()` 里 |
| 状态同步 | React 内部 state | `onDarkChange()` 订阅（新增约 15 行） |
| 图标 | JSX `<svg>` | `createElementNS` 拼 SVG |
| 样式 | JS 模板字符串里的 `uiCss` | `src/ui.css`（经 `?inline` 导入，可被 CSS 压缩） |

两点值得记下：

1. **状态只留一份。** React 版把状态复制进了组件（`useState(() => isDarkEnabled())`），
   于是"图标"和"真实是否深色"是两个可能不同步的东西 —— 在控制台调 `__hbSetDark(true)`
   之后按钮图标就不会跟着变。改成 `onDarkChange` 订阅后，任何入口改状态都会通知到 UI。
2. **图标不能用 `innerHTML` 拼。** 宿主站点若启用 Trusted Types，`innerHTML` 会被 CSP 直接拒绝；
   `createElementNS` 没有这个风险。

### 结果

```
移除前  585.7 KB（React 占 95.7%），未压缩
移除后   26.3 KB，gzip 8.3 KB          —— 体积 -95.5%，gzip 约 -93%
```

产物中 `react` / `createRoot` / `useState` / `fiber` / `scheduler` 的出现次数均为 **0**。
依赖从 5 个降到 3 个（`typescript`、`vite`、`vite-plugin-monkey`），运行时依赖归零。

### 回归

深色效果与体积无关，因此三项既有验收必须全部保持通过 —— 实测均通过：

| 验收 | 结果 |
|---|---|
| `npm run verify`（真实首页 / 详情页） | 两页 PASS，浅色表面 0 / 低对比 0 / 泥泞 0，报错 0 |
| `npm run verify:idempotent` | 6 轮重建指纹与例外层字节不变 |
| `npm run verify:cascade` | 分隔线 `rgb(37,43,50)`、hover 覆盖层仍为 `rgba(20,25,30,0.016)` |
| `npm run verify:ui`（新增，45 项断言） | 全通过 |

新增的 `scripts/verify-ui.mjs` 用**本地 HTTP + 真实鼠标点击**覆盖按钮的全部行为：
宿主挂载与 `data-hb-own`、Shadow DOM 隔离（含"shadow 内的 `<style>` 不在
`document.styleSheets` 里，所以引擎碰不到它"）、初始态跟随系统 / 记忆优先、点击后
类名+基础层+localStorage+图标+aria 同步、再次点击完整还原、控制台入口同步图标、刷新后记忆生效。

> 这里必须用本地 HTTP 而不是 `file://` 或 `setContent`：`file://` 下同目录样式表在 Chrome 里
> 算跨域，`cssRules` 抛异常，引擎会整片跳过；`about:blank` 下 `localStorage` 又不可靠。
> 还有一个容易空跑的前提：深色偏好必须在脚本执行**之前**写进 `localStorage`，
> 否则引擎默认关闭，断言会因为「页面本来就是浅色」而全部通过。

---

## 十三、代码审查发现与修复

对全量源码做了一次审查（仓库没有 `AGENTS.md` / `docs/` / CI，故退回通用工程原则）。
八个真实缺陷，全部修复并有对应回归：

| # | 缺陷 | 证据 | 修复 | 回归 |
|---|---|---|---|---|
| 1 | `startSheetObserver` 在 `<head>` 尚未解析出来时直接返回，且无重试 —— 此后 SPA 换路由新增的 CSS 分片永不触发重建，整个会话漏样式 | 分块响应（先 `<html>`，150ms 后 `<head>`）复现：晚注入样式表保持 `rgb(255,255,255)`；同一页面整份送达时正常重映射 | 加 `headProbe`，等 `<head>` 出现后补装观察器 | `verify:lifecycle` 场景一 |
| 2 | `COLOR_TOKEN` 的裸颜色名会命中 `url()` 路径（`icon_white.png`）与 SVG 引用（`url(#fade)`），破坏资源地址；模块注释却声称已避开 `url()` | 语料里 `url()` 含颜色词 1 处（`...-Black.ttf`），因落在 `@font-face` 的 `src`（非颜色属性）而未爆 | 替换前先摘出 `url(...)` 片段，替换完逐字节放回 | `verify:lifecycle` 场景四 |
| 3 | `EngineStats.emitted` 注释为「生成的覆盖规则数」，但就地改写后不再生成任何规则 | 字段实际值是声明数（421/585），与 `changed`（296/419）不同；FINDINGS 三处标签互相矛盾 | 改名 `declarations`，`changed`/`declarations` 分别注明规则数与声明数 | `verify:idempotent` 输出两值 |
| 4 | `mutations` 注释为「最近若干条」，实为首轮前 60 条且 `collect()` 从不清空 —— 首轮之后的重建在调试接口里完全不可见 | 代码路径：`if (mutations.length < 60)` 只增不减 | `collect()` 里清空，语义变为「最近一次构建」 | — |
| 5 | 三处改写点用 `next === source` 作判据，在「值已是我们写的那个」时判定为需写入，重复写同一个值（实测 45 次写入中 26 次冗余）；内联写入会触发 `style` 属性变更记录，是否演变成 80ms 常驻写循环取决于浏览器特定行为 | 空闲 3 秒实测 0 次写入（Chromium 不派发相同值变更）—— 当前安全但依赖未定义行为 | 判据改为 `next === current` | `verify:lifecycle` 场景二 |
| 6 | `ruleStyles` 只增不减，被迫强引用已卸载的样式表 | 实测确认：`<style>` 被 `remove()` 后 Chrome 把该表 `ownerNode` 置为 `null`（`ownerNode && !isConnected` 的判据永不触发） | 每次重建剪除已脱离文档的表；`ownerNode === null` 时排除 `adoptedStyleSheets` 以免误剪 | `verify:lifecycle` 场景三 |
| 7 | `index.html` 预览壳：调用已不存在的 `__hbRefresh`；用旧类名 `heybox-dark` 判状态，导致自己的按钮**只能单向打开**、回不到浅色；用 `data-hb-skip` 标记自身，而引擎认的是 `data-hb-own`，排除机制未生效 | 浏览器实测：修复前按钮恒 `setTheme(true)` | 用 `__hbIsDark()` 读状态、`style[data-hb-own]` 排除、删死钩子 | `verify:preview`（8 项） |
| 8 | `test-hover-cascade.mjs` 声明了「hover 前后像素差必须很小」但**未实现**（两张截图从未比对）；分隔线断言只检查「不等于 `#f3f4f5`」，映射成白色也会通过 | 逐行阅读 | 落地像素比对（解码交给浏览器 canvas，不引入 PNG 解码器）+ **阴性对照**（人为复现末尾覆盖表，要求判据必须超标）；分隔线改为断言亮度 < 90 | `verify:cascade` |

另外清理了 10 个**已不可能工作**的脚本：它们 shim 已被移除的 `GM_addStyle`，
并用旧类名 `heybox-dark` 判定深色，判定恒为「非深色」却仍输出报告。
`baseline-live.mjs` 保留 —— 它不注入任何脚本，不受架构变更影响。

`src/` 里 6 处把设计会话历史写进代码的注释（「最初的实现……」「早先写成……」「改用……」）
按散文标准重述为现在时的约束与反事实，事故经过仍由第八至十节单独承载。

> 一条被撤销的怀疑：`enableDarkEngine` 会无条件添加/移除 `<html>` 上的 `dark` 类。
> 精确检索站点 JS 后确认站点既不管 `dark` 类也不管 `data-theme`（命中数全为 0），
> 且全站只有 2 条 `.dark` 规则（EP 颜色选择器），因此**没有现冲突**，未作修改。


