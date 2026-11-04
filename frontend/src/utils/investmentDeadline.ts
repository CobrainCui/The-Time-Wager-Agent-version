import type { GameState } from "../types";

/** 与 server `getActionDeadlineMs` 规则一致（仅主持确认文案等静态展示） */
export function getInvestmentDeadlineMinutes(
  game: Pick<GameState, "currentEra" | "roundInEra">
): number {
  if (game.currentEra === 1 && game.roundInEra === 1) return 12;
  return 10;
}

export function formatInvestmentDeadlineClock(
  game: Pick<GameState, "currentEra" | "roundInEra">
): string {
  return `${getInvestmentDeadlineMinutes(game)}:00`;
}
