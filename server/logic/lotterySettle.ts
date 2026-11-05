import { randomUUID } from "node:crypto";
import { GameState, LotteryOffer, Player } from "../state/gameState.js";
import { applyGoldMultiplier } from "./buffLogic.js";

export const LOTTERY_CARD_ID = "buff_lottery";

export function playerHasLotteryBuff(player: Player | undefined): boolean {
  return Boolean(player?.activeBuffs?.some((b) => b.cardId === LOTTERY_CARD_ID));
}

export function isValidLotteryAmount(amount: unknown): amount is number {
  // 彩票只发奖，不用于扣款；负财富调整请走 wealthAdjust（需要玩家确认）
  return typeof amount === "number" && Number.isSafeInteger(amount) && amount >= 0;
}

export function removeLotteryBuff(player: Player): boolean {
  const idx = player.activeBuffs.findIndex((b) => b.cardId === LOTTERY_CARD_ID);
  if (idx === -1) return false;
  player.activeBuffs.splice(idx, 1);
  return true;
}

export function restoreLotteryBuff(player: Player): void {
  if (playerHasLotteryBuff(player)) return;
  player.activeBuffs.push({ cardId: LOTTERY_CARD_ID });
}

export function createLotteryOffer(
  game: GameState,
  playerId: string,
  amount: number,
  meta?: { roll?: number; source?: "random.org" | "server" | "manual"; drawnAt?: number }
): { offer: LotteryOffer; replaced?: LotteryOffer } {
  const pending = game.pendingLotteryOffers ?? [];
  const replaced = pending.find((o) => o.playerId === playerId);
  const offer: LotteryOffer = {
    offerId: randomUUID(),
    playerId,
    amount,
    ...(meta?.roll != null ? { roll: meta.roll } : {}),
    ...(meta?.source ? { source: meta.source } : {}),
    drawnAt: meta?.drawnAt ?? Date.now(),
  };
  game.pendingLotteryOffers = pending.filter((o) => o.playerId !== playerId);
  game.pendingLotteryOffers.push(offer);
  return { offer, replaced };
}

export function findPendingLotteryOffer(game: GameState, playerId: string): LotteryOffer | undefined {
  return (game.pendingLotteryOffers ?? []).find((o) => o.playerId === playerId);
}

export function takeLotteryOffer(
  game: GameState,
  offerId: unknown,
  playerId: string
): LotteryOffer | undefined {
  if (typeof offerId !== "string" || !offerId) return undefined;
  const offers = game.pendingLotteryOffers ?? [];
  const idx = offers.findIndex((o) => o.offerId === offerId && o.playerId === playerId);
  if (idx === -1) return undefined;
  const [offer] = offers.splice(idx, 1);
  game.pendingLotteryOffers = offers;
  return offer;
}

export function claimLotteryResponse(
  game: GameState,
  playerId: string,
  offerId: unknown,
  accept: boolean
):
  | {
      ok: true;
      amount: number;
      roll?: number;
      source?: "random.org" | "server" | "manual";
      drawnAt?: number;
    }
  | { ok: false; message: string } {
  if (typeof offerId !== "string" || !offerId) {
    return { ok: false, message: "彩票开奖已失效" };
  }
  const player = game.players.find((p) => p.id === playerId);
  const pending = (game.pendingLotteryOffers ?? []).find(
    (o) => o.offerId === offerId && o.playerId === playerId
  );
  if (!pending) {
    return { ok: false, message: "彩票开奖已失效" };
  }
  if (accept && !playerHasLotteryBuff(player)) {
    return { ok: false, message: "没有待开奖的彩票" };
  }
  if (accept && !isValidLotteryAmount(pending.amount)) {
    return { ok: false, message: "开奖金额无效" };
  }
  const offer = takeLotteryOffer(game, offerId, playerId);
  if (!offer) {
    return { ok: false, message: "彩票开奖已失效" };
  }
  return {
    ok: true,
    amount: offer.amount,
    roll: offer.roll,
    source: offer.source,
    drawnAt: offer.drawnAt,
  };
}

