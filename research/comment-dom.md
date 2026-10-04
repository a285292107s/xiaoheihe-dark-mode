# 小黑盒详情页 · 评论区 / 楼中楼 DOM 结构文档

> 用途：后续把楼中楼重构成卡片、或给评论行加自定义 UI 时，这份文档是锚点与风险的依据。
> 只描述 **DOM 结构**，不改动任何 `src/` 代码。

## 0. 数据来源与置信度约定

| 来源 | 路径 | 说明 |
| --- | --- | --- |
| **A（主）** | `fixtures/detail.html` | 已渲染完成的详情页快照。3 条一级评论 + 6 条楼中楼，深色模式已注入 |
| **B（补）** | `fixtures/detail-full.html` | **另一篇文章**（评论 id 段完全不同）的快照。3 条一级 + 4 条楼中楼；<br>唯一提供「回复某人」与「作者」徽章的实例 |
| **C（代码）** | `research/js/index-CVVwhh7y.js` | 站点自己的 Vue 渲染函数（已压缩）。评论区分页、评论行、楼中楼三处 `<script setup>` 的真实源码 |
| **D（样式）** | `research/css-detail/index-ChemEL1Y.css`、`research/css/index-Cv4ia_mR.css`、`research/css-detail/index-D2QWFmGt.css` | 评论组件样式、emoji 雪碧图、slide-tab 样式 |
| **E（既有事实）** | `research/FINDINGS.md` 第十六节 | 事件监听器与点击热区，**不是我本轮新测的** |
| **F（真机 DOM·展开态）** | `research/live-comment-expanded.html` | 有头 Chrome + 真实登录态、页面 192688392，**点开全部「全部 N 条回复」之后**的 `.link-comment` 子树：19 条一级 + 42 条楼中楼 |
| **G（真机接口）** | `research/live-comment-tree.json` | 同一页 `/bbs/app/link/tree` 响应：20 主楼 + 11 楼中楼 + 完整元数据（含 DOM 里没有的 `user.avatar` / `replyuser`） |
| **H（真机 DOM·收起态）** | `research/live-comment.decoded.html` | 同一页未展开的 `.link-comment` 子树：3 主楼 + 5 楼中楼，含 `can-load` 与 `全部 N 条回复` |
| **I（真机回复框两态）** | `research/live-replybox.json` | 回复框「展开 / 收起」两态的完整 outerHTML + `getBoundingClientRect` |
| **J（真机交互快照）** | `research/live-reply-open.json` | `probe-reply-open.mjs` 的产出：初始 / 点楼中楼 / 点一级正文 / 输入后 四步快照 |

§13–§15 是**本轮新测**（基于上表 F–J 真机素材）；§0–§12 是首轮基于 fixture 与站点源码的分析。
F–J 由 Lead 用有头浏览器抓取并冻结，我负责离线核对与交叉验证，**没有重抓**。

本文每条断言后标注来源。标注规则：

- 直接引 `A`–`J` = 有据可查（fixture / 真机素材里 grep 得到，或站点源码里读得到）。
- **【待真机确认】** = 该形态在所有已知素材里都没有实例，只能从站点源码推断。

> **口径纠正（重要）：** 任务背景里写「44 条一级评论、6 条楼中楼」。实测：`44` 是 slide-tab 上的**评论总数**
> （`div.slide-tab__tab-cnt` 文本，见 §6.1），**不是** DOM 里的一级评论行数。
> `fixtures/detail.html` 的 `div.link-comment__comment-item` **只有 3 个**，
> `div.comment-children-item` **有 6 个**。计数方式：
> `([regex]::Matches($html,'class="link-comment__comment-item"')).Count` → 3。
> `detail-full.html` 同为 3 / 4。**一级评论是滚动加载的，快照只落到了前 3 条**（见 §6、§10.1）。

---

## 1. 评论区在页面里的位置

来源：A（`comment-probe-anatomy.mjs context`）。

```
#root > html > body > div > main
  > div.layout-normal#page-bbs-link          ← 详情页根容器（带 data-v-38787230）
    > div.content                             ← 文章列 + 右侧栏
      > div.list
        > div.hb-bbs-link
          > div.hb-cpt__scroll-list.hb-bbs-link__container   ← 整页滚动容器
            > div.hb-bbs-link__content
              > div.hb-bbs-post              ← 正文文章
              > div.link-comment             ← ★ 评论区根
            > div.hb-loading                 ← 站点全局 loading（display:none），不是楼中楼专用
            > div.hb-bbs-link__reply-target   ← 底部回复框
      > div.cpt-right-side.right             ← 右侧栏（相似内容推荐）
```

**要点**：`.link-comment` 是评论区唯一根，且是 `.hb-bbs-link__content` 的**直接子元素**，
与 `.hb-bbs-post` 平级。`div.scroll-list__to-login`（「扫码快捷登录」）**不在 `.link-comment` 里**，
它是 `#page-bbs-link > .content > .list` 这一层的兄弟（A）。

### `.link-comment` 内部（1 层）+ `.link-comment__list` 直接子节点

```
div.link-comment
  ├ div.comment__comment-header            ← 排序 tab 容器（CSS: position:sticky; top:52px; z-index:100）
  │   └ div.hb-cpt__pagination.hb-cpt__slide-tab.line.underline
  │       └ div.hb-cpt__pagination-outer
  │           └ div.hb-cpt__pagination-inner
  │               ├ button.slide-tab__tab-item.active
  │               │   ├ div.slide-tab__tab-label      #text "全部评论"
  │               │   └ div.slide-tab__tab-cnt        #text "44"
  │               └ div.slide-tab-tab__bar            style="width:56px;height:2px;left:0px"
  ├ div.link-comment__list
  │   ├ div.link-comment__comment-item[data-comment-id="954407691"]
  │   ├ div.link-comment__comment-item[data-comment-id="954409336"]
  │   ├ div.link-comment__comment-item[data-comment-id="954404073"]
  │   ├ #comment<!-- -->                   ← Vue v-if 空占位 ×3（哨兵/空状态/loading 分支）
  │   ├ #comment<!-- -->
  │   └ #comment<!-- -->
  └ （`.link-comment` 内没有回复框；回复框是它的祖先的兄弟节点）
```

---

## 2. 一级评论行完整 DOM 骨架

来源：A（`comment-probe-anatomy.mjs tree`，逐字还原）。取 id `954407691`：

```
div.link-comment__comment-item[data-comment-id="954407691"]
  div.link-comment__comment-item-header
    a[href="/app/user/profile/16441115"]            ← 无 class，头像链接
      div.hb-cpt-avatar.comment-item-header__avatar[style="--hb-avatar-size:34px;--hb-avatar-deraction-size:48px"]
        img.hb-avatar__image[src="https://cdn.max-c.com/heybox/avatar/wx/..."]  alt=""
        img.hb-avatar__avatar-decoration[data-hb-webp-fallback-bound="true"]
             [src=".../dailynews/img/830cb0f7321f9655de70caeb7fae0b1c.gif?..."]  alt=""   ← 头像框，v-if
    div.comment-item-header__info-box
      div.info-box__line-1
        a.info-box__username[href="/app/user/profile/16441115"]      #text "墨水心"
        #comment<!-- -->                          ← v-if is_link_owner 的「作者」位
        #comment<!-- -->                          ← v-if medal 位
        div.hb-level-tag.hb-level-28.info-box__level
          div.hb-level-tag__inner
            div.hb-level-tag__inner__text         #text " Lv.28"
            #comment<!-- -->
        #comment<!-- -->                          ← comment-schoolmate-tag 位
        div.comment-item-header__operation-box     ← ★ 脚本自己的按钮落点
          button.like-box
            i.hb-icon
              svg.hb-iconfont[aria-hidden="true"]
                use[xlink:href="#icon-bbs_thumbs-up_filled_24x24"]
            div.like-box__cnt                      #text "640"
      div.info-box__line-2
        div.info-box__create-time                  #text "4小时前"
        div.info-box__ip                           #text "·湖南"
  div.comment-item__content-container
    div.comment-item__content                      ← 正文，innerHTML 由 hb-content 指令写入
      span.hb-emoji.hb-emoji-cube.hb-emoji-cube_32[data-emoji="cube_笑cry"]   ← 0..n 个，夹在文本里
    #comment<!-- -->                               ← v-if imgs：.comment-item__image-box
    #comment<!-- -->                               ← v-if is_author_award：.comment-item__tag-line
    div.link-comment__comment-children.can-load    ← 楼中楼容器（v-if children.length>0）
      div.comment-children-item[data-comment-id="954415918"]  …（见 §3）
      div.comment-children-item[data-comment-id="954428716"]
      button.comment-children__load-all
        div.load-all__text                          #text "全部 7 条回复"（原始 HTML 是 全部&nbsp;7&nbsp;条回复）
        i.hb-icon
          svg.hb-iconfont[aria-hidden="true"]
            use[xlink:href="#icon-common_arrow_down_filled_24x24"]
```

**从站点源码确认的骨架（C）**：`comment-item` 渲染函数里，
`content-container` 的四个子节点顺序是**固定**的 ——
`comment-item__content` → `comment-item__image-box`(v-if imgs) → `comment-item__tag-line`(v-if is_author_award) → `楼中楼容器`(v-if children.length>0)。
即：**楼中楼容器永远在 `comment-item__content-container` 的最后一个子节点位**（C）。
`detail.html` 里三条评论的两个 `<!---->` 都空着，所以看到的就是「正文 + 容器」。

**只有当有楼中楼时 `.link-comment__comment-children` 才存在**（v-if）。3 条一级评论里有 3 个容器（A）。

---

## 3. 楼中楼行 `.comment-children-item` 的精确子节点顺序

来源：A + B。**每一条**都验过，6/6 + 4/4 结构一致。

### 3.1 精确顺序（含 Vue 空占位）

```
div.comment-children-item[data-comment-id="954415918"]
  ├ ① a.children-item__comment-creator[href="/app/user/profile/58453304"]   #text "暮辞熙、"
  ├ ② #comment<!-- -->            ← v-if is_link_owner：「作者」徽章位
  ├ ③ #comment<!-- -->            ← comment-schoolmate-tag 位
  ├ ④ span.children-item__reply-to                                          #text ":"
  ├ ⑤ p.children-item__comment-content                                      #text "够看了，上号"
  └ ⑥ span.children-item__other-info
        ├ span.children-item__create-time   #text "3小时前"
        └ span.children-item__ip            #text "·江苏"
```

**子节点数恒为 6**（含 2 个空注释）。`detail.html` 的 6 条楼中楼逐行对照（A）：

```
#1 id=954415918: a.children-item__comment-creator → #comment → #comment → span.children-item__reply-to → p.children-item__comment-content → span.children-item__other-info
#2 id=954428716: （同上）
#3 id=954417557: （同上）
#4 id=954419058: （同上）
#5 id=954408784: （同上）
#6 id=954410951: （同上）
```

② ③ 不为空时的真实形态（B，唯二实例）：

```html
<a href="/app/user/profile/13492791" class="children-item__comment-creator"
   data-hb-dark-fg="rgb(98, 163, 227)" style="color: rgb(98, 163, 227) !important;">びじん</a>
<span class="children-item__writer-tag"><span>作者</span></span>
<!---->
<span class="children-item__reply-to" …>:</span>
```

即 ① 之后紧跟 `.children-item__writer-tag > span`（文案「作者」），然后才是 ③ 的空占位和 ④。
`detail-full.html` 里 `children-item__writer-tag` 出现 2 次（B）。

### 3.2 楼中楼的「回复对象」到底在不在 DOM 里？

**结论：在，但只在「回复对象不是本楼楼主」时才出现；且是纯文本，没有 `<a>`、没有 data 属性。**

站点源码是唯一权威（C，`comment-item-chilren` 的 `ks = {class:"children-item__reply-to"}`）：

```js
c("span", ks, U($.replyuser && $.replyid !== e.root.commentid
    ? "回复 ".concat($.replyuser.username)   // ← 源码里是普通空格
    : "") + ":", 1)
```

> 注意：源码里写的是**普通空格**，但渲染出来的 HTML 里那个空格变成了 `&nbsp;`
> （`<span …>回复&nbsp;びじん:</span>`，B）—— 说明服务端给出的 `text` 本身带 `\u00a0`。
> 总之实际 DOM 里这一处的空格是 **U+00A0**，匹配时要归一化。

翻译成规则：

