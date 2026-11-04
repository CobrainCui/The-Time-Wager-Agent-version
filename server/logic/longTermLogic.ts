import { ActiveProject, Player } from "../state/gameState.js";

export const LONG_CONTINUE_MIN_ENERGY = 3;

export type LongTermRecord = {
  totalInvested: number;
  status: "active" | "completed" | "abandoned";
  reward?: number;
  /** 每轮投入精力，用于结算全览个人条分段 */
  roundSlices?: number[];
};

/** 已有 active 记录时，本轮投入 <3（含 0）视为放弃 */
export function shouldTreatAsAbandon(
  record: LongTermRecord | undefined,
  currentRoundAmount: number
): boolean {
  return record?.status === "active" && currentRoundAmount < LONG_CONTINUE_MIN_ENERGY;
}

export function refundOnAbandon(record: LongTermRecord, currentRoundAmount: number): number {
  return record.totalInvested + currentRoundAmount;
}

/** 长期项目单格投入裁剪（与 sanitizeInvestments 一致） */
export function sanitizeLongContribution(
  status: LongTermRecord["status"] | undefined,
  amount: number
): number {
  if (status === "abandoned" || status === "completed") return 0;
  if (status === "active" && amount > 0 && amount < LONG_CONTINUE_MIN_ENERGY) return 0;
  return amount;
}

/**
 * 是否应对该长期项目展示「本轮须继续投入」警示 / 放弃风险。
 * 兼容 longTerm 未同步但牌桌 investorRecords 已有记录的情况。
 */
export function needsLongContinueWarn(
  project: ActiveProject,
  player: Player
): boolean {
  if (project.type !== "long") return false;
  const lt = player.longTerm[project.id];
  if (lt?.status === "abandoned" || lt?.status === "completed") return false;
  if (lt?.status === "active") return true;
  return (project.investorRecords?.[player.id] ?? 0) > 0;
}

/** 用牌桌历史投入修复缺失的 longTerm（旧局/异常数据） */
export function syncLongTermRecordsFromHistory(project: ActiveProject, players: Player[]) {
  if (project.type !== "long") return;
  for (const p of players) {
    const prior = project.investorRecords[p.id] || 0;
    if (prior <= 0) continue;
    const record = p.longTerm[project.id];
    if (!record) {
      p.longTerm[project.id] = {
        totalInvested: prior,
        status: "active",
        roundSlices: [prior],
      };
    } else if (record.status === "active" && record.totalInvested < prior) {
      record.totalInvested = prior;
      if (!record.roundSlices?.length) record.roundSlices = [prior];
    }
  }
}

/** 进入道具/投资阶段前，用牌桌历史补齐各长期项目的 longTerm */
export function syncActiveLongTermRecords(game: {
  activeProjects: ActiveProject[];
  players: Player[];
}) {
  for (const project of game.activeProjects) {
    if (project.type === "long") {
      syncLongTermRecordsFromHistory(project, game.players);
    }
  }
}

export function applyLongTermRoundInvestments(
  project: ActiveProject,
  investors: { player: Player; amount: number }[]
) {
  if (project.type !== "long") return;
  for (const { player, amount } of investors) {
    if (amount <= 0) continue;
    let record = player.longTerm[project.id];
    if (!record) {
      record = { totalInvested: 0, status: "active", roundSlices: [] };
      player.longTerm[project.id] = record;
    }
    if (record.status === "active") {
      if (!record.roundSlices?.length && record.totalInvested > 0) {
        record.roundSlices = [record.totalInvested];
      }
      record.totalInvested += amount;
      if (!record.roundSlices) record.roundSlices = [];
      record.roundSlices.push(amount);
    }
  }
}