export function recordLotteryCompletedDeal(
  game: GameState,
  playerId: string,
  amount: number,
  enteredAmount?: number,
  goldApplied?: boolean,
  meta?: { roll?: number; source?: "random.org" | "server" | "manual" }
): void {
  if (!game.lotteryCompletedDeals) game.lotteryCompletedDeals = [];
  game.lotteryCompletedDeals = game.lotteryCompletedDeals.filter((d) => d.playerId !== playerId);
  game.lotteryCompletedDeals.push({
    playerId,
    amount,
    ...(enteredAmount != null ? { enteredAmount } : {}),
    ...(goldApplied != null ? { goldApplied } : {}),
    ...(meta?.roll != null ? { roll: meta.roll } : {}),
    ...(meta?.source ? { source: meta.source } : {}),
  });
}

export function applyLotteryAccept(
  game: GameState,
  player: Player,
  amount: number,
  meta?: { roll?: number; source?: "random.org" | "server" | "manual" }
): { enteredAmount: number; creditedAmount: number; goldApplied: boolean } {
  const lotteryBuff = player.activeBuffs?.find((b) => b.cardId === LOTTERY_CARD_ID);
  const goldApplied = Boolean(player.activeBuffs?.some((b) => b.cardId === "buff_gold"));
  const credited = applyGoldMultiplier(player, amount);
  player.wealth += credited;
  const playId = lotteryBuff?.instanceId;
  if (playId && game.roundBuffPlays) {
    const rec = game.roundBuffPlays.find((p) => p.playId === playId && !p.voided);
    if (rec) rec.wealthCredited = credited;
  }
  removeLotteryBuff(player);
  recordLotteryCompletedDeal(game, player.id, credited, amount, goldApplied, meta);
  return { enteredAmount: amount, creditedAmount: credited, goldApplied };
}

export type RevokeLotteryResult =
  | { ok: true; kind: "pending"; playerId: string; offerId: string }
  | { ok: true; kind: "completed"; playerId: string; amount: number }
  | { ok: false; message: string };

function revokeCompletedLottery(game: GameState, playerId: string): RevokeLotteryResult {
  const deal = (game.lotteryCompletedDeals ?? []).find((d) => d.playerId === playerId);
  if (!deal) {
    return { ok: false, message: "没有待确认或已开奖的彩票" };
  }
  const player = game.players.find((p) => p.id === deal.playerId);
  if (!player) {
    return { ok: false, message: "玩家不存在" };
  }
  player.wealth -= deal.amount;
  restoreLotteryBuff(player);
  game.lotteryCompletedDeals = (game.lotteryCompletedDeals ?? []).filter((d) => d.playerId !== playerId);
  game.pendingLotteryOffers = (game.pendingLotteryOffers ?? []).filter((o) => o.playerId !== playerId);
  return { ok: true, kind: "completed", playerId: deal.playerId, amount: deal.amount };
}

export function revokeLotteryGrant(game: GameState, playerId: string): RevokeLotteryResult {
  if (typeof playerId !== "string" || !playerId) {
    return { ok: false, message: "玩家无效" };
  }
  const offers = game.pendingLotteryOffers ?? [];
  const pendingIdx = offers.findIndex((o) => o.playerId === playerId);
  if (pendingIdx >= 0) {
    const [offer] = offers.splice(pendingIdx, 1);
    game.pendingLotteryOffers = offers;
    return { ok: true, kind: "pending", playerId: offer.playerId, offerId: offer.offerId };
  }
  return revokeCompletedLottery(game, playerId);
}

export function proposeLotterySettle(
  game: GameState,
  playerId: string,
  amount: unknown
):
  | { ok: true; offer: LotteryOffer; replaced?: LotteryOffer; player: Player }
  | { ok: false; message: string } {
  if (!isValidLotteryAmount(amount)) {
    return { ok: false, message: "开奖金额必须为整数" };
  }
  const player = game.players.find((p) => p.id === playerId);
  if (!player) {
    return { ok: false, message: "开奖对象无效" };
  }
  if ((game.lotteryCompletedDeals ?? []).some((d) => d.playerId === playerId)) {
    return { ok: false, message: "该玩家彩票已开奖，请先撤回" };
  }
  if (!playerHasLotteryBuff(player)) {
    return { ok: false, message: "该玩家没有待开奖的彩票" };
  }
  const { offer, replaced } = createLotteryOffer(game, player.id, amount, {
    source: "manual",
    drawnAt: Date.now(),
  });
  return { ok: true, offer, replaced, player };
}
