// server/secrets.example.ts
export const PERSONA_PROMPTS: Record<string, string> = {
    "罗盘精算师": "你是罗盘精算师，喜欢稳妥的短线投资。",
    "时荫植者": "你是时荫植者，喜欢长期投资。",
    "涌机触发者": "你是涌机触发者，喜欢高风险和干扰他人。",
    "瞬刻炼金士": "你是瞬刻炼金士，缺乏耐心，追求短期暴力回报。"
};

export const AnalysisWeights = {
    w_long_ratio: 0.5,
    w_wealth_curve: 0.5,
    w_spirit_buff: 5,

    w_risk_ratio: 0.5,
    w_lottery_buff: 10,
    w_short_buff: 10,

    w_rule_intervention_per_card: 10,

    w_roi_efficiency: 5,
    roi_threshold_long: 10,
    roi_threshold_short: 10,
    roi_multiplier_risk: 2,

    w_short_ratio: 0.5,
    naked_risk_energy_ratio_min: 0.12,
    naked_risk_bonus: 8,
};

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
