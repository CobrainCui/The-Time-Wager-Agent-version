import type { ChatUsage, GameState, Phase } from "../state/gameState.js";

/** 这些阶段不开放自由聊天（与群聊保持一致）。 */
export const CHAT_BLOCKED_PHASES: ReadonlySet<Phase> = new Set<Phase>([
  "ROOM_WAITING",
  "ERA_INTRO",
  "TUTORIAL",
]);

function envInt(key: string, fallback: number): number {
  const n = Number(process.env[key]);
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : fallback;
}

/** 每名玩家每轮（globalRound）最多公开发言条数。 */
export const MAX_PUBLIC_MESSAGES_PER_ROUND = envInt("CHAT_MAX_PUBLIC_PER_ROUND", 6);
/** 每名玩家每轮最多私聊条数。 */
export const MAX_PRIVATE_MESSAGES_PER_ROUND = envInt("CHAT_MAX_PRIVATE_PER_ROUND", 6);
/** 单条消息最大长度（字符）。 */
export const MAX_CHAT_MESSAGE_LENGTH = 500;

export function chatUsageFor(game: GameState, playerId: string): ChatUsage {
  if (!game.chatUsage) game.chatUsage = {};
  const current = game.chatUsage[playerId];
  if (!current || current.round !== game.globalRound) {
    const fresh: ChatUsage = { round: game.globalRound, public: 0, private: 0 };
    game.chatUsage[playerId] = fresh;
    return fresh;
  }
  return current;
}

export function recordPublicChat(game: GameState, playerId: string): void {
  chatUsageFor(game, playerId).public += 1;
}

export function recordPrivateChat(game: GameState, playerId: string): void {
  chatUsageFor(game, playerId).private += 1;
}

export function chatQuotaError(
  game: GameState,
  playerId: string,
  channel: "public" | "private"
): string | null {
  if (CHAT_BLOCKED_PHASES.has(game.phase)) return "当前阶段无法发送消息";
  const usage = chatUsageFor(game, playerId);
  const max = channel === "public" ? MAX_PUBLIC_MESSAGES_PER_ROUND : MAX_PRIVATE_MESSAGES_PER_ROUND;
  const used = channel === "public" ? usage.public : usage.private;
  if (used >= max) {
    return channel === "public"
      ? `本轮公开聊天已达上限（${max} 条）`
      : `本轮私聊已达上限（${max} 条）`;
  }
  return null;
}
