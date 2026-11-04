import { randomUUID } from "node:crypto";
import { GameState, Player, WealthAdjustOffer } from "../state/gameState.js";
import { isAiPlayer } from "../util/isAiPlayer.js";

export function isValidWealthDelta(delta: unknown): delta is number {
  return typeof delta === "number" && Number.isSafeInteger(delta) && delta !== 0;
}

export function createWealthAdjustOffer(
  game: GameState,
  playerId: string,
  delta: number
): { offer: WealthAdjustOffer; replaced?: WealthAdjustOffer } {
  const pending = game.pendingWealthAdjustments ?? [];
  const replaced = pending.find((o) => o.playerId === playerId);
  const offer: WealthAdjustOffer = { offerId: randomUUID(), playerId, delta };
  game.pendingWealthAdjustments = pending.filter((o) => o.playerId !== playerId);
  game.pendingWealthAdjustments.push(offer);
  return { offer, replaced };
}

export function findPendingWealthAdjust(
  game: GameState,
  playerId: string
): WealthAdjustOffer | undefined {
  return (game.pendingWealthAdjustments ?? []).find((o) => o.playerId === playerId);
}

export function takeWealthAdjustOffer(
  game: GameState,
  offerId: unknown,
  playerId: string
): WealthAdjustOffer | undefined {
  if (typeof offerId !== "string" || !offerId) return undefined;
  const offers = game.pendingWealthAdjustments ?? [];
  const idx = offers.findIndex((o) => o.offerId === offerId && o.playerId === playerId);
  if (idx === -1) return undefined;
  const [offer] = offers.splice(idx, 1);
  game.pendingWealthAdjustments = offers;
  return offer;
}

export function proposeWealthAdjust(
  game: GameState,
  playerId: string,
  delta: unknown
):
  | { ok: true; offer: WealthAdjustOffer; replaced?: WealthAdjustOffer; player: Player }
  | { ok: false; message: string } {
  if (!isValidWealthDelta(delta)) {
    return { ok: false, message: "调整金额须为非零整数" };
  }
  const player = game.players.find((p) => p.id === playerId);
  if (!player || isAiPlayer(player)) {
    return { ok: false, message: "调整对象无效" };
  }
  if (!Number.isSafeInteger(player.wealth) || !Number.isSafeInteger(player.wealth + delta)) {
    return { ok: false, message: "调整后财富超出范围" };
  }
  const { offer, replaced } = createWealthAdjustOffer(game, player.id, delta);
  return { ok: true, offer, replaced, player };
}

export function claimWealthAdjustResponse(
  game: GameState,
  playerId: string,
  offerId: unknown,
  accept: boolean
):
  | { ok: true; delta: number; wealthAfter?: number }
  | { ok: false; message: string } {
  if (typeof offerId !== "string" || !offerId) {
    return { ok: false, message: "财富调整已失效" };
  }
  const player = game.players.find((p) => p.id === playerId);
  const pending = (game.pendingWealthAdjustments ?? []).find(
    (o) => o.offerId === offerId && o.playerId === playerId
  );
  if (!pending || !player) {
    return { ok: false, message: "财富调整已失效" };
  }
  if (accept) {
    if (!Number.isSafeInteger(player.wealth + pending.delta)) {
      return { ok: false, message: "调整后财富超出范围" };
    }
  }
  const offer = takeWealthAdjustOffer(game, offerId, playerId);
  if (!offer) {
    return { ok: false, message: "财富调整已失效" };
  }
  if (!accept) {
    return { ok: true, delta: offer.delta };
  }
  player.wealth += offer.delta;
  return { ok: true, delta: offer.delta, wealthAfter: player.wealth };
}

export type RevokeWealthAdjustResult =
  | { ok: true; playerId: string; offerId: string; delta: number }
  | { ok: false; message: string };

export function revokeWealthAdjustOffer(
  game: GameState,
  playerId: string
): RevokeWealthAdjustResult {
  if (typeof playerId !== "string" || !playerId) {
    return { ok: false, message: "玩家无效" };
  }
  const offers = game.pendingWealthAdjustments ?? [];
  const idx = offers.findIndex((o) => o.playerId === playerId);
  if (idx === -1) {
    return { ok: false, message: "没有待确认的财富调整" };
  }
  const [offer] = offers.splice(idx, 1);
  game.pendingWealthAdjustments = offers;
  return { ok: true, playerId: offer.playerId, offerId: offer.offerId, delta: offer.delta };
}