| 情形 | `.children-item__reply-to` 的文本 | 实例 |
| --- | --- | --- |
| `replyuser` 存在 **且** `replyid !== root.commentid`（回复了楼中楼里的另一个人） | `"回复 " + replyuser.username + ":"`（真实 DOM 里是 `回复\u00a0びじん:`，`\u00a0` 由 `&nbsp;` 解码而来） | **B**：`<span class="children-item__reply-to">回复&nbsp;びじん:</span>` |
| 其余全部情况（直接回复楼主，或该字段缺失） | 仅 `":"` | A 的 6/6 条全是 `":"` |

**反例证据（这是本条结论的全部证据，不是推断）：**

1. **B 的实例证明「回复对象」确实是 DOM 文本**，不是站点别处表达 ——
   `<span class="children-item__reply-to" …>回复&nbsp;びじん:</span>`。
2. **该文本里没有任何 `<a>`**：整行 `findAll(row,'a')` 只返回 1 个 `<a>`，
   即 ① `.children-item__comment-creator`（A 的 6/6 都只有 1 个 `<a>`）。
   所以回复对象名字**不可点击、没有 href、拿不到 userid**，只有用户名文本。
3. **`@某人` 那种形式在楼中楼 DOM 里不存在**：所有 6 条楼中楼整行还原文本
   都没有 `@` 前缀，`children-item__comment-content` 也没有 `@` 开头（A，逐行验过）。
4. **渲染时机上会丢**：早于「查看更多回复」的接口返回，或缺少 `replyuser` 字段时，
   DOM 里就只有 `":"`。**光看 DOM 无法区分「回复楼主」与「字段缺失」** ——
   要拿准确回复对象必须走接口数据，不能只读 DOM。

> 另有一个**视觉后缀**要注意：`.children-item__comment-content` 有 `.cy` 修饰类
> （`D`：`.children-item__comment-content.cy{padding-left:20px}` + `:before` 放一张 16×16 图）。
> 但这不是回复对象，是「cy（插眼）」标记；A/B 两份快照里都没出现 `.cy`。

---

## 4. 可抓取字段清单

### 4.1 一级评论

| 字段 | 取法（选择器） | A 里的实例值 |
| --- | --- | --- |
| 评论 id | 行元素 `[data-comment-id]` | `954407691` |
| 头像 url | `.comment-item-header__avatar img.hb-avatar__image[src]` | `https://cdn.max-c.com/heybox/avatar/wx/f7b10e1a…?imageMogr2/thumbnail/100x100%3E` |
| 头像框 url | `.comment-item-header__avatar img.hb-avatar__avatar-decoration[src]` | 第 1 行有（`.gif`），第 2/3 行无 → **v-if，可空** |
| 用户主页 href | 外层 `a[href]`（无 class）与 `.info-box__username[href]` **相同** | `/app/user/profile/16441115` |
| 用户名 | `.info-box__username` 的文本 | `墨水心` |
| 等级 | `.info-box__level` 的 class 里 `hb-level-NN`；文本在 `.hb-level-tag__inner__text` | class `hb-level-28`，文本 `" Lv.28"`（前导空格） |
| 时间 | `.info-box__create-time` 文本 | `4小时前`（B 里是 `09-08` 绝对日期 → **两种格式都可能**） |
| IP | `.info-box__ip` 文本 | `·湖南`（**含前导 `·`**） |
| 点赞数 | `.comment-item-header__operation-box button.like-box .like-box__cnt` 文本 | `640` |
| 是否已点赞 | `button.like-box.active`（`D`：`.like-box.active{color:#14191e}`） | A 里 3 条都无 `active` |
| 正文 | `.comment-item__content` 的 `innerHTML` / `textContent` | 见 §4.3 / §4.4 |
| 图文混排 - emoji | `.comment-item__content span.hb-emoji[data-emoji]` | `data-emoji="cube_笑cry"` |
| 图文混排 - 图片 | `.comment-item__content-container .comment-item__image-box > .comment-item__image-wrapper > img.comment-item__image` | **A/B 里 0 条**，形态来自 C+D，**【待真机确认】** |
| 作者赞过 | `.comment-item__content-container .comment-item__tag-line > .comment-item__writer-like > span` 文本「作者赞过」 | **A/B 里 0 条**，**【待真机确认】** |
| `@提及` | 正文里的 `<a href>`，文本以 `@` 开头 | **A/B 里 0 条**，**【待真机确认】**（见 §4.3） |
| 置顶 | 行元素额外类 `top`（`D`：`.link-comment__comment-item.top:after`） | A 里 0 条 |
| 作者标记 | `.children-item__writer-tag span`（楼中楼内）；一级评论是 `info-box__line-1` 第 1 个空占位处（`C`：`cs={key:0,class:"info-box__writer-tag"}`，内 `<span>作者</span>`） | **A/B 里一级评论均 0 条**，**【待真机确认】** |

### 4.2 楼中楼

| 字段 | 取法 | A 里的实例值 |
| --- | --- | --- |
| 评论 id | 行元素 `[data-comment-id]` | `954415918` |
| 用户名 | `a.children-item__comment-creator` 文本 | `暮辞熙、` |
| 用户主页 href | 同上 `[href]` | `/app/user/profile/58453304` |
| **回复对象** | `span.children-item__reply-to` 文本，剥掉尾部 `:` 与可选 `回复 ` 前缀 | `":"`（6/6）；B 里 `回复 びじん:` |
| 正文 | `p.children-item__comment-content` | `够看了，上号` |
| emoji | `p.children-item__comment-content span.hb-emoji[data-emoji]` | `data-emoji="cube_摘墨镜"` |
| 图片 | 同上 `img` | 0，**【待真机确认】** |
| 时间 | `span.children-item__create-time` | `3小时前` |
| IP | `span.children-item__ip` | `·江苏` |
| 作者徽章 | `a.children-item__comment-creator + span.children-item__writer-tag > span` | B 里 2 条 |
| **点赞数** | — | **楼中楼行内没有任何点赞节点**（A/B 均无 `.like-box`） |
| **头像** | — | **楼中楼行内没有任何 img**（A/B 均无） |

### 4.3 `@提及` 与正文渲染管线（C + D）

站点把评论正文当 HTML 富文本渲染，不是文本节点拼装：

- 指令 `hb-content` 的 `mounted/updated` 就是 `el.innerHTML = SF(value)`（C，`index-Dq0z_Kch.js`）。
- `SF()` = `hd.parse(text).span()` 产出的 HTML → **DOMPurify 白名单清洗**。
  白名单 `FORBID_TAGS` 明确包含 `a` 之外的 **`img/p/div/br/strong/span` 等一批块级与图片标签**，
  `FORBID_ATTR:["style"]`（C）。
- 因此：**注释里的 `href="heybox://…"` 被显式改写**（`SF` 里那段
  `href.replace(/heybox://,"")` + `encodeURIComponent`），说明站点正文里确实会出现 `<a>`。
- 结论：`@提及` 在 DOM 里应当就是**正文内的一个 `<a href>`**
  （大概率 `href` 指向 `/app/user/profile/<userid>`，因为站点其余用户链接都是这个形状）。
  **但 A/B 两份快照都没有 `@` 提及的实例，站点里也没有 `mention` 专用 class 或 data 属性**
  （全仓 JS 搜 `mention` 只命中 Element Plus 的 `ElMention` 组件，与本评论区无关）。
  → **【待真机确认】**：真机抓一条带 `@` 的评论，确认 `<a>` 的 href 与 class。

**文本折行（A 实证，不用推断）**：`.children-item__comment-content` 内**保留了原始换行符**，
不是 `<br>`。A 的第 4 条楼中楼源码里正文跨两行：

```html
<p class="children-item__comment-content">我记得是主角在公园这种公共场合…最后把老头俩胳膊卸了。
当时就感觉这作者魔怔了，国术也成成魔怔人圈子了…</p>
```

CSS 用 `white-space:pre-line` 把它渲染成换行
（`D`：`.comment-item__content{…white-space:pre-line}`，楼中楼同理）。
`fixtures/detail.html` 全文 `<br` 只出现 1 次，且不在评论区。
**所以抓正文取 `textContent` 是对的，`innerHTML` 里的换行也是真的换行符（`\n`），不要 `trim` 掉中间的。**

### 4.4 emoji 的真实结构（A + D）

```html
<span data-emoji="cube_笑cry" class="hb-emoji hb-emoji-cube hb-emoji-cube_32"></span>
```

- **空 span**：没有文本、没有 `alt`、没有 `title`。语义**只能**从 `data-emoji` 拿。
- 渲染方式是雪碧图背景（`D`，`research/css/index-Cv4ia_mR.css`）：
  `.hb-emoji-cube{width:var(--cube-length);height:var(--cube-length);background-image:url(…/cube_emoji_v33.png)}`，
  `.hb-emoji-cube_NN{background-position:calc(var(--cube-length)*6) calc(var(--cube-length)*18)}` 之类的定位。
- `--cube-length` 由容器给：一级评论 `--cube-length:17px`，楼中楼 `--cube-length:14px`（`D`）。
- 表情分了 4 套前缀：`hb-emoji-cube_*`（默认）、`hb-emoji-heygirl_*`（`--heygirl-length`）。
  A 里出现的 6 个都是 `hb-emoji-cube`（`cube_笑cry`×4 / `cube_摘墨镜` / `cube_叹气`）。
- 结论：**把 emoji 当卡片内容处理时，必须把 `<span.hb-emoji>` 原样保留**，
  它靠 CSS background 显示；`textContent` 会把它整个丢掉。

---

## 5. `.link-comment__comment-children` 的状态与 `load-all` 行为

来源：C（站点源码）+ A + B。这是本文里**最硬**的一段，因为三态的名字和阈值都是源码里读出来的。

### 5.1 三态的名字与判定（C）

`comment-item-chilren` 组件的 setup：

```js
let l = computed(() => root.has_more === 1)       // 还有更多
let v = computed(() => comments.length)           // 已渲染的楼中楼条数
const u = computed(() =>
    root.child_num <= 2 || !l.value ? "all"       // 总条数≤2，或没有更多 → all
  : v === 2                        ? "less"       // 恰好 2 条 → less
  : root.child_num === v           ? "all"        // 已全部渲染 → all
  :                                  "can_load"); // 其余 → can_load
```

容器 class：`class: G(["link-comment__comment-children", {"can-load": u !== "all"}])`
→ **`can-load` 是唯一的修饰类，`less` 与 `can_load` 都带它**。
`u === "all"` 时容器**只有基础 class**（B 的形态）。

### 5.2 视觉差异（D）

```css
.link-comment__comment-children{position:relative;width:100%;margin-top:10px;padding:10px;
  border-radius:8px;background-color:#fafbfc}
.link-comment__comment-children.can-load{padding-bottom:40px}   /* 给底部 30px 按钮让位 */
.link-comment__comment-children .comment-children__load-all{position:absolute;bottom:0;left:0;
  display:flex;align-items:center;justify-content:center;width:100%;height:30px;color:#8c9196}
.link-comment__comment-children .comment-children__load-all:before{content:"";position:absolute;
  top:0;left:0;width:100%;height:1px;background-color:#f3f4f5;transform:scaleY(.5)}
```

→ `can-load` 唯一可见效果就是**底部多 40px padding**；按钮本身 `position:absolute;bottom:0`。
**楼中楼容器是唯一带背景色的评论层**（`#fafbfc`，8px 圆角）—— 重构成卡片时这是天然的「卡片边界」。

### 5.3 按钮文案与行为（C + A + B）

```js
u !== "all" ? h("button", {class:"comment-children__load-all", onClick: stop(_)}, [
    h("div", {class:"load-all__text"},
       u === "less" ? "全部 ".concat(root.child_num, " 条回复") : "查看更多回复"),
    h(HbIcon, {type:"heybox", name:"common_arrow_down_filled_24x24"})
]) : nothing
```

| 状态 | 容器 class | 按钮 | 文案 | 实例 |
| --- | --- | --- | --- | --- |
| `all` | `link-comment__comment-children` | **无** | — | B 的 2 个容器 |
| `less` | `… can-load` | 有 | `全部 N 条回复`（N = `root.child_num`） | A 的 3 个容器：`全部 7 条回复` / `全部 16 条回复` / `全部 5 条回复` |
| `can_load` | `… can-load` | 有 | `查看更多回复` | **A/B 里都没有这个实例** |

- A 的 3 个容器全部是 `less`：都恰好渲染了 2 条楼中楼（`v === 2`），且 `child_num > 2`。
- 按钮文本里的空格是 **`&nbsp;`（U+00A0）**，原始 HTML 为 `全部&nbsp;7&nbsp;条回复`（A）。
  `textContent` 拿到的是 `\u00a0`，解析番号别用普通空格去匹配。
