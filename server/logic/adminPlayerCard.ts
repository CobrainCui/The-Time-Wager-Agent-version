import { buffCards } from "../data/game_data.js";
import { GameState, Player } from "../state/gameState.js";
import { isAiPlayer } from "../util/isAiPlayer.js";

export const ADMIN_GRANTABLE_CARD_IDS: readonly string[] = buffCards.map((c) => c.id);
const CARD_ID_SET = new Set(ADMIN_GRANTABLE_CARD_IDS);

export type AdminCardAdjustAction = "add" | "remove";

export function cardDisplayName(cardId: string): string {
  return buffCards.find((c) => c.id === cardId)?.name ?? cardId;
}

export function parseInventoryIndex(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) {
    const n = Number(value);
    return Number.isSafeInteger(n) ? n : undefined;
  }
  return undefined;
}

/** 发动/收回手牌时定位具体一张（支持同名多张） */
export function resolveInventoryIndexForCard(
  inventory: string[],
  cardId: string,
  inventoryIndex?: unknown
): { ok: true; index: number } | { ok: false; error: "missing" | "stale" } {
  const parsed = parseInventoryIndex(inventoryIndex);
  if (parsed !== undefined) {
    if (parsed < 0 || parsed >= inventory.length) return { ok: false, error: "stale" };
    if (inventory[parsed] !== cardId) return { ok: false, error: "stale" };
    return { ok: true, index: parsed };
  }
  const idx = inventory.indexOf(cardId);
  if (idx === -1) return { ok: false, error: "missing" };
  return { ok: true, index: idx };
}

export function adminAdjustPlayerCard(
  game: GameState,
  playerId: string,
  cardId: unknown,
  action: unknown,
  inventoryIndex?: unknown
):
  | { ok: true; player: Player; cardId: string; action: AdminCardAdjustAction; cardName: string }
  | { ok: false; message: string } {
  if (action !== "add" && action !== "remove") {
    return { ok: false, message: "操作无效" };
  }
  const player = game.players.find((p) => p.id === playerId);
  if (!player || isAiPlayer(player)) {
    return { ok: false, message: "目标玩家无效" };
  }
  if (!player.inventory) player.inventory = [];

  if (action === "add") {
    if (typeof cardId !== "string" || !CARD_ID_SET.has(cardId)) {
      return { ok: false, message: "道具无效" };
    }
    player.inventory.push(cardId);
    return { ok: true, player, cardId, action, cardName: cardDisplayName(cardId) };
  }

  if (typeof cardId !== "string" || !cardId) {
    return { ok: false, message: "道具无效" };
  }
  const resolved = resolveInventoryIndexForCard(player.inventory, cardId, inventoryIndex);
  if (!resolved.ok) {
    if (resolved.error === "stale") {
      return { ok: false, message: "手牌已变化，请关闭后重试" };
    }
    return { ok: false, message: "手牌中没有该道具，只能收回未使用的手牌" };
  }
  const idx = resolved.index;
  player.inventory.splice(idx, 1);
  return { ok: true, player, cardId, action, cardName: cardDisplayName(cardId) };
}
