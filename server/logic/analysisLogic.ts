import { GameState, Player, PersonaAnalysis, MbtiPersona, ActiveProject } from "../state/gameState.js";

import { AnalysisWeights, FateSketchThresholds } from "../secrets.js";
import { sumRuleInterventionCardWeights } from "./personaMetrics.js";
import { DECISION_GENE_CONFIG, FATE_SKETCH_CONFIG } from "./personaConfig.js";

export { AnalysisWeights, FateSketchThresholds };

export type PersonaDimensionScores = PersonaAnalysis["scores"];

export type FateSketchType =
  | "桥梁架构师"
  | "时荫植者"
  | "涌机触发者"
  | "瞬刻炼金士"
  | "罗盘精算师"
  | "随机诗人";

// ========== 命运素描：五维 + 短期主义 ==========

function calculateLongTermism(player: Player): number {
  if (player.totalEnergyConsumed === 0) return 0;
  const ratio = player.investedLongEnergy / player.totalEnergyConsumed;
  const score1 = ratio * 100 * AnalysisWeights.w_long_ratio;

  const wealthData = player.wealthHistory;
  const maxWealth = Math.max(...wealthData, 1);
  const n = wealthData.length;
  let area = 0;
  if (n > 1) {
    for (let i = 0; i < n - 1; i++) {
      const h1 = wealthData[i] / maxWealth;
      const h2 = wealthData[i + 1] / maxWealth;
      area += ((h1 + h2) / 2) * (1 / (n - 1));
    }
  }
  const score2 = (1 - area) * 100 * AnalysisWeights.w_wealth_curve;
  const hasSpiritBuff = player.usedCards.includes("buff_spirit");
  const score3 = hasSpiritBuff ? AnalysisWeights.w_spirit_buff : 0;
  return Math.min(100, score1 + score2 + score3);
}

function calculateShortTermism(player: Player): number {
  if (player.totalEnergyConsumed === 0) return 0;
  const shortEnergy =
    player.investedShortEnergy > 0
      ? player.investedShortEnergy
      : Math.max(
          0,
          player.totalEnergyConsumed -
            player.investedLongEnergy -
            player.investedRiskEnergy
        );
  const ratio = shortEnergy / player.totalEnergyConsumed;
  return Math.min(100, ratio * 100 * AnalysisWeights.w_short_ratio);
}

function calculateRiskTaking(player: Player): number {
  if (player.totalEnergyConsumed <= 0) return 0;
  const ratio = player.investedRiskEnergy / player.totalEnergyConsumed;
  let score = ratio * 100 * AnalysisWeights.w_risk_ratio;
  const hasLottery = player.usedCards.includes("buff_lottery");
  if (hasLottery) score += AnalysisWeights.w_lottery_buff;
  const hasShort = player.usedCards.includes("buff_short");
  if (hasShort) score += AnalysisWeights.w_short_buff;

  const hasInsurance = player.usedCards.includes("buff_insurance");
  if (
    !hasInsurance &&
    ratio >= AnalysisWeights.naked_risk_energy_ratio_min
  ) {
    score += AnalysisWeights.naked_risk_bonus;
  }

  return Math.min(100, score);
}

function calculateRuleIntervention(player: Player): number {
  const weightedCount = sumRuleInterventionCardWeights(player.usedCards);
  const score =
    weightedCount * AnalysisWeights.w_rule_intervention_per_card;
  return Math.min(100, score);
}

function calculateSocialConnection(player: Player): number {
  switch (player.socialRank) {
    case "A":
      return 100;
    case "B":
      return 80;
    case "C":
      return 60;
    case "D":
      return 40;
    case "E":
      return 20;
    default:
      return 0;
  }
}

