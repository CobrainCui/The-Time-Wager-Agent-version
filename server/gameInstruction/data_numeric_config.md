# Tuning Constants · 数值配置（Data）

> 来源：`server/config/*`、`server/logic/*`、`server/state/actionDeadline.ts`。汇总对局运行所需的全部标量常量。

## 财富与精力
| 常量 | 值 | 出处 |
|---|---|---|
| 开局财富 `STARTING_WEALTH` | 100 | config/startingWealth.ts |
| 咖啡财富消耗 `COFFEE_WEALTH_COST` | 17 | logic/coffeeLogic.ts |
| 咖啡精力增益 `COFFEE_ENERGY_GAIN` | 1 | logic/coffeeLogic.ts |

### 精力表（按开局在线人数定档，同代两轮相同）
| 人数 | 轮1 | 轮2 | 轮3 | 轮4 |
|---|---|---|---|---|
| 6 人 | 15 | 13 | 11 | 9 |
| 5 人 | 18 | 16 | 13 | 11 |
| 4 人 | 23 | 20 | 16 | 13 |

- 全场总精力守恒：4 人 = 576，5 人 = 580，6 人 = 576（不符则启动报错）。
- 投资开始后才进房者本轮精力为 0。

## 倒计时
| 常量 | 值 |
|---|---|
| 投资倒计时 `ACTION_DEADLINE_MS` | 10 分钟 |
| 时代1轮1 `ACTION_DEADLINE_ERA1_R1_MS` | 12 分钟 |
| 道具锁定窗口 `BUFF_LOCKOUT_REMAINING_MS` | 2 分钟（剩余 ≤2 分钟禁道具） |
| 时钟同步间隔 `INVESTMENT_CLOCK_SYNC_MS` | 15 秒 |

## 项目 / 结算
| 常量 | 值 |
|---|---|
| 短期基础回报 | 投入 ×10（仅本轮投资者） |
| 长期基础回报 | 累计投入 ×15（所有历史投资人） |
| 风险基础回报 | 投入 ×20（成瘾/完美/幸福 ×25） |
| 时代加成池 短/长 | 50 / 100 |
| 点石成金倍率 | 1.5（向下取整，仅正项） |
| 保险赔付 | 100（有金 150） |
| 长期放弃阈值 `LONG_CONTINUE_MIN_ENERGY` | 本轮投入 < 3 |
| 第四时代梯度比例 | 1:1 / 1:5（≥1/3）/ 1:10（≥2/3） |

## 拍卖
| 常量 | 值 |
|---|---|
| 起拍价 `AUCTION_STARTING_BID` | 5 |
| 加价步长 `AUCTION_BID_INCREMENT` | 5 |
| 拍卖场次 | 3 场（进 2/3/4 时代） |
| 强买强卖 | 每张仅一次，免费拿焦点卡 |

## 排名奖缩放（rankRewardSchedule.ts）
- `resolveRankRewardTierCount`：1–3 人 → 5 人档；4 人 → 4 档；5 人 → 5 档；6 人 → 6 档。
- `scaleRankRewardsForPlayerCount`：4/5 人时按权重 `(N−i)` 重新分配，**保持总池与 6 人版一致**且强制**非递增**（`enforceNonIncreasing`）。
- 模块加载时 `assertCatalogRankRewards()` 断言所有图鉴卡缩放后 sum 与档位合规。

## 群聊（默认关闭）
| 常量 | 值 |
|---|---|
| `GROUP_CHAT_ENABLED` | false |
| 每玩家最多群数 `MAX_CUSTOM_GROUPS_PER_PLAYER` | 6 |
| 每房最多群数 `MAX_CUSTOM_GROUPS_PER_ROOM` | 24 |
| 每群最多消息 `MAX_MESSAGES_PER_GROUP` | 500 |
| 禁建群阶段 | ROOM_WAITING / ERA_INTRO / TUTORIAL |

## 特性开关（config/features.ts 等）
| 开关 | 默认 |
|---|---|
| `AI_BOT_ENABLED` | false |
| `GROUP_CHAT_ENABLED` | false |
| 教程页数 `TUTORIAL_SLIDE_COUNT` | 8 |
| 教程最大步 `TUTORIAL_MAX_STEP` | 7 |
| 人格立绘白名单 | Bridge / Moment / Navigator / Planter / Poet / Wave（对应 6 类命运素描） |

## 数据留存 / 导出
- 行为数据走 `sessionTelemetry` 事件流；命局存 `server/data/session_archive.json`（唯一真相源）。
- 社区财富榜由档案派生，不再单独落盘。
- 导出 schema 版本 `exportSchemaVersion = 1.3.0`。
