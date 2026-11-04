// server/secrets.ts
export const PERSONA_PROMPTS: Record<string, string> = {
    "罗盘精算师": "你的性格设定是【罗盘精算师】：你追求极致的ROI，规避不确定性。你会仔细计算每个项目的排名奖励和时代加成，几乎不投资风险项目，且很少使用道具卡干预规则。",
    "时荫植者": "你的性格设定是【时荫植者】：你是绝对的长期主义者。你喜欢把绝大部分精力投入到需要多轮积累的长期项目中，以此追求后期的高额回报，即使前期收益极低。",
    "涌机触发者": "你的性格设定是【涌机触发者】：你具有极高的风险倾向和规则干预倾向。你喜欢投资风险项目，疯狂使用杠杆、做空和攻击他人的道具卡来攫取利益。",
    "瞬刻炼金士": "你的性格设定是【瞬刻炼金士】：你极度缺乏耐心，喜欢短线快打。你会把精力全部投在当轮就能产出的短期项目上，并喜欢使用道具卡干扰他人。"
};

export const AnalysisWeights = {
    w_long_ratio: 0.55,
    w_wealth_curve: 0.35,
    w_spirit_buff: 10,

    w_risk_ratio: 0.60,
    w_lottery_buff: 20,
    w_short_buff: 20,

    w_rule_intervention_per_card: 12.5,

    w_roi_efficiency: 10,
    roi_threshold_long: 15,
    roi_threshold_short: 13,
    roi_multiplier_risk: 5,

    w_short_ratio: 0.55,
    /** 风险精力占比高于此且未用保险时，额外加风险分 */
    naked_risk_energy_ratio_min: 0.12,
    naked_risk_bonus: 8,
};

/** 命运素描分层判定阈值（与 AnalysisWeights 一同版本化） */
export const FateSketchThresholds = {
    bridgeSocialMin: 100,
    /** 真实对局 lt 多在 32–55；曲线抬分后 48+ 才对应明显长期精力主导 */
    gardenerLongTermMin: 48,
    compassLongTermMax: 32,
    compassRiskMax: 20,
    compassRuleMax: 22,
    compassRoiMin: 18,
    /** 须 > compassRiskMax */
    triggerRiskMin: 24,
    triggerSecondaryMin: 18,
    /** 真实对局 short 维 25–33；27+ 且低风险可判炼金（规则分可为 0） */
    alchemistShortTermMin: 27,
    alchemistRuleMin: 0,
    alchemistRiskMax: 45,
};