function calculateResourceConversion(player: Player, game: GameState): number {
  if (player.totalEnergyConsumed === 0) return 0;
  let weightedExcessGain = 0;

  const allProjects = [
    ...game.activeProjects,
    ...game.completedProjects,
    ...game.uncompletedProjects,
  ];
  const uniqueProjects = Array.from(new Set(allProjects.map((p) => p.id)))
    .map((id) => allProjects.find((p) => p.id === id)!)
    .filter(Boolean);

  for (const project of uniqueProjects) {
    const myInvest = project.investorRecords?.[player.id] || 0;
    const myGain = project.earningRecords?.[player.id] || 0;

    if (myInvest <= 0) continue;
    const myRate = myGain / myInvest;

    if (project.type === "long") {
      if (myRate > AnalysisWeights.roi_threshold_long)
        weightedExcessGain +=
          (myRate - AnalysisWeights.roi_threshold_long) * myInvest;
    } else if (project.type === "short") {
      if (myRate > AnalysisWeights.roi_threshold_short)
        weightedExcessGain +=
          (myRate - AnalysisWeights.roi_threshold_short) * myInvest;
    } else if (project.type === "risk") {
      if (myGain > 0)
        weightedExcessGain +=
          AnalysisWeights.roi_multiplier_risk * myInvest;
    }
  }

  const rawScore = weightedExcessGain / player.totalEnergyConsumed;
  return Math.min(100, rawScore * AnalysisWeights.w_roi_efficiency);
}

export function computePersonaDimensions(
  player: Player,
  game: GameState
): PersonaDimensionScores {
  return {
    longTermism: calculateLongTermism(player),
    shortTermism: calculateShortTermism(player),
    riskTaking: calculateRiskTaking(player),
    ruleIntervention: calculateRuleIntervention(player),
    socialConnection: calculateSocialConnection(player),
    resourceConversion: calculateResourceConversion(player, game),
  };
}

/** 分层判定命运素描（见 persona_scales.md） */
export function classifyFateSketch(
  scores: PersonaDimensionScores,
  thresholds = FateSketchThresholds
): FateSketchType {
  const {
    longTermism: lt,
    shortTermism: st,
    riskTaking: rk,
    ruleIntervention: ri,
    socialConnection: sc,
    resourceConversion: rc,
  } = scores;

  if (sc >= thresholds.bridgeSocialMin) {
    return "桥梁架构师";
  }

  if (lt >= thresholds.gardenerLongTermMin) {
    return "时荫植者";
  }

  const triggerSecondary =
    ri >= thresholds.triggerSecondaryMin ||
    rc >= thresholds.triggerSecondaryMin;
  if (rk >= thresholds.triggerRiskMin && triggerSecondary) {
    return "涌机触发者";
  }

  if (
    st >= thresholds.alchemistShortTermMin &&
    ri >= thresholds.alchemistRuleMin &&
    rk < thresholds.alchemistRiskMax
  ) {
    return "瞬刻炼金士";
  }

  if (
    rk <= thresholds.compassRiskMax &&
    ri <= thresholds.compassRuleMax &&
    rc >= thresholds.compassRoiMin &&
    lt < thresholds.compassLongTermMax
  ) {
    return "罗盘精算师";
  }

  return "随机诗人";
}

function legacyPersonaScores(scores: PersonaDimensionScores) {
  const sCompass =
    (100 - scores.riskTaking) * 0.4 +
    (100 - scores.ruleIntervention) * 0.4 +
    scores.resourceConversion * 0.2;
  const sGardener = scores.longTermism;
  const sTrigger =
    scores.resourceConversion * 0.6 +
    scores.ruleIntervention * 0.2 +
    scores.riskTaking * 0.2;
  const sAlchemist =
    (100 - scores.longTermism) * 0.6 +
    scores.ruleIntervention * 0.2 +
    scores.resourceConversion * 0.2;
  return {
    compass: sCompass,
    gardener: sGardener,
    trigger: sTrigger,
    alchemist: sAlchemist,
  };
}

// ========== 决策基因：四轴 MBTI 系统 ==========

