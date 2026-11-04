import { GameState } from "../types";
import { BUFF_LOCKOUT_REMAINING_MS } from "../config/playerHelpReference";
import { getRemainingMs } from "./actionCountdown";

export function isInvestmentBuffLockout(game: GameState, clockSkewMs: number): boolean {
  if (game.phase !== "INVESTMENT" || typeof game.investmentEndsAt !== "number") {
    return false;
  }
  const remaining = getRemainingMs(
    game.investmentEndsAt,
    clockSkewMs,
    game.investmentTimerPausedAt
  );
  return remaining > 0 && remaining <= BUFF_LOCKOUT_REMAINING_MS;
}
