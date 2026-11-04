import { GameState } from "./gameState.js";

/** 投资阶段操作倒计时（10 分钟） */
export const ACTION_DEADLINE_MS = 10 * 60 * 1000;

/** 倒计时剩余不超过该时长时禁止发动道具卡 */
export const BUFF_LOCKOUT_REMAINING_MS = 2 * 60 * 1000;

/** 第 1 时代第 1 轮投资倒计时（12 分钟） */
export const ACTION_DEADLINE_ERA1_R1_MS = 12 * 60 * 1000;

export function getActionDeadlineMs(game: GameState): number {
  if (game.currentEra === 1 && game.roundInEra === 1) {
    return ACTION_DEADLINE_ERA1_R1_MS;
  }
  return ACTION_DEADLINE_MS;
}

/** 主持重置日志 / 确认文案用，如 `12:00` */
export function formatActionDeadlineClock(game: GameState): string {
  const minutes = getActionDeadlineMs(game) / (60 * 1000);
  return `${minutes}:00`;
}

export function clearActionDeadline(game: GameState): void {
  game.investmentEndsAt = undefined;
  game.buffPhaseEndsAt = undefined;
  game.investmentTimerPausedAt = undefined;
}

/** 投资倒计时剩余毫秒（暂停时冻结为 endsAt - pausedAt） */
export function isInvestmentBuffLockoutActive(game: GameState, now = Date.now()): boolean {
  if (game.phase !== "INVESTMENT") return false;
  if (typeof game.investmentEndsAt !== "number") return false;
  const remaining = getInvestmentRemainingMs(game, now);
  return remaining > 0 && remaining <= BUFF_LOCKOUT_REMAINING_MS;
}

export function getInvestmentRemainingMs(game: GameState, now = Date.now()): number {
  if (typeof game.investmentEndsAt !== "number") return 0;
  const pausedAt = game.investmentTimerPausedAt;
  if (typeof pausedAt === "number") {
    return Math.max(0, game.investmentEndsAt - pausedAt);
  }
  return Math.max(0, game.investmentEndsAt - now);
}

export type InvestmentTimerControlResult =
  | { ok: true }
  | { ok: false; message: string };

/** 暂停投资倒计时（保留 endsAt，写 pausedAt） */
export function pauseInvestmentDeadline(game: GameState): InvestmentTimerControlResult {
  if (game.phase !== "INVESTMENT") {
    return { ok: false, message: "仅投资阶段可暂停倒计时" };
  }
  if (typeof game.investmentEndsAt !== "number") {
    return { ok: false, message: "当前没有进行中的倒计时" };
  }
  if (typeof game.investmentTimerPausedAt === "number") {
    return { ok: false, message: "倒计时已暂停" };
  }
  if (getInvestmentRemainingMs(game) <= 0) {
    return { ok: false, message: "倒计时已结束" };
  }
  game.investmentTimerPausedAt = Date.now();
  return { ok: true };
}

/** 继续投资倒计时：endsAt = now + 冻结剩余 */
export function resumeInvestmentDeadline(game: GameState): InvestmentTimerControlResult {
  if (game.phase !== "INVESTMENT") {
    return { ok: false, message: "仅投资阶段可继续倒计时" };
  }
  if (typeof game.investmentEndsAt !== "number") {
    return { ok: false, message: "当前没有进行中的倒计时" };
  }
  if (typeof game.investmentTimerPausedAt !== "number") {
    return { ok: false, message: "倒计时未暂停" };
  }
  const remaining = getInvestmentRemainingMs(game);
  game.investmentEndsAt = Date.now() + remaining;
  game.investmentTimerPausedAt = undefined;
  return { ok: true };
}

/** 仅在 INVESTMENT 阶段开表（全员离开道具阶段后） */
export function startInvestmentDeadline(game: GameState): void {
  if (game.phase !== "INVESTMENT") {
    console.warn(
      `startInvestmentDeadline ignored: expected INVESTMENT, got ${game.phase}`
    );
    return;
  }
  clearActionDeadline(game);
  game.investmentEndsAt = Date.now() + getActionDeadlineMs(game);
}
