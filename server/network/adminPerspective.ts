import { GameState, Player } from "../state/gameState.js";
import { isAiPlayer } from "../util/isAiPlayer.js";

export type AdminSpectatorSocketData = {
  isSuperAdmin?: boolean;
  adminPerspectivePlayerId?: string;
};

export function isValidHumanPerspectiveTarget(
  game: GameState,
  playerId: string
): Player | null {
  const p = game.players.find((x) => x.id === playerId);
  if (!p || isAiPlayer(p)) return null;
  return p;
}

/** 主持观战：上帝全量 vs 指定玩家过滤包 */
export function resolveAdminSpectatorSerialization(
  game: GameState,
  data: AdminSpectatorSocketData
): {
  extra: Record<string, unknown>;
  viewerPlayerId: string | null;
  perspectiveCleared: boolean;
} {
  const perspectiveId =
    typeof data.adminPerspectivePlayerId === "string"
      ? data.adminPerspectivePlayerId.trim()
      : "";
  if (!perspectiveId) {
    return { extra: { isGodView: true }, viewerPlayerId: null, perspectiveCleared: false };
  }
  const target = isValidHumanPerspectiveTarget(game, perspectiveId);
  if (!target) {
    return { extra: { isGodView: true }, viewerPlayerId: null, perspectiveCleared: true };
  }
  return {
    extra: { adminPerspectivePlayerId: target.id },
    viewerPlayerId: target.id,
    perspectiveCleared: false,
  };
}

export function serializationForMemberSocket(
  game: GameState,
  isSuperAdmin: boolean,
  adminPerspectivePlayerId: string | undefined,
  memberPlayerId: string | null
): {
  extra: Record<string, unknown>;
  viewerPlayerId: string | null;
  clearPerspective: boolean;
} {
  if (isSuperAdmin) {
    const resolved = resolveAdminSpectatorSerialization(game, { adminPerspectivePlayerId });
    return {
      extra: resolved.extra,
      viewerPlayerId: resolved.viewerPlayerId,
      clearPerspective: resolved.perspectiveCleared,
    };
  }
  return { extra: {}, viewerPlayerId: memberPlayerId, clearPerspective: false };
}