- `onClick` 带 `.stop` 修饰（`pe(_, ["stop"])`）→ **点按钮不会冒泡到行**（C）。
- 点按钮调用 `PageBBSLink:loadMoreChildrenComment(root.commentid)`（C）。该 provider 在
  `link-comment` 的 setup 里 `ze("PageBBSLink:loadMoreChildrenComment", props.getMoreChildComments)`
  绑定 → **走接口重新取该楼全部子评论，然后整棵 setState 重渲染**（C）。
- 脚本自己的 `src/reply-btn.ts` 也把它当热区放行：`__loadAll` 计数器（E，16.6）。

### 5.4 `.can-load` 的既有用法

`src/reply-btn.ts` 目前在 `CHILD_ANCHOR_SELECTOR = '.children-item__other-info'` 之后插按钮，
`MAIN_ROW_SELECTOR = '.link-comment__comment-item'`、`CHILD_ROW_SELECTOR = '.comment-children-item'`，
并在 `isSiteInteractive` 里对 `.link-comment__comment-children` 单独放行（`src/reply-btn.ts:51,53,59,112`）。
**`can-load` 目前没有被脚本依赖**，所以重构卡片时可以自由使用。

### 5.5 `hb-loading` 不是楼中楼的 loading（A 实测）

A 里有一个 `div.hb-loading[hiding="false"][style="display:none"]`，内部
`.hb-loading-spinner > .loading-circle.spin-round`。但它在树里的位置是
`#root > html > body > div > main > div.layout-normal > div.content > div.list > div.hb-loading`
（A，`comment-probe-anatomy.mjs sentinel`），**是页面级 loading，`.list` 的直接子节点，不在评论区里**。
**【待真机确认】**：点「查看更多/全部 N 条回复」期间楼中楼容器内部是否出现临时 loading 元素 ——
A/B 都是静态快照抓不到这一段，源码里 `getMoreChildComments` 是 `await` 后才重渲染，
**大概率容器内容不动、由页面级 loading 遮罩**，但没有直接证据。

---

## 6. 分页 / 加载更多 / 排序 tab

### 6.1 排序 tab：只有一项，不是多 tab（C，权威）

`link-comment` 的 setup 里：

```js
const b = computed(() => [{ label:"全部评论", name:"all", cnt: totalFloorNum }]);
const S = ref(b.value[0].name);
```

传给 `hb-cpt__slide-tab`（`fn` 组件）的 `panes` 就是**单元素数组**。
**所以 DOM 里永远只有 1 个 `button.slide-tab__tab-item`，且带 `active`。**
A/B 都是 1 个（`slide-tab__tab-item` 命中数 = 1）。

> 注意 `cnt` 是 `totalFloorNum`（评论总数），A 里是 `44`、B 里是 `92`；
> 而 DOM 里只渲染了 3 行一级评论 —— 二者不是一回事（见 §0、§10）。

骨架（A）：

```html
<div class="hb-cpt__pagination hb-cpt__slide-tab line underline">
  <div class="hb-cpt__pagination-outer"><!---->
    <div class="hb-cpt__pagination-inner">
      <button class="slide-tab__tab-item active">
        <div class="slide-tab__tab-label">全部评论</div>
        <div class="slide-tab__tab-cnt">44</div>
        <!---->                                  ← slide-tab__tab-pull（下拉箭头，本处不渲染）
      </button>
      <div class="slide-tab-tab__bar" style="width: 56px; height: 2px; left: 0px;"></div>
    </div>
    <!---->
  </div>
</div>
```

样式（`D`，`research/css-detail/index-D2QWFmGt.css`）：
`.hb-cpt__slide-tab{display:flex;align-items:center;position:relative;width:100%;height:42px;padding:0 12px;background-color:#fff}`；
`.underline:after` 是底部 0.5px 分隔线；`.slide-tab-tab__bar{position:absolute;bottom:0;height:2px;background:#14191e;transition:left .3s}`。
`.slide-tab__tab-pull` 是下拉箭头位（本页不渲染）。

### 6.2 「加载更多」是滚动加载，不是分页器 / 不是按钮（C + A）

- `link-comment` 模板里 `.link-comment__list` 的最后一项是：
  `w(nt, {name:"link_comment_bottom", type:"point"})`（C）。
  `nt` 是从 `index.vue_vue_type_style_index_0_lang-CIeHUQBI.js` 引入的**无限滚动哨兵**，
  `type:"point"` 表示「哨兵是一个点，进入视口就触发」。
- 该哨兵**在 A 的静态快照里没有渲染出可见节点**（`.link-comment__list` 的 6 个子节点只有
  3 行 + 3 个 `<!---->`，其中 3 个空注释就是 v-if 分支的占位，A）。
- **整个评论区没有 `hb-cpt__pagination` 的页码 UI**（`hb-cpt__pagination` 只有 1 个命中，
  就是上面那个 slide-tab 容器，A）。也没有 `.el-pagination`。
- **也没有「加载更多」按钮**：全 fixture 搜 `load-more` / `comment__load-more` = 0 命中。
  唯一的按钮是楼中楼的 `.comment-children__load-all`。

### 6.3 列表末尾的两个互斥状态（C + D）

CSS 里有一对只在列表末尾出现的类（`D`，`index-ChemEL1Y.css`）：

```css
#page-bbs-link .hb-bbs-link__container .scroll-list__no-more-desc{position:relative}
#page-bbs-link .hb-bbs-link__container .scroll-list__no-more-desc:before{…1px 分隔线…}
#page-bbs-link .hb-bbs-link__container .scroll-list__to-login{position:relative}
#page-bbs-link .hb-bbs-link__container .scroll-list__to-login:before{…1px 分隔线…}
```

A 里渲染的是**后者**（未登录）：

```html
<div class="scroll-list__to-login">
  <div class="scroll-list__to-login-desc">扫码快捷登录，查看更多优质内容</div>
  <button class="scroll-list__to-login-btn hb-color__btn--confirm">…扫码快捷登录</button>
</div>
```

`scroll-list__no-more-desc`（「没有更多了」）**A/B 里 0 命中**，**【待真机确认】**其真实文案与位置。
两者都在 `.list` 层、**不在 `.link-comment` 里**（A 的兄弟节点顺序已验），
所以「评论列表底部」被分成了两层结构，做卡片重构时不要假定它们在评论区容器内。

---

## 7. 回复框 / 引用（与楼中楼重构相邻，供参考）

来源：A + C + D。A 的完整骨架：

```html
<div class="hb-bbs-link__reply-target">
  <div class="link-reply collapse link-comment__reply" data-reply_wrapper="true">
    <div class="link-reply__main-box">
      <div class="link-reply__input-wrapper">
        <div class="link-reply__editor link-reply__input">
          <div contenteditable="true" translate="no" class="ProseMirror hb-editor" style="">
            <p><br class="ProseMirror-trailingBreak"></p>
          </div>
        </div>
        <div class="link-reply__placeholder">评论 (已有123条评论)</div>
        <!----><!---->
      </div>
      <div class="link-reply__operation-box">
        <button class="link-reply__operation-item">…<span class="link-reply__operation-desc">192</span></button>
        <button class="hb-cpt__favour-btn link-reply__operation-item">…<span class="link-reply__operation-desc">47</span><!----></button>
        <span class="link-reply__operation-tooltip link-reply__comment-tooltip">
          <button class="link-reply__operation-item" type="button">…<span class="link-reply__operation-desc">123</span></button>
        </span>
      </div>
    </div>
  </div>
</div>
```

- `data-reply_wrapper="true"` 是回复框的现成锚点（只有 1 个）。
- 展开后引用原文进 `p.link-comment__target--comment`（C 的 `Ms`；
  父容器 `div.link-comment__target-box`，内含 `.link-comment__target--avatar`（24px 头像））。
  **A 里 0 命中**，因为快照是收起态（`class` 里有 `collapse`）—— **【待真机确认】**展开态的完整形态。
  `D`：`.link-comment__target--comment{flex:1;width:0;padding…;white-space:nowrap;text-overflow:ellipsis;pointer-events:none}`。
- 输入区是 ProseMirror（`DIV.ProseMirror.hb-editor`），点评论行会把焦点抢过去（E，16.3）。
- 操作条 `.link-reply__operation-box` 里的数字是**文章**的点赞/收藏/评论数，不是某条评论的。

---

## 8. 「点击热区 / 事件」小节（来源：`FINDINGS.md` 第十六节，**非本轮新测**）

> 以下事实**全部来自 `research/FINDINGS.md` 第十六节**（用 CDP `DOMDebugger.getEventListeners`
> 在真实浏览器详情页测的）。本节只是浓缩，不做二次验证，不要再当成新结论引用。

### 8.1 监听器挂在哪（E，16.1）

```
div.comment-children-item        → click ×2（非 capture）、dblclick、contextmenu、
                                   mouseenter/mouseleave/mousemove/mouseover
div.link-comment__comment-item   → 同上
```

`click` 挂在**行本身**，不在正文节点上。一级评论行内**每一个带 click 监听的节点**（E）：

```
DIV    .link-comment__comment-item          ← 行
A      /app/user/profile/...                ← 用户名链接
DIV    .comment-item__content               ← 正文自己也挂了监听
DIV    .link-comment__comment-children      ← 楼中楼容器
DIV    .comment-children-item               ← 楼中楼行
DIV    .comment-children-item
BUTTON .comment-children__load-all          ← 展开全部回复
```

**一级评论行内没有任何「回复」按钮**（只有点赞与展开全部回复）。
**图片框不在这个列表里**（没有自己的 click 监听），但点了会开大图 →
看图与弹框由同一个祖先处理器按 `event.target` 分流，**拆不开**。

### 8.2 可信鼠标逐点验证的原行为（E，16.1）

| 点的位置 | 站点原行为 |
| --- | --- |
| 楼中楼正文 `<p>` | 回复框展开（`reply-target` 高度 60 → 127） |
| 楼中楼时间 / IP | 同样展开 |
| 楼中楼行内右侧一大片空白 | 同样展开 |
| 一级评论正文 `.comment-item__content` | 同样展开 |
| 一级评论行内空白 | 同样展开 |
| 任意一级的作者链接 `<a>` | **不展开**（站点自己就把它排除在外） |
| 一级评论里的图片 | **开大图，同时也弹回复框** |

→ **两级评论的整行都是热区**，不是「只有正文是」。

### 8.3 脚本侧的现状（E，16.2/16.3/16.6 + 当前 `src/reply-btn.ts`）

- 捕获阶段 `document.addEventListener('click', …, true)` 拦一次；放行规则按语义列：
  `a, button, input, textarea, [contenteditable], [role="button"]`，
  外加显式放行**图片区**（`.comment-item__image-box / .comment-item__image-wrapper / img`）
  与**楼中楼容器**（`.link-comment__comment-children`）。
- 自己的按钮落点：一级评论进 `.comment-item-header__operation-box`（与 `button.like-box` 并排、排在其后）；
  楼中楼放在 `span.children-item__other-info` **之后**（作为行的最后一个子节点）。
- 合成 click 能驱动站点处理器：站点**不检查 `isTrusted`**（E，16.3）。这条如果变了，按钮会静默失效。
- `__hbRebuild()` 全量重建后按钮不被重映射（靠 `data-hb-own`）（E，16.6）。

### 8.4 对楼中楼卡片重构成直接影响的两条

1. **点整行 = 回复**。卡片化后如果卡片本身吃掉点击，必须自己补「回复」入口，否则回复功能全废（E，16.1/16.2）。
2. **图片与弹框同源分流**。「让卡片不被点击打扰」和「保留点图看大图」在事件层面拆不开（E，16.5）。

---

## 9. 本脚本可依赖的稳定锚点

排序依据：是否属于站点的**语义/数据契约**（稳定）vs 纯样式钩子（易变）。

### 9.1 最稳 —— 建议作为首选锚点

