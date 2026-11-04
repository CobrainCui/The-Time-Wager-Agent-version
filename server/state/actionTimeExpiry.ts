import { GameState } from "./gameState.js";
import { forceSubmitPendingInvestments } from "./gameActions.js";
import { tryAdvancePhase } from "./phaseController.js";
import { clearActionDeadline } from "./actionDeadline.js";

/** 投资阶段倒计时结束；BUFF 阶段仅清除残留的 investmentEndsAt */
export function handleActionTimeExpired(game: GameState): boolean {
  if (game.phase === "BUFF_USAGE") {
    if (!game.investmentEndsAt) return false;
    console.warn(
      `Room ${game.roomId}: stale investmentEndsAt during BUFF_USAGE — clearing deadline`
    );
    clearActionDeadline(game);
    return true;
  }

  if (game.phase !== "INVESTMENT") return false;
  if (typeof game.investmentTimerPausedAt === "number") return false;
  if (!game.investmentEndsAt || Date.now() < game.investmentEndsAt) return false;

  clearActionDeadline(game);
  console.log(`⏰ Room ${game.roomId}: investment deadline reached — auto-submitting drafts.`);
  forceSubmitPendingInvestments(game, "deadline");
  tryAdvancePhase(game);
  return true;
}
