import { GameState } from "../state/gameState.js";
import { allow } from "../util/rateLimit.js";

export const MAX_ROOMS_PER_IP = 3;
export const ROOM_CREATE_LIMIT = 3;
export const ROOM_CREATE_WINDOW_MS = 10 * 60_000;

export function roomsCreatedByIp(rooms: Record<string, GameState>, ip: string): number {
  return Object.values(rooms).filter((g) => g.createdByIp === ip).length;
}

/** 仅在准备创建新房间时调用；加入已有房间不要调用。 */
export function canCreateRoom(
  rooms: Record<string, GameState>,
  ip: string,
  now = Date.now()
): { ok: true } | { ok: false; message: string } {
  if (roomsCreatedByIp(rooms, ip) >= MAX_ROOMS_PER_IP) {
    return { ok: false, message: "当前网络房间过多，请稍后再试" };
  }
  if (!allow(`roomcreate:${ip}`, ROOM_CREATE_LIMIT, ROOM_CREATE_WINDOW_MS, now)) {
    return { ok: false, message: "建房过于频繁，请稍后再试" };
  }
  return { ok: true };
}