| 锚点 | 依据 | 备注 |
| --- | --- | --- |
| `[data-comment-id]` | Vue `key` + `data-comment-id` 双绑定（C）；两级行都有 | 既是唯一 id 也是稳定选择器；**天然避开 Vue 重渲染造成的节点替换** |
| `#page-bbs-link` | 页面根 id（A） | 站点样式表也用它（`D` 里大量 `#page-bbs-link .…`） |
| `div.link-comment` | 评论区根，A 里唯一 | 与文章块 `.hb-bbs-post` 平级 |
| `div.link-comment__list` | 列表容器，A 里唯一 | 评论区与「登录提示」的分界线 |
| `div.link-comment__comment-item` | 一级评论行（C 里 class 名硬编码） | 现有 `MAIN_ROW_SELECTOR` |
| `div.comment-children-item` | 楼中楼行（C 里 class 名硬编码） | 现有 `CHILD_ROW_SELECTOR` |
| `div.link-comment__comment-children` | 楼中楼容器（C 里 class 名硬编码） | 有楼中楼才存在（v-if） |
| `div.comment-item-header__operation-box` | 站点自己的操作条（C） | 现有按钮落点 |
| `span.children-item__other-info` | 楼中楼时间/IP 容器（C） | 现有按钮落点 |
| `a.children-item__comment-creator[href]` | 作者链接（C） | 楼中楼行内**唯一**的 `<a>` |
| `span.children-item__reply-to` | 回复对象**纯文本**（C） | 只能读文本，没有 href/userid |
| `p.children-item__comment-content` | 正文容器（C） | 注意 `innerHTML` 由 sanitize 后注入 |
| `div.comment-item__content` | 一级正文容器（C） | 同上 |
| `span.hb-emoji[data-emoji]` | emoji（C + D） | 语义只在 `data-emoji` |
| `div.comment-item__content-container` | 正文区容器（C） | 内含正文 + 图 + 标签 + 楼中楼 |
| `button.comment-children__load-all` | 展开按钮（C），`.stop` 修饰 | 只在 `can-load` 态存在 |
| `div.hb-cpt__slide-tab` 里的 `div.slide-tab__tab-cnt` | 评论总数文本（C） | 是 `totalFloorNum`，非已渲染行数 |
| `div[data-reply_wrapper="true"]` | 回复框（A） | 全局唯一 |

### 9.2 可用但需注意条件

| 锚点 | 条件 / 坑 |
| --- | --- |
| `div.link-comment__comment-item-header` | 存在，但 `height:34px` 固定（D），加东西要小心挤压 |
| `div.info-box__line-1` / `div.info-box__line-2` | 两级结构；`line-1` 里那串 `<!---->` 是 v-if 位，**不要按第 n 个子节点取值**，用类名 |
| `div.hb-level-tag.hb-level-NN` | 等级数字在 class 上（`hb-level-28`），文本在 `.hb-level-tag__inner__text` |
| `span.children-item__writer-tag` | 只在「作者自己的楼中楼」出现（B） |
| `.comment-item__image-box` / `.comment-item__image-wrapper` / `img.comment-item__image` | **A/B 无实例**，来自 C+D；现有放行规则已引用 |
| `div.comment-item__tag-line` / `.comment-item__writer-like` | **A/B 无实例**（「作者赞过」）**【待真机确认】** |
| `div.scroll-list__to-login` / `div.scroll-list__no-more-desc` | 在 `.list` 层、不在 `.link-comment` 里；后者 A/B 无实例 |
| `div.like-box.active` | 已点赞态；`D` 有 `.like-box.active{color:#14191e}` |
| `div.link-comment__comment-item.top` | 置顶态；A 里 0 实例 |

### 9.3 不要当锚点

- 任何 `data-v-XXXXXXXX`：A 里评论节点**一个都没有**；已出现的
  `data-v-38787230`(layout)、`data-v-e3a8d063`(右栏)、`data-v-ab0ef0d9`(nav)、
  `data-v-315c9d13`(右侧 promo) 都与评论区无关。
- `<!---->` 注释占位的**序号**（Vue 版本/编译产物一变就变）。
- 任何 `style="color: rgb(...) !important"` / `data-hb-dark-fg` / `data-hb-dark-bg`：
  这些是**本站脚本自己的深色引擎**注进去的（B 里满屏都是），不是站点结构。
- `.can-load`：见 §10。

---

## 10. 脆弱点 / 风险清单

### 10.1 结构性风险

1. **一级评论按滚动懒加载，DOM 行数 ≠ 评论总数。**
   A 里 tab 显示 `44`，DOM 只有 3 行；B 显示 `92`，DOM 只有 3 行。
   **任何「遍历 / 计数 / 卡片化」都必须接受「列表会被追加且顺序变化」**，
   不能缓存行列表长度，也不能假设 `querySelectorAll` 的结果在异步等待后不变。
   Vue 侧是「接口数据数组 → v-for」，新增评论会**整段重渲染**（C）。

2. **楼中楼「展开全部回复」会重新取数并重渲染整个容器。**
   `loadMoreChildrenComment` → `await` → 重渲染（C）。
   **任何插进楼中楼容器的 DOM 都可能被 Vue 的 patch 抹掉**，
   必须把自定义节点的注入做成幂等 + 可重入（现有 `src/reply-btn.ts` 就是这样）。
   风险等级：**高** —— 这正是「楼中楼卡片化」最可能翻车的地方。

3. **`.can-load` / 三态是内部实现细节。**
   `all`/`less`/`can_load` 这套名字与 `child_num <= 2`、`v === 2` 这些阈值都是
   站点组件里的私有逻辑（C）。
   **风险**：把它们当业务状态用（比如「有 can-load 就有更多」）会在站点改阈值时静默失效。
   要判断「是否还有更多」应当数行数、或直接看按钮是否在。

4. **`comment-item__content` / `children-item__comment-content` 的子节点由
   `innerHTML` + DOMPurify 白名单生成**（C）。
   站点改白名单（现在 `FORBID_TAGS` 里有一长串，含 `img/p/div/strong` 等）会直接改变正文子结构，
   而且**不会**反映在 class 名上。**风险**：任何「正文里第 n 个节点」的假设都不成立。
   emoji 是空 `span` 靠 CSS 显示，任何「取 textContent 重建正文」的方案都会丢表情。

5. **`.link-comment__comment-children` 只在有楼中楼时存在（v-if）**，
   且它的父节点是 `comment-item__content-container`（C）。
   **风险**：`:has()` 之类的反向选择、以及「行 → 容器的固定位置」假设都要考虑 v-if 缺失。

6. **一级评论与本楼楼中楼在 DOM 上不嵌套于同一个小容器。**
   楼中楼在**一级评论行内部**（`content-container` 的最后一个子节点），
   **不是兄弟**。卡片化时如果要「把楼中楼抽出来单独渲染」，等于跟站点的 v-for 结构对抗。

7. **`data-v-*` 在评论节点上完全没有**，但站点的右栏/nav 有。
   **风险**：不要写「`.link-comment` 下带 data-v 的就是评论组件」这类推断。

### 10.2 字段级风险

8. **时间格式有两种**：A 是 `4小时前`（相对），B 是 `09-08`（绝对，无年份）。
   解析器必须两种都吃，**不要**假设相对时间。
9. **IP 文本带前导 `·`**（`·湖南`），直接当字符串用会在卡片上多一个点。
10. **文字里的空格可能是 `\u00a0`**（`全部\u00a07\u00a0条回复`）。
    比较文案时要 `replace(/\u00a0/g,' ')`。
11. **正文里有真换行符 `\n`**（A 第 4 条楼中楼），
    `textContent` 拿到的是带 `\n` 的串，**别用 `trim()` / 正则 `\s+ → 空格` 把它吃掉**。
12. **等级文本有前导空格**（`" Lv.28"`）。
13. **楼中楼没有点赞数、没有头像**（A/B 均无）。
    **风险**：如果卡片设计里给楼中楼放点赞位，必须自己补数据源（DOM 里没有）。
14. **`@提及` 的确切 DOM 形状未被证据固定**（**【待真机确认】**，见 §4.3）。
15. **`comment-item__image-box` / `tag-line` 的确切形态未被证据固定**（**【待真机确认】**）。
    这两个是现有 `src/reply-btn.ts` 放行规则里已经写死的选择器，值得优先补验。

### 10.3 交互/事件风险（E，第十六节）

16. **两级行整行都是点击热区**（E，16.1）。卡片重构若吃掉行点击，会连带废掉「回复此楼」。
17. **点图片会连带弹回复框，且拆不开**（E，16.5）。想「卡片不被点击打扰」就只能连大图一起拦。
18. **合成 click 能驱动站点处理器，但站点不检查 `isTrusted` 这件事没有契约保证**（E，16.3）。
19. **回复框展开会抢焦点到 `DIV.ProseMirror`，毁掉选区**（E，15.3/16.4）——
    卡片化后若改变了行点击语义，要重新验一遍「拖选 → Ctrl+C」链路。

### 10.4 环境风险

20. **`fixtures/detail.html` 与 `detail-full.html` 是两篇不同的文章**
    （评论 id 段、评论总数 44 vs 92 都不同），不要混用它们的时间线/评论数。
21. **两份快照都是深色态**：`detail-full.html` 的 `<html class="heybox-dark dark">` 带
    `#heybox-dark-mode-style` 内联样式表，`detail.html` 也带 `data-hb-dark-*` 与
    `!important` 内联颜色（是本站脚本深色引擎的产物）。
    **抓字段时不要被这些内联属性带偏**。
22. **抓不到真机详情页**：无头浏览器撞腾讯验证码（`DIV.t-mask` + 安全验证 iframe，E 十五节）。
    因此本文所有【待真机确认】项都只能等一次有头人工过验证码的窗口。
23. **评论区在未登录态渲染的是「扫码快捷登录」而不是「没有更多了」**（A），
    且该节点在 `.link-comment` 外 —— 卡片重构的「列表末尾」判断会跨容器。

---

## 11. 复现本文结论的命令

```powershell
# 骨架 / 字段 / 容器状态 / 头部 / 统计 / 页面位置 / 哨兵
node research/comment-probe-anatomy.mjs tree       fixtures/detail.html
node research/comment-probe-anatomy.mjs fields     fixtures/detail.html
node research/comment-probe-anatomy.mjs children   fixtures/detail.html
node research/comment-probe-anatomy.mjs header     fixtures/detail.html
node research/comment-probe-anatomy.mjs counts     fixtures/detail.html
node research/comment-probe-anatomy.mjs context    fixtures/detail.html
node research/comment-probe-anatomy.mjs sentinel   fixtures/detail.html
node research/comment-probe-anatomy.mjs all        fixtures/detail.html

# 换另一个 fixture（另一篇文章，含「回复某人」与「作者」徽章）
node research/comment-probe-anatomy.mjs fields     fixtures/detail-full.html
node research/comment-probe-anatomy.mjs children   fixtures/detail-full.html
```

站点源码里三处渲染函数的原文位置（`research/js/index-CVVwhh7y.js`，压缩单行，用字符串搜索定位）：

| 搜什么 | 得到什么 |
| --- | --- |
| `class:"children-item__reply-to"` | 楼中楼模板 + `replyuser/replyid` 三元表达式 |
| `"can-load":u.value!=="all"` | 三态判定 `all`/`less`/`can_load` + `comment-children__load-all` 模板 |
| `class:"comment-item__image-box"` | 一级评论 `content-container` 的四个子节点顺序 |
| `link_comment_bottom` | `.link-comment__list` 的无限滚动哨兵 |
| `class:"link-comment__list"` | 评论区头部（slide-tab）+ 列表 + 回复框的整体模板 |

---

## 12. 复核方式

### 12.0 三个探测器

| 脚本 | 作用 | 覆盖章节 |
| --- | --- | --- |
| `node research/comment-probe-anatomy.mjs <mode> [fixture]` | 解析 fixture 的 DOM 骨架 / 字段 / 容器状态 / 头部 / 位置 / 哨兵 | §1–§9 |
| `node research/comment-probe-verify.mjs` | 把文档里**每一个类名 / `data-*` / 图标 id** 抽出来，到 fixture、站点源码/样式、真机素材里逐个查证 | §1–§15 |
| `node research/comment-probe-live.mjs <mode>` | 真机素材对齐：`replyto` / `fields` / `mentions` / `images` / `tags` / `loading` / `raw` / `json` | §13、§14 |
| `node research/comment-probe-align.mjs` | 接口 ↔ 真机 DOM 的 **ID 对齐**与三方交叉核对（行正文 / 引用文本 / 接口 text） | §13.1、§14.2 |

`comment-probe-anatomy.mjs` 的 mode：`tree` / `fields` / `children` / `header` / `counts` / `context` / `sentinel` / `debug` / `all`。
第二个参数可换 fixture，例如 `… counts fixtures/detail-full.html`。

### 12.0.1 `comment-probe-verify.mjs` 的最新运行结果

```
=== 类名断言复核（共 85 个）===
  [有据] 85 个
    其中「只有真机素材能证」的：0 个 → (无)
  [无据] 0 个

=== data-* 属性复核（共 14 个）===
  ✓ data-comment-id     fixture + 源码 + 真机 expanded/decoded/replybox
  ✓ data-emoji          fixture + 真机
  ✓ data-hb-dark-bg / -fg / data-hb-webp-fallback-bound / data-reply_wrapper / data-v-*  ✓
  ✗ data-hb-own         （仅本站脚本自己打的标记，见下）
  ✓ icon-bbs_thumbs-up_filled_24x24 / icon-common_arrow_down_filled_24x24
```

