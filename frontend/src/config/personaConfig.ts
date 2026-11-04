/** 命运素描六类在 UI / 终局页中的主题色 */
export const FATE_SKETCH_IMAGE_SLUG: Record<string, string> = {
  "桥梁架构师": "Bridge",
  "瞬刻炼金士": "Moment",
  "罗盘精算师": "Navigator",
  "时荫植者": "Planter",
  "随机诗人": "Poet",
  "涌机触发者": "Wave",
};

export const PERSONA_IMAGE_SLUGS = Object.values(FATE_SKETCH_IMAGE_SLUG);

/** 命运素描主题色：取自各人格立绘（pdf_templates/{slug}），与 FATE_SKETCH_IMAGE_SLUG 对应 */
export const FATE_SKETCH_PERSONA_COLORS: Record<string, string> = {
  /** Navigator · 星图/桌面浅钢青 */
  "罗盘精算师": "#6ba3d6",
  /** Planter · 林木苍绿（保持原 UI 绿） */
  "时荫植者": "#10b981",
  /** Wave · 暗夜海浪深蓝 */
  "涌机触发者": "#1e3d6b",
  /** Moment · 沙漏与画框古金 */
  "瞬刻炼金士": "#c9a227",
  /** Bridge · 金桥、花叶暖黄 */
  "桥梁架构师": "#d4a017",
  /** Poet · 撕纸褐底、封面橙红 */
  "随机诗人": "#c25a3a",
};

/** 玩家可见命运素描简介；须与 server/logic/personaConfig.ts 中 FATE_SKETCH_CONFIG 保持一致 */
export const FATE_SKETCH_CONFIG: Record<string, { name: string; desc: string }> = {
  "桥梁架构师": {
    name: "桥梁架构师",
    desc: "你擅长在博弈场中编织人际联结与信任网络，依靠协作拿到单人无法企及的机会。对你而言，关系本身就是资源。",
  },
  "瞬刻炼金士": {
    name: "瞬刻炼金士",
    desc: "你偏好见效迅速的短期机会，重视本轮就能落袋的周转收益；善于借卡牌调整对局节奏，抢占每一轮即时的行动空间。",
  },
  "罗盘精算师": {
    name: "罗盘精算师",
    desc: "你本能规避会造成毁灭性回撤的高风险博弈，无意干预他人策略。习惯在既定规则下审慎推演，算清每一轮投入与精力分配，谋定而后动。",
  },
  "时荫植者": {
    name: "时荫植者",
    desc: "你倾向深耕需要漫长周期兑现价值的长期布局，能够忍耐前期缓慢的收益，在旁人观望迟疑时，默默培育未来的回报。",
  },
  "随机诗人": {
    name: "随机诗人",
    desc: "你的策略不被单一框架束缚，长线布局、短线套利、灵活扰动交替使用，走出一条贴合自身直觉、无法复刻的独特对局路径。",
  },
  "涌机触发者": {
    name: "涌机触发者",
    desc: "你敢于重仓高风险机会，善用杠杆、做空与干扰类卡牌；在局势动荡的不确定性里捕捉机会，借波动攫取收益。",
  },
};

/** 玩家可见描述（终局 / 弹窗）；以本地文案为准，服务端快照仅作兜底 */
export function getFateSketchPlayerDesc(
  personaName: string,
  serverDesc?: string
): string {
  return FATE_SKETCH_CONFIG[personaName]?.desc ?? serverDesc ?? "";
}

export const DECISION_GENE_CONFIG: Record<string, { name: string; desc: string }> = {
  // L (长线) / Q (短线), A (激进) / G (稳健), D (干预) / C (顺应), V (利益) / R (社交)
  "LADV": { name: "长线激进·颠覆操盘手", desc: "愿意承担长期高风险，热衷打破规则以追求绝对利益最大化。" },
  "LADR": { name: "长线激进·创变布道者", desc: "在长期冒险中善用干预手段，同时注重社交影响力的扩张。" },
  "LACV": { name: "长线顺势·冷酷寡头", desc: "顺应规则但敢于下重注，在长期布局中冷静收割核心利益。" },
  "LACR": { name: "长线顺势·理想领袖", desc: "追求长远发展与高风险回报，同时在规则内凝聚人心。" },
  
  "LGDV": { name: "长线稳健·破局精算师", desc: "偏好稳健的长期收益，但会在关键时刻打破常规谋取利益。" },
  "LGDR": { name: "长线稳健·社群架构师", desc: "稳步长线投资，善用道具干预，以建立稳固的社交利益网络。" },
  "LGCV": { name: "长线稳健·隐忍守望者", desc: "绝对的长期主义与规则顺应者，默默积累成为最终赢家。" },
  "LGCR": { name: "长线稳健·温和共建人", desc: "在长线稳健的基础上顺应环境，注重与他人的长期共赢。" },
  
  "QADV": { name: "短线激进·高频投机客", desc: "追求短期暴利，极度冒险且热衷打破规则干预市场。" },
  "QADR": { name: "短线激进·街头弄潮儿", desc: "短线操作快准狠，善用非常规手段积累社交与关注度。" },
  "QACV": { name: "短线顺势·极限套利者", desc: "在既定规则内疯狂寻找高风险短线机会，只看利益。" },
  "QACR": { name: "短线顺势·激进交际花", desc: "短线高风险偏好，顺应规则的缝隙中快速建立社交链接。" },
  
  "QGDV": { name: "短线稳健·微操破坏王", desc: "在短线稳健的保守策略中，偶尔通过道具干预获取额外利益。" },
  "QGDR": { name: "短线稳健·游击公关", desc: "追求短期安全落地，善用道具手段来维护或获取社交资源。" },
  "QGCV": { name: "短线顺应·无情螺丝钉", desc: "保守短视且顺应规则，只关心眼前的确定性小额收益。" },
  "QGCR": { name: "短线顺应·老好人", desc: "短线保守且从不违规，以和为贵，注重维持眼前的社交和谐。" },
};
