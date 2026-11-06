# Era Cards & Era Bonus · 时代卡与加成数据（Data）

> 来源：`server/data/game_data.ts` 中 `eraCards`；加成常量 `server/config/eraBonus.ts`；抽取逻辑 `server/logic/eraLogic.ts`。

## 时代卡池（5 张，一局只用 4 张）

| id | 名称 | 主题(era) | 主题色 | 描述 |
|---|---|---|---|---|
| 1 | 蔚蓝星球计划 | 气候 | green | 全球聚焦气候行动 |
| 2 | 数字星河时代 | 科技 | blue | 信息技术爆发 |
| 3 | 多元文明交响 | 文化 | red | 文化交流与认同 |
| 4 | 生命活力运动 | 健康 | orange | 全民健康意识提升 |
| 5 | 心灵觉醒浪潮 | 心理 | yellow | 心理健康成为核心议题 |

- **抽取机制**：开局 `eraSequence = shuffle([0,1,2,3,4])`；每进入一个新时代，取 `eraSequence[currentEra-1]` 作为卡 id（`+1` 映射到上表）。
- 一局 4 个时代，故 **5 张主题卡中有 1 张整局不出现**。
- 主题用于「时代加成」判定：项目 `era` 字段与当前时代卡 `era` 一致才算契合。

## 时代加成（Era Bonus）
- 常量：`ERA_BONUS_POOL_SHORT = 50`、`ERA_BONUS_POOL_LONG = 100`（`server/config/eraBonus.ts`）。
- 发放条件（同时满足）：
  1. 项目类型 short 或 long（**风险永不参与**）；
  2. `project.era === 当前时代卡.era`（时代契合）；
  3. 为**第一名并列组**（并列时组内均分 `floor(eraPool / 组人数)`）；
  4. 短期须「恰好满额」（投资失败没有），长期须「累计达到或超过上限（含超额）」。
- 时代加成属正向收益，**受点石成金按 1.5 倍放大**（仅正项）。
- 历史实现 `server/logic/eraBonus.ts` 已 `@deprecated`，实际以 `projectSettlement.applyRankAndEraBonus` 为准（加财富，非 achievement）。

## 时代 / 轮次结构
- 4 个时代，每个时代 2 轮 = **8 个全局回合**（globalRound 1→8）。
- 换代触发：`roundInEra > 2`（某时代第 2 轮结算结束后）。
- 时代卡在每代第 1 轮（`roundInEra === 1`）抽取并生效。