「只有真机素材能证」为 0，是因为本文引用的每个类名在**至少一份** fixture 或站点源码里也能找到；
真机素材的作用是**让原本「无实例」的类名第一次拿到真实形态**（见 §12.0.2），而不是引入新类名。

唯一一个「无据」项是 `data-hb-own` —— 它**不是站点结构**，是本站脚本自己打的标记
（`src/reply-btn.ts:160,174`；也在 `src/copy.ts`、`src/dark-mode.ts`、`src/declutter.ts`、
`src/dark-engine.ts:708,758,901`、`src/ui.ts:160` 里用），
所以任何 fixture / 真机素材里都永远不会出现。

### 12.0.2 真机素材让哪些「无实例」变成「有实例」

| 类名 / 形态 | A | B | 真机 F（展开） | 真机 H（收起） | 结论 |
| --- | --- | --- | --- | --- | --- |
| `children-item__reply-to` 的 `"回复 用户名:"` 形态 | 0 | 1 | **16** | 0 | §13.8 定论 |
| `link-comment__comment-children`（`can-load`） | 3 | 0 | 0 | **2** | §13.6 的 `less` 态 |
| `link-comment__comment-children`（裸类 = `all`） | 0 | 2 | **6** | 0 | §13.6 的 `all` 态 |
| `link-comment__target-box` / `--avatar` / `--comment` | 0 | 0 | 0 | 0 | **真机 I/J 才有**（§14.2） |
| `link-reply__menu-box` / `link-reply__menu-btn` / `hb-color__btn--cancel` | 0 | 0 | 0 | 0 | **真机 I 才有**（§14.2） |
| `comment-item__image-box` / `__image-wrapper` / `__image` | 0 | 0 | 0 | 0 | **仍然 0**（§13.3） |
| `comment-item__tag-line` / `comment-item__writer-like` | 0 | 0 | 0 | 0 | **仍然 0**（§13.4，`is_author_award` 全 0） |
| `info-box__writer-tag` / `comment-schoolmate-tag` | 0 | 0 | 0 | 0 | **仍然 0**（§13.5，`is_link_owner` 全 0） |
| `can-load` 的 `查看更多回复` 文案 | 0 | 0 | 0 | 0 | **仍然 0**（§13.6） |
| `scroll-list__no-more-desc` | 0 | 0 | 0 | 0 | **仍然 0**（§12.2 第 7 条） |

### 12.1 首轮的独立交叉验证

`fixtures/detail.html` 的楼中楼那一行，与站点渲染函数逐字对得上（C）：

`fixtures/detail.html` 的楼中楼那一行，与站点渲染函数逐字对得上（C）：

源码模板 `[creator, is_link_owner?作者:空, schoolmate-tag, reply-to, content, other-info]`
↔ fixture 实际 `a.children-item__comment-creator, #comment<!-- -->, #comment<!-- -->,
span.children-item__reply-to, p.children-item__comment-content, span.children-item__other-info`。
**节点数与位置完全一致**（fixture 里那 2 个 `<!---->` 就是前两个 v-if 分支的空占位），
说明这份快照确实是站点 Vue 渲染产物、没有经过二次加工，可以放心当结构基准。

### 12.2 首轮遗留的【待真机确认】项（**已由 §13 收口，此处保留作对照**）

> ⚠️ 本节是**首轮（只有 A/B 两份 fixture 时）**的遗留清单，**结论以 §13 为准**。
> 「§13 状态」一列是收口结果：4 条「仍然无实例但已能解释」、2 条「已确认」、1 条「仍未触发」。

| # | 项 | 首轮为什么确认不了 | §13 状态 |
| --- | --- | --- | --- |
| 1 | `@提及` 的 `<a>` 形状（href / class） | A/B 无 `@` 提及实例；站点无 mention 专用 class | **仍然无实例**（§13.2）。`@` 只命中假头像 URL |
| 2 | `comment-item__image-box` 内层是否就是 `wrapper > img.comment-item__image` | A/B 无图片评论实例 | **仍然无实例**（§13.3）。接口点名了带图的那一条 `967402162`，但它恰好不在 DOM 快照里 |
| 3 | `comment-item__tag-line`（「作者赞过」）的实际 HTML | A/B 无实例 | **仍然无实例，但已能解释**（§13.4）：`is_author_award` 31/31 全 `0` |
| 4 | 一级评论的 `.info-box__writer-tag`（「作者」徽章）实际 HTML | A/B 里一级评论均无 | **仍然无实例，但已能解释**（§13.5）：`is_link_owner` 31/31 全 `0` |
| 5 | `can_load`（按钮文案「查看更多回复」）的实例 | A/B 里楼中楼都是 2 条的 `less` 态 | **仍然无实例**（§13.6）。但真机补齐了 `all`（F）与 `less`（H）两态 |
| 6 | 点「全部 N 条回复」期间楼中楼容器内是否有临时 loading | 静态快照抓不到过程 | **部分确认**（§13.7）：**完成后无残留**；过程中间态仍未录到 |
| 7 | `scroll-list__no-more-desc`（「没有更多了」）的文案与位置 | 未登录态渲染的是 `to-login` | **仍未触发**（§13 未涉及）—— 仍是【待真机确认】 |

### 12.3 首轮认定的 2 项「形态分叉」——§13.8 已改写其中之一

- 时间格式：相对（`4小时前`，A）与绝对（`09-08`，B）都可能出现。**维持**（真机 F/H 全是相对时间）。
- 楼中楼回复对象：首轮写「`":"`（A，6/6）与 `"回复 用户名:"`（B，1 条）都可能出现」——
  **§13.8 把它改写成定论**：真机 42 行里 16 行是 `"回复\u00a0用户名:"`，
  触发条件是 `replyuser && replyid !== root.commentid`，**16/16 吻合**；
  且 `/tree` 的 `replyuser` **回答复楼主时也有值**，不能用它判断有无回复对象。

---

# 13. 真机核实（本次新测）

> 素材：有头 Chrome + **真实登录态** + 页面 `https://www.xiaoheihe.cn/app/bbs/link/192688392`，
> 由 Lead 抓取并冻结为 F / G / H / I / J（见 §0 表）。本章的每条结论都在素材里 grep 得到，
> 复现命令见 `node research/comment-probe-live.mjs <mode>` 与 `node research/comment-probe-align.mjs`。
> **本章结论取代 §12.2 的对应条目**。

## 13.1 素材规模与 ID 对齐（先立口径）

| 素材 | 一级评论行 | 楼中楼行 | 说明 |
| --- | --- | --- | --- |
| `F` 展开态 | **19** | **42** | 点开全部「全部 N 条回复」后 |
| `H` 收起态 | **3** | **5** | 页面初始 |
| `G` 接口 | **20** 主楼 | **11** 楼中楼 | `/bbs/app/link/tree` 第一页 |

| 对齐关系 | 结果 |
| --- | --- |
| 接口主楼 20 条 → `F` 里存在的 | **19**（缺 `967402162`） |
| `F` 一级行 19 条 → 接口里没有的 | **0** |
| 接口楼中楼 11 条 → `F` 里存在的 | **11（全中）** |
| `F` 楼中楼 42 条 → 接口里没有的 | **31**（后续分页/展开请求取回，不在这一份响应里） |
| `H` 的 3 主楼 + 5 楼中楼 | 全部能在 `G` 里找到 |

**关键含义**：`F` 的 42 条楼中楼里只有 11 条来自 `G` 这份响应 ——
**「接口某一页」不等于「DOM 里当前可见的全部」**。做卡片补数据时必须按 `commentid` 逐条查缓存，
不能假设一次 `/tree` 响应覆盖整页。

**注释占位**：`F` 的 42 行与 `H` 的 5 行，**每行都恰好有 2 个 `<!---->` 空注释**，
位置在 `.children-item__comment-creator` 之后、`.children-item__reply-to` 之前（解析计数：`[[2,42]]` / `[[2,5]]`）。
与 §3.1 首轮结论一致（Vue 的 `is_link_owner` 位 + `schoolmate-tag` 位）。

## 13.2 【收口 1/4】`@提及` 的 `<a>` 形状 —— **仍然无实例**

- `F` 全文里 `@` 只出现 **3 次**，**全部**是假头像占位图的 URL 片段
  （`https://cdn.max-c.com/app/heybox/icon_83.5@3x.png`），**不是提及**。
- 一级评论正文 `.comment-item__content` 内 `<a>` 数 = **0**；
  楼中楼正文 `.children-item__comment-content` 内 `<a>` 数 = **0**（`F` 全量遍历）。
- `H` 里同样为 0。
- 对照：`.children-item__comment-content a` 这条**样式规则存在**（`D`），
  且 `SF()`（`C`）显式处理 `heybox://` 链接改写 —— 说明站点**有能力**渲染正文内链接，
  但**这批素材里没有 `@提及` 的实例**。

**结论：仍然无实例。【待真机确认】** 需要专找一条带 `@` 的评论才能定形状。
已知的只有「它应当是一个正文内的 `<a>`，且 `D` 里有 `.children-item__comment-content a` 与
`.comment-item__content-container a` 两条规则给它定位」。

## 13.3 【收口 2/4】图片评论 `comment-item__image-box` 内层 —— **仍然无实例（但有了新线索）**

- `F` / `H` 全文 `comment-item__image` 命中 **0**，`.comment-item__image-box` 节点 **0**，
  `.comment-item__image-wrapper` **0**。
- **新线索**：接口 `G` 里**有且仅有 1 条**评论带 `imgs`：

  ```jsonc
  { "commentid": 967402162, "__isMain": true, "user": "猫娘不吃猫粮",
    "text": "今天刚看完车展就刷到了，车展里面也有这种技术展示",
    "imgs": [{ "thumb": "https://imgheybox1.max-c.com/bbs/2026/10/04/64e74cc279ccf45212809691a3e63fd6.webp?…",
               "url":   "https://imgheybox1.max-c.com/bbs/2026/10/04/64e74cc279ccf45212809691a3e63fd6.webp?…",
               "width": 1080, "height": 810, "mimetype": "image/webp" }] }
  ```

  **但这行恰恰是 `F` 里唯一缺失的一级评论**（19 行里没有 `967402162`，`H` 也没有）。
  即：带图的那条**不在 DOM 快照里**，仍然核对不到图片框结构。

  → 这也给了一条实用结论：**图片 URL 与尺寸只有接口有**（`thumb` / `url` / `width` / `height` / `mimetype`），
  DOM 里的图片节点只会给一个 `src`。

**结论：仍然无实例。【待真机确认】** 且要抓的是 `967402162` 这一行（它已被接口点名）。

## 13.4 【收口 3/4】`comment-item__tag-line`（作者赞过）—— **仍然无实例，但已可解释为「该页确实没有」**

- `F` / `H` 里 `comment-item__tag-line`、`comment-item__writer-like` 节点数均为 **0**。
- **接口侧硬证据**：`G` 的 31 条里 `is_author_award` **31/31 全部为 `0`**。
- 同一份数据里 `is_link_owner` 也是 **31/31 = 0**，`is_cy` 同样 **31/31 = 0**。

→ 也就是说「作者赞过」没渲染不是快照丢失，而是**这一页的作者没有赞过任何评论**；
接口字段与 DOM 表现**一致**。

**结论：仍然无实例，但这是「数据里就没有」，不是「DOM 不渲染」。【待真机确认】** 需要一页存在 `is_author_award=1` 的评论。

## 13.5 【收口 4/4】一级评论 `.info-box__writer-tag`（「作者」徽章）—— **仍然无实例，同样已可解释**

- `F` / `H` 里 `info-box__writer-tag` 节点数均为 **0**。
- 全 `F` 搜「作者」二字只有 **1 处**，而且是**评论正文里出现的「作者」二字**，不是徽章：
  `…不是现在解读的“无字代表释经权”，作者本身就是崇尚心学的…`（在 `.children-item__comment-content` 内）。
- **接口侧硬证据**：`is_link_owner` **31/31 = 0** —— 这 31 条里没有一条是楼主自己发的。

**结论：仍然无实例，原因同上（数据里没有楼主的评论）。【待真机确认】**

> 附带确认：首轮在 `B`（`fixtures/detail-full.html`）里拿到的
> `<span class="children-item__writer-tag"><span>作者</span></span>` **依然是楼中楼作者徽章的唯一样本**；
> 一级评论的对应节点（`C` 里的 `cs = {key:0, class:"info-box__writer-tag"}`）**至今没有实例**。
> `F` 里楼中楼 `children-item__writer-tag` 也是 0（同样因为 `is_link_owner=0`）。

