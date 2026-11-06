import type { GameState, GainBreakdown, SettlementProjectResult, SettlementHistoryEntry } from "../types";
import {
  longSettlementStatusLabel,
  shortExactSettlementStatusLabel,
} from "./projectHelpTable";

/** 结算分解项：负数用括号，避免 160+-35+0 */
function formatGainPart(n: number): string {
  return n < 0 ? `(${n})` : String(n);
}

/** 点石成金：仅当乘前原值与入账完全对应时显示（原值）×1.5 */
function formatGoldAwarePart(paid: number, beforeGold?: number): string {
  if (
    typeof beforeGold === "number" &&
    beforeGold > 0 &&
    Math.floor(beforeGold * 1.5) === paid
  ) {
    return `（${beforeGold}）的 1.5 倍`;
  }
  return formatGainPart(paid);
}

export function formatGainBreakdown(
  base: number,
  rank: number,
  era: number,
  gains?: Pick<GainBreakdown, "baseBeforeGold" | "rankBeforeGold" | "eraBeforeGold">
): string {
  return [
    formatGoldAwarePart(base, gains?.baseBeforeGold),
    formatGoldAwarePart(rank, gains?.rankBeforeGold),
    formatGoldAwarePart(era, gains?.eraBeforeGold),
  ].join("+");
}

/** 长期放弃：快照中 1:1 结算，无排名/时代奖 */
export function isLongAbandonFromSnapshot(
  res: SettlementProjectResult,
  gains: GainBreakdown
): boolean {
  if (res.type !== "long" || res.shortSold || res.endGradient || res.isCompleted) return false;
  return gains.total > 0 && gains.base === gains.total && gains.rank === 0 && gains.era === 0;
}

/** 历史战报：仅读当轮结算快照，不用当前 longTerm */
export function settlementSnapshotStatusSuffix(
  res: SettlementProjectResult,
  gains?: GainBreakdown
): {
  statusSuffix: string;
  statusSuffixColor: string;
  rowColor: string;
} {
  let statusSuffix = "";
  let statusSuffixColor = "var(--color-text-muted)";
  let rowColor = "var(--color-text-secondary)";
  const longRowLabel = longSettlementStatusLabel(res);
  const shortRowLabel = shortExactSettlementStatusLabel(res);
  if (gains && isLongAbandonFromSnapshot(res, gains)) {
    statusSuffix = " 🚫放弃结算";
    statusSuffixColor = "#9ca3af";
    rowColor = "#9ca3af";
  } else if (res.shortSold) {
    statusSuffix = " 📉做空·清零";
    statusSuffixColor = "#60a5fa";
    rowColor = "#60a5fa";
  } else if (res.isExploded && res.type !== "long") {
    statusSuffix = " 💥投资失败";
    statusSuffixColor = "#f87171";
    rowColor = "#f87171";
  } else if (longRowLabel) {
    statusSuffix = ` ${longRowLabel.text}`;
    statusSuffixColor = longRowLabel.color;
    rowColor = longRowLabel.color;
  } else if (shortRowLabel) {
    statusSuffix = ` ${shortRowLabel.text}`;
    statusSuffixColor = shortRowLabel.color;
    rowColor = shortRowLabel.color;
  } else if (res.type === "long") statusSuffix = " ⏳";
  return { statusSuffix, statusSuffixColor, rowColor };
}

/** 玩家可见结算轮次：历史列表 + 若 lastSettlement 领先则补一轮（与投入速查一致） */
export function getSettlementHistoryForPlayer(game: GameState): SettlementHistoryEntry[] {
  const hist = game.settlementHistory ?? [];
  const ls = game.lastSettlement;
  if (!ls) return hist;
  if (hist.some((h) => h.round === ls.round)) return hist;
  return [
    ...hist,
    {
      round: ls.round,
      currentEra: game.currentEra,
      roundInEra: game.roundInEra,
      results: ls.results,
    },
  ];
}

export function myRoundNetIncome(
  results: SettlementProjectResult[],
  playerId: string
): number {
  return results.reduce((sum, res) => {
    const g = res.playerGains[playerId];
    return sum + (g ? g.total : 0);
  }, 0);
}

export function myProjectsInRound(
  results: SettlementProjectResult[],
  playerId: string
): SettlementProjectResult[] {
  return results.filter(
    (r) => (r.playerInvestments[playerId] || 0) > 0 || (r.playerGains[playerId]?.total ?? 0) !== 0
  );
}
