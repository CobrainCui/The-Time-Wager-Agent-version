import { GameState, Player } from "../state/gameState.js";

export type DeviceClaimRequest = {
  playerId: string;
  socketId: string;
  requestedAt: number;
};

export type DeviceClaimPublic = Pick<DeviceClaimRequest, "playerId" | "requestedAt">;

export function pendingDeviceClaimsForGodView(game: GameState): DeviceClaimPublic[] {
  return (game.pendingDeviceClaims ?? []).map(({ playerId, requestedAt }) => ({
    playerId,
    requestedAt,
  }));
}

export function findDeviceClaimByPlayer(
  game: GameState,
  playerId: string
): DeviceClaimRequest | undefined {
  return (game.pendingDeviceClaims ?? []).find((c) => c.playerId === playerId);
}

export function findDeviceClaimBySocket(
  game: GameState,
  socketId: string
): DeviceClaimRequest | undefined {
  return (game.pendingDeviceClaims ?? []).find((c) => c.socketId === socketId);
}

/** 同一座位只保留最新等待连接；返回被顶替的旧请求（若有） */
export function upsertDeviceClaim(
  game: GameState,
  playerId: string,
  socketId: string
): DeviceClaimRequest | undefined {
  const list = game.pendingDeviceClaims ?? [];
  const replaced = list.find((c) => c.playerId === playerId);
  game.pendingDeviceClaims = list.filter((c) => c.playerId !== playerId);
  game.pendingDeviceClaims.push({
    playerId,
    socketId,
    requestedAt: Date.now(),
  });
  return replaced;
}

export function removeDeviceClaimBySocket(game: GameState, socketId: string): boolean {
  const list = game.pendingDeviceClaims ?? [];
  const next = list.filter((c) => c.socketId !== socketId);
  if (next.length === list.length) return false;
  game.pendingDeviceClaims = next.length ? next : undefined;
  return true;
}

export function removeDeviceClaimByPlayer(game: GameState, playerId: string): boolean {
  const list = game.pendingDeviceClaims ?? [];
  const next = list.filter((c) => c.playerId !== playerId);
  if (next.length === list.length) return false;
  game.pendingDeviceClaims = next.length ? next : undefined;
  return true;
}

export function takeDeviceClaimForPlayer(
  game: GameState,
  playerId: string,
  expectedSocketId: string
): DeviceClaimRequest | undefined {
  const claim = findDeviceClaimByPlayer(game, playerId);
  if (!claim || claim.socketId !== expectedSocketId) return undefined;
  removeDeviceClaimByPlayer(game, playerId);
  return claim;
}
