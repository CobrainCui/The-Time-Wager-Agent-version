import { GameState } from "./gameState.js";

/**
 * 玩家个人日志
 */
export function logForPlayer(
  game: GameState,
  playerId: string,
  message: string
) {
  if (!game.playerLogs) game.playerLogs = {};
  if (!game.playerLogs[playerId]) {
    game.playerLogs[playerId] = [];
  }
  game.playerLogs[playerId].push(message);
}

/**
 * 全局日志（上帝视角）
 */
export function logGlobal(game: GameState, message: string) {
  game.logs.push(message);
}
