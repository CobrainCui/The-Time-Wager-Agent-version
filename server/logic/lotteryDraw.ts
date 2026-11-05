import type { GameState, LotteryOffer, Player } from "../state/gameState.js";
import { appendSessionEvent } from "../state/sessionTelemetry.js";
import {
  applyLotteryAccept,
  claimLotteryResponse,
  createLotteryOffer,
  findPendingLotteryOffer,
  playerHasLotteryBuff,
} from "./lotterySettle.js";
import { drawLotteryRoll, type LotteryDraw } from "./lotteryRandom.js";

/** 防止同一玩家在一次网络往返里被重复抽奖（例如 socket 与自动主持同时触发） */
const DRAWING = new Set<string>();

function drawKey(game: GameState, playerId: string): string {
  // 带房间长度前缀，避免 roomId "a" 与 "a:1" 互相前缀匹配
  return `${game.roomId.length}:${game.roomId}:${playerId}`;
}

/** 抽奖请求仍在等待随机源：此时不能结算，否则彩票会被清掉 */
export function hasLotteryDrawInFlight(roomId: string): boolean {
  const prefix = `${roomId.length}:${roomId}:`;
  for (const key of DRAWING) {
    if (key.startsWith(prefix)) return true;
  }
  return false;
}

export type RandomLotteryOfferResult =
  | {
      ok: true;
      player: Player;
      offer: LotteryOffer;
      replaced?: LotteryOffer;
      draw: LotteryDraw;
    }
  | { ok: false; message: string };

/**
 * 线上随机开奖：掷骰 → 生成待玩家确认的 offer。
 * 在 await 前后都重新校验，避免抽奖期间玩家被移除 / 彩票已被作废。
 */
export async function createRandomLotteryOffer(
  game: GameState,
  playerId: string
): Promise<RandomLotteryOfferResult> {
  const key = drawKey(game, playerId);
  if (DRAWING.has(key)) return { ok: false, message: "开奖进行中，请稍候" };
  const before = game.players.find((p) => p.id === playerId);
  if (!before || !playerHasLotteryBuff(before)) {
    return { ok: false, message: "该玩家没有待开奖的彩票" };
  }
  if ((game.lotteryCompletedDeals ?? []).some((d) => d.playerId === playerId)) {
    return { ok: false, message: "该玩家彩票已开奖" };
  }
  if (findPendingLotteryOffer(game, playerId)) {
    return { ok: false, message: "已有待确认的彩票开奖" };
  }

  DRAWING.add(key);
  try {
    const draw = await drawLotteryRoll();
    const player = game.players.find((p) => p.id === playerId);
    if (!player) return { ok: false, message: "玩家已离开" };
    if (!playerHasLotteryBuff(player)) {
      return { ok: false, message: "彩票已失效（可能已被作废）" };
    }
    if (findPendingLotteryOffer(game, playerId)) {
      return { ok: false, message: "已有待确认的彩票开奖" };
    }
    const { offer, replaced } = createLotteryOffer(game, playerId, draw.amount, {
      roll: draw.roll,
      source: draw.source,
      drawnAt: draw.drawnAt,
    });
    return { ok: true, player, offer, replaced, draw };
  } finally {
    DRAWING.delete(key);
  }
}

export type LotteryAcceptResult =
  | {
      ok: true;
      player: Player;
      enteredAmount: number;
      creditedAmount: number;
      goldApplied: boolean;
      roll?: number;
      source?: "random.org" | "server" | "manual";
    }
  | { ok: false; message: string };

/** 确认领取（玩家点击 / AI / 自动主持超时共用） */
export function acceptLotteryOffer(
  game: GameState,
  playerId: string,
  offerId: unknown
): LotteryAcceptResult {
  const player = game.players.find((p) => p.id === playerId);
  if (!player) return { ok: false, message: "玩家不存在" };
  const claimed = claimLotteryResponse(game, playerId, offerId, true);
  if (!claimed.ok) return { ok: false, message: claimed.message };
  const settled = applyLotteryAccept(game, player, claimed.amount, {
    roll: claimed.roll,
    source: claimed.source,
  });
  return {
    ok: true,
    player,
    enteredAmount: settled.enteredAmount,
    creditedAmount: settled.creditedAmount,
    goldApplied: settled.goldApplied,
    roll: claimed.roll,
    source: claimed.source,
  };
}

/** 自动主持：超时未确认的开奖自动领取 */
export function autoAcceptPendingLottery(
  game: GameState,
  playerId: string,
  now = Date.now(),
  graceMs = 0
): LotteryAcceptResult | null {
  const offer = findPendingLotteryOffer(game, playerId);
  if (!offer) return null;
  const drawnAt = offer.drawnAt ?? now;
  if (now - drawnAt < graceMs) return null;
  return acceptLotteryOffer(game, playerId, offer.offerId);
}

/**
 * 投资阶段收口：结算前领取所有待确认的彩票。
 * 彩票结果是服务端权威随机值，玩家来不及点确认时也不应该丢奖。
 */
export function settleAllPendingLotteryOffers(game: GameState): number {
  const offers = [...(game.pendingLotteryOffers ?? [])];
  let settled = 0;
  for (const offer of offers) {
    const result = acceptLotteryOffer(game, offer.playerId, offer.offerId);
    if (!result.ok) continue;
    settled += 1;
    game.logs.push(
      `🎲 彩票开奖！${result.player.name} 获得 ${result.creditedAmount} 财富${
        result.roll ? `（骰子 ${result.roll}）` : ""
      }`
    );
    appendSessionEvent(
      game,
      "lottery_settled",
      {
        targetPlayerId: result.player.id,
        enteredAmount: result.enteredAmount,
        creditedAmount: result.creditedAmount,
        goldApplied: result.goldApplied,
        roll: result.roll ?? null,
        source: result.source ?? "server",
        accepted: true,
        actor: "settlement",
      },
      result.player.id
    );
  }
  return settled;
}
