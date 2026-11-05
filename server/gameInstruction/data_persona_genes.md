# Persona & Decision Genes · 人格与决策基因数据（Data）

> 来源：`server/logic/personaConfig.ts`（命运素描 / 决策基因）、`server/secrets.ts`（权重与阈值）、`server/logic/analysisLogic.ts`（维度计算）、`server/logic/personaMetrics.ts`（干预卡权重）。

## 1. 命运素描（6 类，玩家可见）
局末按维度分数映射为以下一种：

| 名称 | 简介 |
|---|---|
| 桥梁架构师 | 编织人际联结与信任网络，靠协作拿单人无法企及的机会；关系即资源。 |
| 瞬刻炼金士 | 偏好见效迅速的短期机会，重视本轮落袋的周转收益，善用卡牌抢占行动空间。 |
| 罗盘精算师 | 规避毁灭性回撤的高风险，无意干预他人，在规则内审慎推演、谋定后动。 |
| 时荫植者 | 深耕需漫长周期兑现的长期布局，忍耐前期缓慢收益，默默培育未来回报。 |
| 随机诗人 | 不被单一框架束缚，长线/短线/扰动交替，走出贴合直觉、无法复刻的路径。 |
| 涌机触发者 | 重仓高风险，善用杠杆、做空与干扰卡，在动荡不确定性中捕捉机会。 |

## 2. 决策基因（16 型，T·R·D·M 四轴）
四轴编码：
- **Time** `L`(长线) / `Q`(短线)
- **Risk** `A`(激进) / `G`(稳健)
- **Disruption** `D`(干预) / `C`(顺应)
- **Motivation** `V`(利益) / `R`(社交)

| 编码 | 名称 |
|---|---|
| LADV | 长线激进·颠覆操盘手 |
| LADR | 长线激进·创变布道者 |
| LACV | 长线顺势·冷酷寡头 |
| LACR | 长线顺势·理想领袖 |
| LGDV | 长线稳健·破局精算师 |
| LGDR | 长线稳健·社群架构师 |
| LGCV | 长线稳健·隐忍守望者 |
| LGCR | 长线稳健·温和共建人 |
| QADV | 短线激进·高频投机客 |
| QADR | 短线激进·街头弄潮儿 |
| QACV | 短线顺势·极限套利者 |
| QACR | 短线顺势·激进交际花 |
| QGDV | 短线稳健·微操破坏王 |
| QGDR | 短线稳健·游击公关 |
| QGCV | 短线顺应·无情螺丝钉 |
| QGCR | 短线顺应·老好人 |

## 3. 维度测量（computePersonaDimensions）
| 维度 | 计算 |
|---|---|
| longTermism（长线） | 长期精力占比 × `w_long_ratio(0.55)` + 财富曲线平稳度 × `w_wealth_curve(0.35)` + 精神卡 `w_spirit_buff(10)` |
| shortTermism（短线） | 短期精力占比 × `w_short_ratio(0.55)` |
| riskTaking（风险） | 风险精力占比 × `w_risk_ratio(0.60)` + 彩票/做空卡加成(`w_lottery_buff/w_short_buff=20`) + 裸奔(`naked_risk_bonus=8`，当占比 ≥ `naked_risk_energy_ratio_min=0.12` 且无保险) |
| ruleIntervention（干预） | `Σ(所用干预卡权重) × w_rule_intervention_per_card(12.5)` |
| socialConnection（社交） | 直接映射 `socialRank`：A=100 / B=80 / C=60 / D=40 / E=20 |
| resourceConversion（资源转化） | 超额 ROI（长>15、短>13、风险×5）占精力比例 × `w_roi_efficiency(10)` |

### 干预卡权重（RULE_INTERVENTION_CARD_WEIGHTS）
摸鱼传染 1.5 / 做空 1.4 / 彩票 1.3 / 金 0.8 / 保险 0.2
> 旧卡「反弹」「精神」已退役；代码仍保留其权重，仅用于分析历史归档，不参与新局。

## 4. 命运素描分层阈值（FateSketchThresholds）
| 阈值 | 值 | 含义 |
|---|---|---|
| bridgeSocialMin | 100 | 社交满分 → 桥梁架构师 |
| gardenerLongTermMin | 48 | 长期分 ≥48 → 时荫植者 |
| compassLongTermMax | 32 | 罗盘长期分上限 |
| compassRiskMax | 20 | 罗盘风险分上限 |
| compassRuleMax | 22 | 罗盘干预分上限 |
| compassRoiMin | 18 | 罗盘 ROI 下限 |
| triggerRiskMin | 24 | 涌机风险下限（须 > compassRiskMax） |
| triggerSecondaryMin | 18 | 涌机次要维度（干预或 ROI）下限 |
| alchemistShortTermMin | 27 | 炼金短线下限 |
| alchemistRuleMin | 0 | 炼金干预下限 |
| alchemistRiskMax | 45 | 炼金风险上限 |

判定顺序（analysisLogic.classifyFateSketch）：社交满分→桥梁；长期≥48→时荫植者；风险≥24 且(干预或ROI≥18)→涌机触发者；短线≥27 且风险≤45→瞬刻炼金士；风险≤20 且干预≤22 且 ROI≥18 且长期≤32→罗盘精算师；其余→随机诗人。

## 5. MBTI 四轴计算（calculateMbtiPersona）
- `longShortScore = (longRatio − shortRatio) × 100`：≥0 → `L`，否则 `Q`
- `riskConservScore`：≥50 → `A`（激进），否则 `G`
- `disruptFollowScore`：≥50 → `D`（干预），否则 `C`
- `profitSocialScore = roi − social`：≥0 → `V`（利益），否则 `R`
- 各轴百分比由 `50 ± score/2` 推得，组合成四字母 `code`（T·R·D·M）。

## 6. AI 人格提示词（仅旧局 / 兼容路径）
- 产品版 AI **不预设人格**：`server/ai/aiPrompt.ts` 只给规则、目标与当前观察，由模型自由发挥。
- 旧局或显式指定人格时仍保留四种倾向：罗盘精算师（极致 ROI、规避风险）、时荫植者（长期主义）、涌机触发者（高风险高干预）、瞬刻炼金士（短线快打、干扰）。
- `autoTuner` 用固定 6 槽位（罗盘/时荫/涌机/炼金/罗盘/时荫）跑完整局，局末比对「真值 vs 推断」做爬山式调参；这是内部数值校准，不是产品版 AI 的默认行为。