## 13.6 `can_load`（「查看更多回复」）—— **这份真机 DOM 里没有，但第三种状态 `less` 齐了**

| 素材 | `.link-comment__comment-children` 的 class | 按钮 | 文案 |
| --- | --- | --- | --- |
| `F`（展开态，6 个容器） | 全部 `link-comment__comment-children`（**裸类**） | 0 个 | — |
| `H`（收起态，2 个容器） | 全部 `… can-load` | 2 个 | `全部 6 条回复` |

- `F` / `H` 里 `查看更多回复` 命中 **0** → **`can_load` 态仍然没有实例**。
- `H` 里那条是 `less` 态，与源码判定完全吻合（`G` 里 `967344568` 的 `child_num = 6`，
  DOM 只渲染 2 条 → `v === 2` 且 `child_num > 2` → `less` → `全部 6 条回复`）。
  **这是真机对 §5.1/§5.3 三态判定的独立验证**，且文案里的空格确认是 `&nbsp;`（U+00A0）。
- `F` 里 6 个容器的楼中楼条数分别是 **5 / 1 / 21 / 9 / 4 / 2**，全部**裸类**：
  展开后 `comments.length === child_num` → `"all"` → 无按钮。**三态里的 `all` 真机确认。**

**结论：`can_load` 仍然无实例。【待真机确认】** 触发条件是
`child_num > 2` 且**当前只渲染了 2 条但 `comments.length !== 2`** ——
按源码这在初次加载里几乎不会出现，更像是「点过一次『查看更多回复』之后」的中间态。
真实触发路径需要一次交互录制才能确认。

## 13.7 展开期间容器内是否有临时 loading 节点 —— **没有残留；过程未观测到**

- `F` 全文 `hb-loading` / `hb-loading-spinner` / `loading-circle` / `hiding=` 命中 **全部为 0**。
- 遍历 `F` 全 DOM，class 里含 `load|spin|skeleton` 的只有 **0 个**。
- `F` 每个楼中楼容器的**最后一个子节点是一个 `<!---->` 空注释**，
  即「load-all 按钮」那个 v-if 分支的占位 —— 说明按钮是**被 `all` 状态移除**的，
  不是被 loading 顶掉的。

**结论：展开完成后容器内没有 loading 残留（真机确认）；「展开过程中」的中间态本轮没录到。
【待真机确认】** 要答「过程」只能录一次 DOM 变更加时间轴。

## 13.8 硬核对：DOM 到底会不会渲染 `"回复 用户名:"` —— **会，而且不是个例**

这是本章最重要的一条，**与 Lead 转述的「42 条里全是 `:`」不符**，以本节的实测为准。

**只数 DOM（不依赖接口对齐）**，`F` 的 42 行 `.children-item__reply-to` 文本分布：

```
 26 条 → ":"                                     ← 回复本楼楼主
 16 条 → "回复\u00a0<昵称>:"                      ← 回复楼中楼里的另一个人
         其中：MushroomEl ×2、超级暴龙虾 ×2、柑橘味的 ×2、
               张三ER、又又又被使用了、我不到啊a、huiaurora、山海、
               我要吃小孩ziran、liligujbni、歪比巴波~、陨落方舟、墨墨 各 ×1
```

计数口径：`node research/comment-probe-live.mjs replyto`。
「回复」二字在 `F` 里以 `回复&nbsp;` 形式出现 **16 次**（`&nbsp;` = U+00A0，DOM 文本里是 `\u00a0`）。

**真机原文（`F`，原样 outerHTML，未加工）**：

```html
<div class="comment-children-item" data-comment-id="967602539"><a href="/app/user/profile/13251674" class="children-item__comment-creator">张三ER</a><!----><!----><span class="children-item__reply-to">回复&nbsp;MushroomEl:</span><p class="children-item__comment-content">素的话真没一箱油贵。就这几分钟的事儿。现在一箱酒五六十升的话就要五六百了。<span data-emoji="cube_滑稽" class="hb-emoji hb-emoji-cube hb-emoji-cube_34"></span><span data-emoji="cube_滑稽" class="hb-emoji hb-emoji-cube hb-emoji-cube_34"></span></p><span class="children-item__other-info"><span class="children-item__create-time">2小时前</span><span class="children-item__ip">·湖北</span></span></div>
```

```html
<div class="comment-children-item" data-comment-id="967657488"><a href="/app/user/profile/56206206" class="children-item__comment-creator">太阳轰炸高级引导专员</a><!----><!----><span class="children-item__reply-to">回复&nbsp;张三ER:</span><p class="children-item__comment-content">奶奶的广州这边95#得9块2，平均8毛多一公里<span data-emoji="cube_哭泣" class="hb-emoji hb-emoji-cube hb-emoji-cube_11"></span>…</p><span class="children-item__other-info"><span class="children-item__create-time">48分钟前</span><span class="children-item__ip">·广东</span></span></div>
```

**结构要点（16/16 一致）**：

- 回复对象文本**整体在 `span.children-item__reply-to` 内部**，冒号也在里面（`回复&nbsp;昵称:`）。
- 该 `span` **没有任何子元素**（`children.length === 0`，纯文本节点），
  **里面没有 `<a>`** —— 所以回复对象**依然拿不到 userid、不可点击**。
- 「回复对象」与「作者链接」是两个独立节点：`.` 后面的昵称**只在文本里**。

### 与 Lead 那张表的差异：`G` 的 11 条 `replyuser` 里有 10 条对应 DOM 只显示 `":"`

把 `G` 的 11 条楼中楼按 `commentid` 对齐到 `F`：

| 接口 `commentid` | `replyuser.username` | `replyid` | 该楼 `rootid` | `replyid === rootid`？ | DOM 的 reply-to |
| --- | --- | --- | --- | --- | --- |
| 967363978 | 楽淸 | 967344568 | 967344568 | **是** | `":"` |
| 967411943 | 楽淸 | 967344568 | 967344568 | **是** | `":"` |
| 967679795 | 从前有只大兔砸 | 967354560 | 967354560 | **是** | `":"` |
| 967579188 | 人生如西游 | 967440554 | 967440554 | **是** | `":"` |
| 967594797 | 人生如西游 | 967440554 | 967440554 | **是** | `":"` |
| 967526098 | 魔神薇薇安MK | 967478893 | 967478893 | **是** | `":"` |
| 967539464 | 魔神薇薇安MK | 967478893 | 967478893 | **是** | `":"` |
| 967374676 | 风语_fly | 967364584 | 967364584 | **是** | `":"` |
| 967616868 | 风语_fly | 967364584 | 967364584 | **是** | `":"` |
| 967425197 | 铜潼铜潼 | 967406757 | 967406757 | **是** | `":"` |
| **967572600** | **墨墨** | **967425197** | 967406757 | **否**（`replyid` 指向楼中楼 `967425197`） | **`回复\u00a0墨墨:`** |

**这批数据不是反例，而是对站点规则的精确验证**：

- `G` 的 11 条里，**10 条的 `replyid` 等于本楼楼主的 `commentid`** → 源码三元表达式为假 → DOM 只渲染 `":"`；
  **唯一 1 条 `replyid` 指向楼中楼里另一条评论（`967425197`）的，DOM 就渲染了 `回复 墨墨:`**。
- **双向、且两种等价判法都对**（`node research/comment-probe-align.mjs` 的「11 条 replyuser 的双向判定表」）：

  ```
  「replyid !== rootid」       与「DOM 显示回复」一致： 11 / 11
  「replyuserid !== 楼主 userid」与「DOM 显示回复」一致： 11 / 11
  ```

  11 条逐条都是 `replyid === rootid` ⟺ `DOM 显示 ":"`，`replyid !== rootid` ⟺ `DOM 显示 "回复 X:"`。
  后一种判法（比 `replyuserid` 与楼主 `userid`）与前一种完全等价，实现时用哪个都行。
- 也就是说：**`replyuser` 字段存在 ≠ DOM 会显示「回复 X:」**。
  真正的判定式是 `replyuser && replyid !== root.commentid`，
  而「直接回复楼主」时接口**同样会填 `replyuser`**（填的就是楼主本人）——
  所以 `/tree` 响应里**「回复楼主」与「回复某人」都带 `replyuser`**，
  光看 `replyuser` 有值分不出来，**必须比较 `replyid` 与 `rootid`**。

### `F` 那 16 条「回复 X:」的对象，逐条在 DOM 内自洽

对 `F` 的 6 个容器逐组核对「`回复 X:` 里的 X 是不是同楼里另一条楼中楼的作者」：

```
指向「同楼内另一位楼中楼作者」：16 条
指向本楼楼主：                  0 条
```

例：楼 `967344568`（楼主 `楽淸`）下 `967602539 → MushroomEl`、`967657488 → 张三ER`、
`967671251 → MushroomEl`；楼 `967440554`（楼主 `人生如西游`）下 9 条全部指向同楼其他人。
**16/16 全部命中「同楼内另一个人」**，与源码语义完全一致（`node research/comment-probe-live.mjs replyto`）。

### 最终结论（写进文档的定论）

1. **站点 DOM 确实会渲染 `"回复 用户名:"`**，真机 42 条里有 **16 条**，不是 0 条。
2. 触发条件是 `replyuser` 存在 **且** `replyid !== 本楼楼主的 commentid` —— **16/16 吻合**。
   反向也吻合：`G` 的 11 条里 **10 条 `replyuserid === 楼主 userid`**（即回复楼主）→ DOM 全渲染 `":"`；
   **唯一 1 条 `replyuserid ≠ 楼主 userid` 的（`967572600`，回复 `967425197`）→ DOM 渲染 `回复 墨墨:`**。
   **11/11 双向命中**（`node research/comment-probe-align.mjs`）。
3. 该文本是 `span.children-item__reply-to` 的**纯文本**，**无 `<a>`、无 data 属性 → 拿不到 userid**。
4. `"/bbs/app/link/tree"` 里**「回复楼主」也会带 `replyuser`**（指向楼主本人），
   因此**不能用 `replyuser` 是否存在来判断"有没有回复对象"**，必须比较 `replyid` 与 `rootid`
   （等价的、更省事的判法：比 `replyuserid` 与本楼楼主的 `userid`）。
   这与 `research/comment-cards-spec.md` §1.3 里「`replyuser` 缺失 ⟺ 回复楼主」的表述**不一致**，
   本节的 11 行逐条表是证据；卡片实现若按 `replyuser` 有无来判「回复对象」，
   会把 10/11 条「回复楼主」误显示成「回复 楽淸 / 人生如西游 / …」。
5. 反过来说，**「DOM 里只有 `:`」并不能反推「回复的是楼主」**：
   如果服务端不填 `replyuser`，DOM 同样是 `":"`（§3.2 的原始论断仍然成立）。
   要从这个方向判定，只能靠接口，不能只看 DOM。

## 13.9 其它真机确认项

| 项 | 结论 | 证据 |
| --- | --- | --- |
| 楼中楼行内**没有头像** | 确认。`F` 的 42 行每行 `<img>` 数为 **0**（全 DOM 的 `<img>` 只有 `hb-avatar__image` 一级头像与 `hb-avatar__avatar-decoration`） | `F` `node … images` |
| 楼中楼行内**没有点赞** | 确认。42 行内 `.like-box` 为 **0** | `F` |
| 一级评论行**有头像** | 确认，19/19 行 `.comment-item-header__avatar > img.hb-avatar__image` | `F` |
| 时间格式 | `F`/`H` 全是相对时间（`2小时前` / `48分钟前` / `10小时前`），**没有** `B` 那种 `09-08` 绝对日期 | `F`/`H` |
| IP 文本 | 仍是前导 `·`（`·湖北` / `·广东`） | `F` |
| emoji | `F` 里 `hb-emoji` 出现 **120** 次（= 40 个 `data-emoji` 元素 × 3 次类名出现）、`data-emoji` **40** 个；仍是空 `span` + `data-emoji`；**同一 emoji 会连续重复**（如上文原文里 2 个 `cube_滑稽`、3 个 `cube_哭泣`）—— 说明 service 端就是重复的 token，不是渲染 bug | `F` |
| 同一 emoji 的编号稳定 | `F` 里 21 种 emoji 全部命中固定映射，例：`cube_滑稽 → hb-emoji-cube_34`、`cube_哭泣 → hb-emoji-cube_11`、`cube_doge → hb-emoji-cube_13`、`cube_笑cry → hb-emoji-cube_32`、`cube_黑人问号 → hb-emoji-cube_15` | `F` + `D` 的雪碧图规则 |
| 一级评论行的骨架 | 与 `A` 完全一致（`header[avatar + info-box]` + `content-container[content + #comment + #comment + children]`） | `F` |

