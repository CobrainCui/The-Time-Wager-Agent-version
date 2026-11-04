import type { GameState } from "../types";

/** 本人未完成转出合计 */
export function playerPendingTransferOutWealth(game: GameState, playerId: string): number {
  let sum = 0;
  for (const tx of game.transactions ?? []) {
    if (tx.status !== "pending" || tx.fromId !== playerId) continue;
    if (typeof tx.amount === "number" && Number.isSafeInteger(tx.amount) && tx.amount > 0) {
      sum += tx.amount;
    }
  }
  return sum;
}

/** 本人在正在拍的卡上暂时领先的出价占用 */
export function playerLeadingBidReservedWealth(
  game: GameState,
  playerId: string,
  opts?: { exceptOwnLeading?: boolean }
): number {
  if (opts?.exceptOwnLeading) return 0;
  if (!game.auctionFocusCardId) return 0;
  if (game.auctionHighBidderId !== playerId) return 0;
  const amount = game.auctionCurrentBid ?? 0;
  return typeof amount === "number" && Number.isSafeInteger(amount) && amount > 0 ? amount : 0;
}

/** 有占用时的玩家说明；没有占用返回空串 */
export function formatWealthHoldNote(leading: number, pendingOut: number): string {
  const parts: string[] = [];
  if (leading > 0) parts.push(`领先出价 ${leading}`);
  if (pendingOut > 0) parts.push(`待对方确认的转账 ${pendingOut}`);
  if (parts.length === 0) return "";
  return `另占用 ${parts.join("、")}`;
}

/**
 * 可用财富 = 账面 − 领先出价占用 − 未完成转出。
 * exceptOwnLeading：自己继续加价时不算当前领先占用。
 */
export function playerAvailableWealth(
  game: GameState,
  player: { id: string; wealth: number },
  opts?: { exceptOwnLeading?: boolean }
): number {
  if (typeof player.wealth !== "number" || !Number.isSafeInteger(player.wealth)) return 0;
  const reserved =
    playerLeadingBidReservedWealth(game, player.id, opts) +
    playerPendingTransferOutWealth(game, player.id);
  return Math.max(0, player.wealth - reserved);
}
