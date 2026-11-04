import { PersonaAnalysis, Player } from "../types";

export const PERSONA_RADAR_LABELS = [
  "长期主义",
  "短期偏好",
  "风险倾向",
  "规则干预",
  "社交连接",
  "资源转化",
] as const;

/** 与 PDF 模板一致的五维（不含短期，避免版式错位） */
export const PERSONA_PDF_RADAR_LABELS = [
  "长期主义",
  "风险倾向",
  "规则干预",
  "社交连接",
  "资源转化",
] as const;

export type NormalizedPersonaScores = {
  longTermism: number;
  shortTermism: number;
  riskTaking: number;
  ruleIntervention: number;
  socialConnection: number;
  resourceConversion: number;
};

/** 原始分达到此值时雷达画满 100；对齐真实对局「二十多分已算突出」 */
export const PERSONA_RADAR_RAW_CEILING = 40;

export function scalePersonaScoreForRadar(
  raw: number,
  dimension?: keyof NormalizedPersonaScores
): number {
  const v = Math.max(0, Number.isFinite(raw) ? raw : 0);
  /** 主持档已是 0–100 离散分，不再按 40 天花板压缩 */
  if (dimension === "socialConnection") {
    return Math.min(100, v);
  }
  return Math.min(100, (v / PERSONA_RADAR_RAW_CEILING) * 100);
}

export function scalePersonaBarFillWidth(
  dimension: keyof NormalizedPersonaScores,
  raw: number
): number {
  return scalePersonaScoreForRadar(raw, dimension);
}

export function normalizePersonaScores(
  scores: PersonaAnalysis["scores"] | undefined
): NormalizedPersonaScores {
  const longTermism = scores?.longTermism ?? 0;
  const shortTermism =
    scores?.shortTermism ??
    (scores && "longTermism" in scores
      ? Math.max(0, Math.min(100, 100 - longTermism * 0.85))
      : 0);
  return {
    longTermism,
    shortTermism,
    riskTaking: scores?.riskTaking ?? 0,
    ruleIntervention: scores?.ruleIntervention ?? 0,
    socialConnection: scores?.socialConnection ?? 0,
    resourceConversion: scores?.resourceConversion ?? 0,
  };
}

export function personaRadarValues(scores: NormalizedPersonaScores): number[] {
  return [
    scalePersonaScoreForRadar(scores.longTermism, "longTermism"),
    scalePersonaScoreForRadar(scores.shortTermism, "shortTermism"),
    scalePersonaScoreForRadar(scores.riskTaking, "riskTaking"),
    scalePersonaScoreForRadar(scores.ruleIntervention, "ruleIntervention"),
    scalePersonaScoreForRadar(scores.socialConnection, "socialConnection"),
    scalePersonaScoreForRadar(scores.resourceConversion, "resourceConversion"),
  ];
}

export function personaPdfRadarValues(scores: NormalizedPersonaScores): number[] {
  return [
    scalePersonaScoreForRadar(scores.longTermism, "longTermism"),
    scalePersonaScoreForRadar(scores.riskTaking, "riskTaking"),
    scalePersonaScoreForRadar(scores.ruleIntervention, "ruleIntervention"),
    scalePersonaScoreForRadar(scores.socialConnection, "socialConnection"),
    scalePersonaScoreForRadar(scores.resourceConversion, "resourceConversion"),
  ];
}

/** 本场玩家该维度超过多少比例的其他玩家（0–100） */
export function sessionDimensionPercentiles(
  players: Player[],
  playerId: string
): Record<keyof NormalizedPersonaScores, number> | null {
  const rows = players
    .map((p) => ({
      id: p.id,
      scores: p.analysisResult
        ? normalizePersonaScores(p.analysisResult.scores)
        : null,
    }))
    .filter((r) => r.scores != null) as { id: string; scores: NormalizedPersonaScores }[];

  if (rows.length < 3) return null;
  const me = rows.find((r) => r.id === playerId);
  if (!me) return null;

  const keys = Object.keys(me.scores) as (keyof NormalizedPersonaScores)[];
  const out = {} as Record<keyof NormalizedPersonaScores, number>;
  for (const key of keys) {
    const myVal = me.scores[key];
    const below = rows.filter((r) => r.scores[key] < myVal).length;
    out[key] = Math.round((below / (rows.length - 1)) * 100);
  }
  return out;
}

const FATE_SKETCH_SCORE_LABELS: Record<string, string> = {
  compass: "罗盘精算师",
  gardener: "时荫植者",
  trigger: "涌机触发者",
  alchemist: "瞬刻炼金士",
};

/** 除主类型外，得分最高的命运素描候选（成熟产品「你还像…」） */
/** 仅展示与主类型明显区分的次要色彩（避免展示内部低分噪声） */
export function secondaryFateSketches(
  result: PersonaAnalysis,
  limit = 2,
  minScore = 30
): { name: string; score: number }[] {
  const primary = result.primaryPersona;
  const entries = Object.entries(result.personaScores)
    .map(([key, score]) => ({
      name: FATE_SKETCH_SCORE_LABELS[key] ?? key,
      score,
    }))
    .filter((e) => e.name !== primary && e.score >= minScore)
    .sort((a, b) => b.score - a.score);
  return entries.slice(0, limit);
}

export const GENE_AXIS_META = [
  { key: "Time" as const, left: "长线 L", right: "速决 Q" },
  { key: "Risk" as const, left: "进取 A", right: "稳健 G" },
  { key: "Disruption" as const, left: "破局 D", right: "守成 C" },
  { key: "Motivation" as const, left: "求效 V", right: "共情 R" },
];