---

# 14. 真机网络与回复框（本次新测）

## 14.1 `/bbs/app/link/tree` 响应结构

**端点**：`/bbs/app/link/tree`（`C` 里另有 `/bbs/app/comment/sub/comments`，是子评论分页用的）。

**顶层信封**（`G`，注意是**数组**）：

```jsonc
[ { "status": "ok", "msg": "",
    "result": { /* 见下 */ } } ]
```

**`result` 的元字段**：

| 字段 | 真机值 | 说明 |
| --- | --- | --- |
| `cy_control` | `false` | 是否允许「cy（插眼）」 |
| `show_interact_list` | `false` | |
| `has_more_floors` | `1` | 还有更多楼层 → 与滚动加载对应 |
| `total_page` | `2` | 总页数 |
| `total_floor_num` | `31` | **评论总数**（与 slide-tab 的 `31` 一致，`H` 里 `slide-tab__tab-cnt = 31`） |
| `folded_comment_tips` | `"被折叠的评论包含疑似无意义、广告、不友好的内容"` | 折叠提示文案 |
| `sort_filter` | `[{"key":"hot","text":"热门"},{"key":"time_aes","text":"正序"},{"key":"time_desc","text":"倒序"}]` | **三种排序**（见下） |
| `comments` | `[{ comment: [ 主楼, 楼中楼, 楼中楼, … ] }]` | 每个元素是一条主楼 + 它的（部分）楼中楼 |
| `link` | 文章对象（含 `linkid: 192688392`、`comment_num: 85`、`title`、`user`…） | |

> **重要旁证**：`sort_filter` 给了 `hot` / `time_aes` / `time_desc` 三项，而页面上只渲染了 1 个 tab
> （§6.1 的 `panes` 是单元素数组）。即**「多 tab 排序」是站点有数据、但当前前端只用了一项**。
> 哪天站点开通多 tab，`slide-tab__tab-item` 会变成多个 —— 这正是 §6.1 结论的脆弱点。

**评论本体字段表**（`G` 31 条；「非空」= 该键存在且不为 `null`/`""`）：

| 字段 | 类型 | 出现 | 真机样例 | DOM 里有没有对应物 |
| --- | --- | --- | --- | --- |
| `commentid` | number | 31/31 | `967344568` | ✅ `[data-comment-id]`，**一一对应** |
| `userid` | number | 31/31 | `52788800` | ⚠️ 只能从 `a[href="/app/user/profile/52788800"]` 反解 |
| `user.userid` | string | 31/31 | `"52788800"` | 同上 |
| `user.username` | string | 31/31 | `"楽淸"` | ✅ `.info-box__username` / `.children-item__comment-creator` |
| **`user.avatar`** | string(url) | 31/31 | `https://imgheybox.max-c.com/avatar/2025/09/10/57fb…jpeg?imageMogr2/thumbnail/100x100%3E` | ❌ **楼中楼行里没有头像节点**（42/42 无 `<img>`）；只有一级评论有 |
| `user.avartar` | string(url) | 31/31 | 与 `user.avatar` **逐字相同** | ❌ 同上（**注意这是站点的拼写笔误键**，两个都存在） |
| `user.level_info` | object | 21/31 | `{"status":1,"level":19}` | ✅ `hb-level-tag.hb-level-19` + 文本 `" Lv.19"` |
| `user.avatar_decoration` | string(url) | **3/31** | 头像框 | ✅ `img.hb-avatar__avatar-decoration`（v-if） |
| `user.medals` / `user.medal` | array | 31/31 | 4 个奖章对象（`achieved/wear/level/name/medal_id/description/img_url`） | ❌ **DOM 里没有奖章节点**（`F` 里 `info-box__medals` = 0） |
| `user.is_blacklist` | bool | 31/31（全 `false`） | `false` | ❌ |
| `text` | string | 31/31 | `"刚看到充电媛，感觉三分钟这个时间，符合大多数中年人的水平"` | ✅ 正文文本；但 **emoji 在接口里是 `[cube_滑稽]` 这种 token**（`"这个前几天刚看过[cube_滑稽]说实话拍摄水平一般"`），DOM 里是空 `span[data-emoji="cube_滑稽"]` |
| `create_at` | number(unix 秒) | 31/31 | `1791081820` | ⚠️ DOM 已格式化成相对时间（`10小时前`），**绝对时间戳只有接口有** |
| `ip_location` | string | 31/31 | `"上海"` | ✅ `.info-box__ip` / `.children-item__ip`，但 DOM 里带前导 `·` |
| `child_num` | number | 31/31 | 主楼 `6`/`27`/`9`/`0`…；楼中楼全 `0` | ❌ **DOM 没有总数**（只能数已渲染行或读按钮文案） |
| `up` | number | 31/31 | `199` | ✅ 一级评论 `.like-box__cnt`；❌ **楼中楼行内无点赞节点，`up` 全为 `0`** |
| `is_support` | number | 31/31（**全 `2`**） | `2` | ⚠️ 疑似「未点赞」态；DOM 侧对应 `button.like-box` 无 `active` 类 |
| `is_cy` | number | 31/31（全 `0`） | `0` | ✅ 对应 `.comment-item__content.cy`（`D` 里有规则，`F` 里 0 实例） |
| `is_link_owner` | number | 31/31（**全 `0`**） | `0` | ✅ 对应 `.info-box__writer-tag` / `.children-item__writer-tag`；本页 0 实例 → §13.5 |
| `is_author_award` | number | 31/31（**全 `0`**） | `0` | ✅ 对应 `.comment-item__tag-line`；本页 0 实例 → §13.4 |
| `is_meaningless` | number | 31/31 | `0` | ❌ DOM 里没有对应物（折叠逻辑） |
| `floor_num` | number | 31/31 | 主楼 `2`/`7`/`21`…；**楼中楼全 `0`** | ❌ **DOM 里没有楼层号** |
| `is_top` | number | **4/31**（其余键不存在） | `1` | ⚠️ 对应 `.link-comment__comment-item.top`（`D` 有规则）；`F` 里未验证类名（见下注） |
| `has_more` | number | **20/31**（只有主楼有；`0`×16 + `1`×4） | 主楼 `1` | ⚠️ 决定是否显示「全部 N 条回复」；`F` 展开后全为 `all` |
| `imgs` | array | **1/31**（仅 `967402162`，**该行不在 DOM 里**） | `[{thumb,url,width:1080,height:810,mimetype:"image/webp"}]` | ❌ 结构与卡片图相关；**见 §13.3** |
| `replyid` | number | **11/31**（只有楼中楼） | `967344568` / `967425197` | ❌ DOM 里没有；**判定「回复谁」必须用它 + `rootid`** |
| `replyuserid` | number | 11/31 | `52788800` / `8419673` | ❌ DOM 里没有（只有昵称文本） |
| `replyuser.*` | object | 11/31 | 与 `user` **同构**（含 `avatar` / `userid` / `level_info` / `medals`…） | ⚠️ DOM 只有 `replyuser.username` 的文本（且只在 16/42 行出现） |

> **注（诚实标注）**：`is_top` 有 4 条为 `1`，但**本轮没有去核 `F` 里这 4 行是否带 `.top` 类**
> ——`D` 里 `.link-comment__comment-item.top:after` 有规则，属「有数据 + 有样式、DOM 类名待核」。
> 归入【待真机确认】。
>
> **`up` 的口径**：楼中楼行的 `up` 接口给的是 `0`，DOM 也没有点赞节点。若卡片第一行要显示点赞，
> **只能靠接口**（而且这一页的楼中楼全是 0）。

**`imgs` 的完整形态**（`G` 里唯一一条）：

```jsonc
{ "commentid": 967402162, "user": {"username": "猫娘不吃猫粮", ...},
  "text": "今天刚看完车展就刷到了，车展里面也有这种技术展示",
  "floor_num": 14,
  "imgs": [ { "thumb": "https://imgheybox1.max-c.com/bbs/2026/10/04/64e74cc279ccf45212809691a3e63fd6.webp?imageMogr2/auto-orient/ignore-error/1/thumbnail/850x1450%3E",
              "url":   "同上",
              "width": 1080, "height": 810, "mimetype": "image/webp" } ] }
```

**「接口有的、DOM 没有的」总账**（`F` 的 id 集合 vs `G` 的 31 条）：
`G` 31 条里**只有 1 条不在 `F` 里** —— 就是上面这条带图的 `967402162`。
所以「接口 31 条 ⊂ DOM 42+N 行」这个方向基本是满的；反过来 DOM 有 31 条接口没有（后续分页）。

## 14.2 回复框两态（纸飞机要驱动的目标）

素材 `I`（`live-replybox.json`：`first` = 展开态、`second` = 收起态、`collapsed` = 触发收起的事件记录）
与 `J`（`live-reply-open.json`：四步交互快照）。

### 收起态（`I.second`）

```html
<div class="link-reply collapse link-comment__reply" data-reply_wrapper="true">
  <div class="link-reply__main-box">
    <div class="link-reply__input-wrapper">
      <div class="link-reply__editor link-reply__input">
        <div contenteditable="true" translate="no" class="ProseMirror hb-editor" style=""><p><br class="ProseMirror-trailingBreak"></p></div>
      </div>
      <div class="link-reply__placeholder">评论 (已有85条评论)</div>
      <!----><!---->
    </div>
    <div class="link-reply__operation-box">…点赞 / 收藏 / 评论数…</div>
  </div>
</div>
```

- `boxClassList = ["link-reply","collapse","link-comment__reply"]`
- `getBoundingClientRect().height = 60`
- **没有 `.link-comment__target-box`**、**没有 `.link-reply__menu-box`**、**没有「发送/取消」**
- `input-wrapper` 末尾是 **2 个 `<!---->`**（菜单区 + 图片区的 v-if 占位）
- `link-reply__placeholder` 文本 = `评论 (已有85条评论)`，`85` 来自 `link.comment_num`（`G` 里确实 `85`）

### 展开态（`I.first`）

```html
<div class="link-reply expand link-comment__reply" data-reply_wrapper="true">
  <div class="link-comment__target-box">
    <div class="hb-cpt-avatar link-comment__target--avatar" style="--hb-avatar-size: 24px; --hb-avatar-deraction-size: 38px;">
      <img class="hb-avatar__image" src="https://imgheybox.max-c.com/avatar/2025/09/10/57fb…jpeg?imageMogr2/thumbnail/100x100%3E" alt=""><!---->
    </div>
    <p class="link-comment__target--comment">刚看到充电媛，感觉三分钟这个时间，符合大多数中年人的水平</p>
  </div>
  <div class="link-reply__main-box">
    <div class="link-reply__input-wrapper">
      <div class="link-reply__editor link-reply__input">
        <div contenteditable="true" translate="no" class="ProseMirror hb-editor ProseMirror-focused" style=""><p><br class="ProseMirror-trailingBreak"></p></div>
      </div>
      <div class="link-reply__placeholder">评论 (已有85条评论)</div>
      <!---->
      <div class="link-reply__menu-box">
        <button class="link-reply__menu-item emoji"><i class="hb-icon">…</i><!----></button>
        <!---->
        <button class="link-reply__menu-item cy"><i class="hb-icon">…</i></button>
        <button class="link-reply__menu-btn hb-color__btn--confirm">发送</button>
        <button class="link-reply__menu-btn hb-color__btn--cancel">取消</button>
      </div>
    </div>
    <!---->
  </div>
</div>
```

- `boxClassList = ["link-reply","expand","link-comment__reply"]`
- `height = 127`（**60 → 127**，与 `FINDINGS.md` 十六节的实测数字一致）
- **`.link-comment__target-box` 插在 `.link-reply__main-box` 之前**，内含
  `.hb-cpt-avatar.link-comment__target--avatar`（24px）+ `p.link-comment__target--comment`
- `.link-reply__menu-box` 里按顺序：`emoji` → （图片位空 `<!---->`）→ `cy` → **发送** → **取消**
- 根 class 从 `collapse` 变 `expand`；`ProseMirror` 上多出 **`ProseMirror-focused`**
- **取消入口**：`button.link-reply__menu-btn.hb-color__btn--cancel`（`I.collapsed` = `"clicked link-reply__menu-btn hb-color__btn--cancel"`）

