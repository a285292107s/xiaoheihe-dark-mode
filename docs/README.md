# 文档索引

| 文档 | 内容 |
|---|---|
| [comment-ui.md](comment-ui.md) | 评论区三层（复制解锁 / 评论免打扰 / 楼中楼卡片化）的实现原理与取舍 |
| [comment-card-spec.md](comment-card-spec.md) | 楼中楼卡片的版式、字段口径与「为什么是 flex 不是 grid」 |
| [dark-engine.md](dark-engine.md) | 深色引擎的架构决定：为什么改写字面量、为什么单调映射、怎么调配色 |
| [AWARD-STANDARD.md](AWARD-STANDARD.md) | 评论区 UI 的验收标准：奖项口径翻译成可度量判据 + 打分模型 |
| [AUDIT-comment-ui.md](AUDIT-comment-ui.md) | 按上述标准做的审计报告（基线缺陷清单与修复复验） |
| [known-limits.md](known-limits.md) | 完整已知限制，按功能分组 |

项目总览与安装使用见根目录 [README.md](../README.md)。

> 这份标准与审计报告里引用的 `scripts/verify-award.mjs`、`npm run verify:*` 已不在仓库中
> （见根目录 [AGENTS.md](../AGENTS.md) 的说明），两份文档现在是**历史记录**：
> 判据口径与实测数字仍然可读，但不要照着跑。
