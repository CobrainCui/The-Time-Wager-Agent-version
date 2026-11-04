import { GameState, ActiveProject } from "./gameState.js";
import {
  shortTermProjects,
  longTermProjects,
  riskProjects,
  ProjectCard,
  eraCards,
} from "../data/game_data.js";
import { shuffleArray } from "../utils/shuffle.js";
import {
  resolveRankPlayerCount,
  scaleRankRewardsForPlayerCount,
} from "../logic/rankRewardSchedule.js";

export function updateEraCard(game: GameState) {
  const index = game.currentEra - 1;
  if (index < game.eraSequence.length) {
    const cardId = game.eraSequence[index];
    game.currentEraCard = eraCards.find((c) => c.id === cardId + 1) || eraCards[0];
  } else {
    game.currentEraCard = eraCards[eraCards.length - 1];
  }
  game.logs.push(`🌍 时代主题更新：${game.currentEraCard.name} (${game.currentEraCard.era})`);
}

/** 清掉与当前时代主题不符的风险（本代风险保留）。已清过则静默。 */
export function stripExpiredRiskProjects(game: GameState): void {
  const theme = game.currentEraCard?.era;
  const before = game.activeProjects.length;
  game.activeProjects = game.activeProjects.filter(
    (p) => p.type !== "risk" || (theme != null && p.era === theme)
  );
  if (game.activeProjects.length < before) {
    game.logs.push(`⚠️ 新时代开始，旧时代的风险项目已移除`);
  }
}

/**
 * 每个时代第一轮进入投资前调用：保证本时代只发一次新项目。
 * 第二轮不发；已发过则跳过。主持跳过时代介绍直接进投资也会补发。
 */
export function ensureProjectsDrawnForEra(game: GameState): void {
  if (game.roundInEra !== 1) {
    return;
  }
  if (game.projectDrawEra === game.currentEra) {
    return;
  }
  // 换代后若尚未清旧主题风险（例如直接跳到投资），先清再发
  stripExpiredRiskProjects(game);
  drawProjectsForEra(game);
  game.projectDrawEra = game.currentEra;
}

export function drawProjectsForEra(game: GameState) {
  if (game.roundInEra !== 1) return;
  // 防御：已发过本时代则不再抽
  if (game.projectDrawEra === game.currentEra) return;

  stripExpiredRiskProjects(game);

  const newProjects: ActiveProject[] = [];

  const toActive = (card: ProjectCard): ActiveProject => {
    return {
      id: card.id,
      name: card.name,
      type: card.type,
      color: mapEraToColor(card.era),
      maxEnergy: card.maxEnergy,
      era: card.era,
      accumulatedInvested: 0,
      currentInvested: 0,
      roundsNoInvestment: 0,
      investedThisRound: false,
      rankRewards: scaleRankRewardsForPlayerCount(
        card.rankRewards,
        resolveRankPlayerCount(game)
      ),
      overInvestPenalty: card.overInvestPenalty,
      startRound: card.startRound,

      investorRecords: {},
      earningRecords: {},
      totalPayout: 0,
    };
  };

  const isAvailable = (p: ProjectCard) =>
    !game.activeProjects.some((ap) => ap.id === p.id) && !game.drawnProjects.has(p.id);

  const currentTheme = game.currentEraCard?.era;

  const availableShort = shortTermProjects.filter((p) => isAvailable(p));
  const availableLong = longTermProjects.filter((p) => isAvailable(p));

  const availableRisk = riskProjects.filter(
    (p) => !isProjectActiveOrDrawn(game, p.id) && p.era === currentTheme
  );

  let countShort = 0;
  let countLong = 0;
  const countRisk = 1;

  if (game.currentEra === 1) {
    countShort = 3;
    countLong = 2;
  } else {
    countShort = 2;
    countLong = 1;
  }

  const drawnShort = sample(availableShort, countShort);
  const drawnLong = sample(availableLong, countLong);
  const drawnRisk = sample(availableRisk, countRisk);

  const shortfalls: string[] = [];
  if (drawnShort.length < countShort) {
    shortfalls.push(`短期缺 ${countShort - drawnShort.length}（池余 ${availableShort.length}）`);
  }
  if (drawnLong.length < countLong) {
    shortfalls.push(`长期缺 ${countLong - drawnLong.length}（池余 ${availableLong.length}）`);
  }
  if (drawnRisk.length < countRisk) {
    shortfalls.push(
      `风险缺 ${countRisk - drawnRisk.length}（主题「${currentTheme ?? "未知"}」池余 ${availableRisk.length}）`
    );
  }

  [...drawnShort, ...drawnLong, ...drawnRisk].forEach((p) => {
    newProjects.push(toActive(p));
    game.drawnProjects.add(p.id);

    if (p.type === "risk") {
      game.totalRiskEnergyAvailable += p.maxEnergy;
    }
  });

  game.activeProjects.push(...newProjects);

  if (newProjects.length > 0) {
    game.logs.push(
      `🎴 本轮发布(${newProjects.length}): ${newProjects.map((p) => p.name).join("、")}`
    );
  } else {
    game.logs.push(`🎴 本轮无新项目发布`);
  }
  if (shortfalls.length > 0) {
    game.logs.push(`⚠️ 发牌不足：${shortfalls.join("；")}`);
  }
}

function isProjectActiveOrDrawn(game: GameState, pid: number): boolean {
  const isActive = game.activeProjects.some((ap) => ap.id === pid);
  const isDrawn = game.drawnProjects.has(pid);
  return isActive || isDrawn;
}

function sample(pool: ProjectCard[], count: number): ProjectCard[] {
  return shuffleArray(pool).slice(0, count);
}

function mapEraToColor(era?: string): string {
  switch (era) {
    case "气候":
      return "green";
    case "科技":
      return "blue";
    case "文化":
      return "red";
    case "健康":
      return "orange";
    case "心理":
      return "yellow";
    default:
      return "gray";
  }
}