> ⚠️ **一处与现有文档的差异**：`C`（站点源码）里菜单项是
> `emoji` / `image` / `cy` 三个按钮，且 `image` 的渲染条件是 `menus.includes("image")`；
> `I.first` 里 image 位是空 `<!---->`。原因在 `C` 的 `f = computed(() => ["emoji","cy",!h&&!r&&"image"].filter(Boolean))`
> —— **已经在回复某人时（有 replyTarget）就不再提供「发图」**。这是站点行为，不是快照缺失。

### 「点楼中楼 → 引用文本等于所点那条正文」的实测（`J`）

`probe-reply-open.mjs` 用真实点击依次做了四步，`J` 是逐字记录：

| 步骤 | 回复框根 class | `target--comment` 文本 | 发送按钮 | `document.activeElement` |
| --- | --- | --- | --- | --- |
| `initial` | `link-reply collapse link-comment__reply` | `null` | 无 | `BODY` |
| `after-child-click`（点第一条 `.comment-children-item`） | `link-reply expand link-comment__reply` | `这个前几天刚看过说实话拍摄水平一般` | **有，可见** | `ProseMirror hb-editor ProseMirror-focused` |
| `after-main-click`（点第一条 `.comment-item__content`） | `link-reply expand link-comment__reply` | `刚看到充电媛，感觉三分钟这个时间，符合大多数中年人的水平` | **有，可见** | `ProseMirror hb-editor ProseMirror-focused` |
| `after-typing`（在编辑器里敲字） | 同上（不变） | 同上（不变） | 有 | 同上 |

**三方对齐（`node research/comment-probe-align.mjs`）**，把「被点的行」与「引用文本」逐字比对：

```
probe-reply-open.mjs 点的第一条 .comment-children-item = DOM 里的 967363978
  该行作者（DOM）  = "夏柒"
  该行正文（DOM）  = "这个前几天刚看过说实话拍摄水平一般"
  接口该条 username = "夏柒"
  接口该条 text     = "这个前几天刚看过[cube_滑稽]说实话拍摄水平一般"
  回复框引用文本     = "这个前几天刚看过说实话拍摄水平一般"
  引用文本 == 该行正文？            true      ← 逐字一致
  行内正文（去 emoji）== 接口 text？ false     ← 因为接口 text 里的 [cube_滑稽] token 在 DOM 里是空 span
```

```
DOM 第一条一级行 = 967344568
  行正文（DOM） = "刚看到充电媛，感觉三分钟这个时间，符合大多数中年人的水平"
  接口 text     = "刚看到充电媛，感觉三分钟这个时间，符合大多数中年人的水平"
  回复框引用文本 = "刚看到充电媛，感觉三分钟这个时间，符合大多数中年人的水平"
  引用 == 行正文？ true
```

**引用区头像也对得上**：

```
target--avatar 的 img src        = …/57fb7c02902a1e726b1fb6d71812b6fe.jpeg?imageMogr2/thumbnail/100x100%3E
接口第一条一级评论 user.avatar    = 同上 → 相同
点楼中楼后的引用头像（J）           = …/wx/1629609608/8dd8767dc81350d9e31edd957fa438f7?…%3E
接口第一条楼中楼 user.avatar        = 同上 → 相同
```

**结论（对纸飞机实现直接用得上的三条）**：

1. **点楼中楼行 → 引用文本 = 该行正文（逐字一致）**，`target--comment` 与 `target--avatar` 都对得上
   —— 站点原生「回复楼中楼」是可用的，**不需要自写输入框**。
2. 引用文本是 **DOM 文本**（`innerText`/引用渲染时 emoji 不参与文本），
   而接口 `text` 里 emoji 是 `[cube_滑稽]` token —— **两者不能直接字符串比较**，
   要比较得先把 token 去掉或改用 DOM 文本。
3. 展开后 `document.activeElement` 是 `DIV.ProseMirror.hb-editor.ProseMirror-focused`
   —— 与 `FINDINGS.md` 十六节「焦点被抢」是同一件事。
   **纸飞机的实现必须在合成 click 之后接受焦点转移**（现有 `src/reply-btn.ts` 的做法就是这样，
   `E` 16.2/16.3 已验：站点处理器不检查 `isTrusted`）。

---

# 15. DOM 结构的迭代参考索引

> 给后续做功能的人：**「我要改 X」→ 看哪一节 / 用哪个选择器 / 小心哪个坑**。
> 「稳定性」一列：**A** = 站点数据契约（`data-comment-id`、Vue key）；**B** = 站点 class 名（组件级，改版会动）；
> **C** = 站点私有 computed / 内部状态（最易变）；**D** = 本站脚本自己注入的（可控）。

## 15.1 按「要改什么」查

| 我要改 / 加的东西 | 看哪节 | 首选选择器 | 稳定性 | 必看的脆弱点 |
| --- | --- | --- | --- | --- |
| **楼中楼卡片化（本迭代主目标）** | §3、§5、§10.1、§14.2 | 行 `.comment-children-item[data-comment-id]` | A+B | §10.1-2（展开会整容器重渲染）、§10.3-16（整行是热区） |
| 楼中楼卡片第一行：头像 | §4.2、§13.9、§14.1 | **DOM 里没有** → 必须走 `getThreadMeta()`/接口 `user.avatar` | — | §13.9（42/42 行无 `<img>`）；降级块必须可用 |
| 卡片第一行：回复对象 | §3.2、§13.8、§14.1 | 站点 `.children-item__reply-to` 文本（仅 16/42 行有） | B | §13.8 结论 4：**不能用 `replyuser` 是否存在判断，要比较 `replyid` 与 `rootid`** |
| 卡片第一行：时间 / IP | §4.2、§13.9 | `span.children-item__other-info > .children-item__create-time` / `.children-item__ip` | B | §10.2-8（相对/绝对两种格式）、§10.2-9（`·` 前缀） |
| 卡片正文（含 emoji / 换行 / 图片） | §4.3、§4.4、§13.9 | `p.children-item__comment-content` | B | §10.1-4（`innerHTML` + DOMPurify 白名单）、§10.2-11（真换行 `\n`）、emoji 是空 `span` 靠 CSS 背景 |
| 卡片末尾：纸飞机按钮 | §14.2、§7、§8.4 | 落在行内（站点 4 个子节点**之后**） | A（自己插的） | §10.3-16/17/18（整行热区 / 图片弹框拆不开 / 合成 click 依赖 `isTrusted`） |
| 点纸飞机 → 弹站点回复框 | §14.2、§8.3 | `div[data-reply_wrapper="true"]` → 展开后 `.link-comment__target--comment` | A | §14.2 结论 3（焦点被抢到 ProseMirror）；**不要自写输入框** |
| 展开楼中楼（「全部 N 条回复」） | §5.1–5.3、§13.6 | `button.comment-children__load-all` | C | §10.1-2（点击后整容器重渲染）、§10.1-3（三态是私有 computed） |
| 一级评论加自己的按钮 | §9.1、§8.3 | `.comment-item-header__operation-box`（与 `button.like-box` 并排） | B | §10.3-16；现有 `src/reply-btn.ts` 已这么做 |
| 楼中楼加自己的按钮 | §9.1、§8.3 | `span.children-item__other-info` 之后 | B | 同上 |
| 拦截「点整行弹回复框」 | §8.1–8.4 | 行节点本身（两级行） | A+B | §10.3-16/17；`src/reply-btn.ts:100-114` 的放行规则是现成的 |
| 深色模式覆盖评论区 | §5.2、§1、§10.4-21 | `.link-comment` 及其子节点 | B | §10.4-21（真机素材自带 `data-hb-dark-*` 内联 `!important`，别被带偏） |
| 精简模式隐藏某块 | §1、§6.3 | `.link-comment` / `.link-comment__list` | B | §10.4-23（列表末尾的登录提示**不在** `.link-comment` 里） |
| 统计评论数 | §6.1、§14.1 | `div.slide-tab__tab-cnt`（=`total_floor_num`） | B+C | §6.1（只有 1 个 tab；`sort_filter` 有 3 项，将来可能变多） |
| 判断「评论是否加载完」 | §6.2、§6.3 | `has_more_floors`（接口）/ `.scroll-list__no-more-desc`（DOM） | B | §6.2/§6.3（滚动哨兵在快照里不可见；`no-more-desc` 至今无实例） |
| 取某条评论的精确数据（含头像） | §14.1 | 接口 `/bbs/app/link/tree` + `/bbs/app/comment/sub/comments` | A | §13.1（**一次响应覆盖不了整页**，必须按 id 查缓存） |

## 15.2 按「锚点稳不稳」查

**首选（数据契约，越用越安全）**

```
[data-comment-id]                                          ← 两级行都有，Vue key + 数据契约
div[data-reply_wrapper="true"]                             ← 回复框，全局唯一
.comment-children-item  /  .link-comment__comment-item      ← 行（class 名硬编码在站点源码里）
.link-comment__comment-children                             ← 楼中楼容器（v-if，有楼中楼才在）
.children-item__comment-creator[href]                       ← 楼中楼作者链接（行内唯一的 <a>）
p.children-item__comment-content                            ← 楼中楼正文
span.children-item__reply-to                                ← 回复对象（纯文本！）
span.children-item__other-info                              ← 时间 / IP
.comment-item-header__operation-box                         ← 一级评论操作条
.comment-item__content-container                            ← 一级评论正文区
.comment-item__content                                      ← 一级评论正文
span.hb-emoji[data-emoji]                                   ← emoji（语义只在 data-emoji）
```

**谨慎（可用，但必须带兜底）**

| 选择器 | 为什么谨慎 |
| --- | --- |
| `.link-comment__comment-children.can-load` | `can-load` 是**私有 computed 的副产物**（§5.1），只等于「不是 all」 |
| `button.comment-children__load-all` | 只在非 `all` 态存在；文案随 `less`/`can_load` 变（§5.3） |
| `div.slide-tab__tab-item` | 目前恒为 1 个且 `active`；`sort_filter` 有 3 项，将来可能变多（§6.1、§14.1） |
| `.comment-item__image-box` / `.comment-item__image-wrapper` | **至今无实例**（§13.3） |
| `.comment-item__tag-line` / `.comment-item__writer-like` | **至今无实例**，且 `is_author_award` 全 0（§13.4） |
| `.info-box__writer-tag` / `.children-item__writer-tag` | 一级评论形态**至今无实例**；楼中楼只有 `B` 一个样本（§13.5） |
| `.link-comment__comment-item.top` | 接口有 4 条 `is_top=1`，但**未核 DOM 类名**（§14.1 注） |
| `div.scroll-list__no-more-desc` / `div.scroll-list__to-login` | 在 `.link-comment` **之外**（§6.3、§10.4-23） |
| `button.like-box.active` | 已点赞态，`is_support` 全为 `2`（§14.1） |

**不要当锚点**

- 任何 `data-v-XXXXXXXX`：评论节点上**一个都没有**（§9.3）。
- `<!---->` 注释的**序号** —— 但要注意**它的存在本身是可靠的**：
  楼中楼行**恒有 2 个**（`is_link_owner` 位 + `schoolmate-tag` 位），
  真机 `F` 42/42、`H` 5/5 都是 2 个（§13.1）；一级评论 `content-container` 里有 2 个（图片位 + 标签位）。
- **`.can-load` 当业务状态**：它只表示「不是 all」，别推「还有更多」（§10.1-3）。
- **接口 `replyuser` 的有无当「有没有回复对象」**：错，见 §13.8 结论 4。
- 本站脚本注入的 `data-hb-dark-fg` / `data-hb-dark-bg` / `style="…!important"` / `data-hb-own`：
  都不是站点结构（§9.3、§12）。

## 15.3 一句话版「卡片化前必须知道的 6 件事」

1. **楼中楼行在 DOM 里没有头像**（42/42 无 `<img>`）—— 卡片第一行的头像必须走接口/缓存，且要能降级。
2. **回复对象是纯文本、无 userid**，且 42 行里只有 16 行有；「直接回复楼主」时 DOM 只给 `":"`
   —— 补「回复 @某人」必须靠 `replyid` vs `rootid`（不是 `replyuser` 有无）。
3. **点「全部 N 条回复」会让站点重渲染整个容器** —— 自定义节点要幂等 + MutationObserver 兜底，
   且观察器回调里不能再写 DOM（回环）。
4. **两级评论整行都是点击热区**（点正文/时间/空白都弹回复框）—— 卡片若吃掉点击，必须自己补回复入口。
5. **点图片会连带弹回复框，事件层面拆不开** —— 想「卡片不被点击打扰」就只能连大图一起拦。
6. **合成 click 能驱动站点原生回复框**，并且引用文本与所点行正文逐字一致（§14.2 已三方对齐）
   —— 纸飞机复用站点回复框是可行的，**不要自写输入框**。