function calculateMbtiPersona(player: Player, game: GameState): MbtiPersona {
  const totalEnergy = player.totalEnergyConsumed || 1;

  const longRatio = player.investedLongEnergy / totalEnergy;
  const shortEnergy =
    player.investedShortEnergy > 0
      ? player.investedShortEnergy
      : Math.max(
          0,
          totalEnergy - player.investedLongEnergy - player.investedRiskEnergy
        );
  const shortRatio = shortEnergy / totalEnergy;
  const longShortScore = (longRatio - shortRatio) * 100;

  const riskEnergyRatio = player.investedRiskEnergy / totalEnergy;
  const riskConservScore = Math.min(
    100,
    riskEnergyRatio * 100 * AnalysisWeights.w_risk_ratio
  );

  const disruptFollowScore = Math.min(
    100,
    sumRuleInterventionCardWeights(player.usedCards) *
      AnalysisWeights.w_rule_intervention_per_card
  );

  const roiScore = calculateResourceConversion(player, game);
  const socialScore = calculateSocialConnection(player);
  const profitSocialScore = roiScore - socialScore;

  const T = longShortScore >= 0 ? "L" : "Q";
  const percentL = Math.min(100, Math.max(0, 50 + longShortScore / 2));

  const R = riskConservScore >= 50 ? "A" : "G";
  const percentA = riskConservScore;

  const D_axis = disruptFollowScore >= 50 ? "D" : "C";
  const percentD = disruptFollowScore;

  const M = profitSocialScore >= 0 ? "V" : "R";
  const percentV = Math.min(100, Math.max(0, 50 + profitSocialScore / 2));

  const code = `${T}${R}${D_axis}${M}`;

  return {
    axes: {
      Time: { code: T, percent: T === "L" ? percentL : 100 - percentL },
      Risk: { code: R, percent: R === "A" ? percentA : 100 - percentA },
      Disruption: {
        code: D_axis,
        percent: D_axis === "D" ? percentD : 100 - percentD,
      },
      Motivation: { code: M, percent: M === "V" ? percentV : 100 - percentV },
    },
    code,
    label: DECISION_GENE_CONFIG[code]?.name || code,
    desc: DECISION_GENE_CONFIG[code]?.desc || "未知决策基因",
    axisScores: {
      longShort: longShortScore,
      riskConserv: riskConservScore,
      disruptFollow: disruptFollowScore,
      profitSocial: profitSocialScore,
    },
  };
}

function backfillInvestedEnergyFromProjects(player: Player, game: GameState) {
  const allProjects = [
    ...game.activeProjects,
    ...game.completedProjects,
    ...game.uncompletedProjects,
  ];
  const seen = new Set<number>();
  let short = 0;
  let long = 0;
  let risk = 0;
  for (const proj of allProjects) {
    if (seen.has(proj.id)) continue;
    seen.add(proj.id);
    const amt = proj.investorRecords?.[player.id] || 0;
    if (amt <= 0) continue;
    if (proj.type === "short") short += amt;
    else if (proj.type === "long") long += amt;
    else if (proj.type === "risk") risk += amt;
  }
  if (!player.investedShortEnergy && short > 0) {
    player.investedShortEnergy = short;
  }
  if (!player.investedLongEnergy && long > 0) {
    player.investedLongEnergy = long;
  }
  if (!player.investedRiskEnergy && risk > 0) {
    player.investedRiskEnergy = risk;
  }
}

function ensurePersonaTelemetry(player: Player) {
  if (player.investedShortEnergy == null || Number.isNaN(player.investedShortEnergy)) {
    player.investedShortEnergy = 0;
  }
}

// ========== 主入口 ==========

export function analyzeGamePersona(game: GameState) {
  game.players.forEach((p) => {
    ensurePersonaTelemetry(p);
    backfillInvestedEnergyFromProjects(p, game);
    const scores = computePersonaDimensions(p, game);
    const persona = classifyFateSketch(scores);
    const personaScores = legacyPersonaScores(scores);
    const mbtiPersona = calculateMbtiPersona(p, game);

    p.analysisResult = {
      scores,
      personaScores,
      primaryPersona: persona,
      primaryPersonaDesc: FATE_SKETCH_CONFIG[persona]?.desc || "暂无描述",
      mbtiPersona,
    };

    console.log(
      `📊 玩家 ${p.name} 命运素描: ${persona} | 决策基因: ${mbtiPersona.code} ${mbtiPersona.label}`
    );
  });
}
