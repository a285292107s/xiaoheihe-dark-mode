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

## 决策记录放哪

| 记录类型 | 什么算 | 放到哪 |
|---|---|---|
| 使用者的契约 | 开关与默认值、偏好键、控制台接口、状态出口 | 根 [README.md](../README.md) 的「使用」「状态出口」 |
| 口径与不变量 | 字段含义、颜色角色、跨文件耦合；违反后不报错、只是悄悄出错 | 对应功能的领域文档：[comment-card-spec.md](comment-card-spec.md)、[comment-ui.md](comment-ui.md)、[dark-engine.md](dark-engine.md) |
| 架构取舍 | 为什么这样分层、为什么不用更简单的方案 | [dark-engine.md](dark-engine.md)、[comment-ui.md](comment-ui.md)；两者都不覆盖时新建领域文档，并在本索引登记 |
| 难逆转的决定 | 推翻后要重写实现或改变对外行为 | `adr/NNNN-短名.md`；首次出现时创建 `adr/` 目录，并在本索引登记 |
| 踩过的坑 | 已知限制、降级路径、真机实测的例外 | [known-limits.md](known-limits.md) |

新增、移动文档或新增 ADR 后，先更新本索引再提交。

> 这份标准与审计报告里引用的 `scripts/verify-award.mjs`、`npm run verify:*` 已不在仓库中
> （见根目录 [AGENTS.md](../AGENTS.md) 的说明），两份文档现在是**历史记录**：
> 判据口径与实测数字仍然可读，但不要照着跑。
