import { GameState, Player } from "../types";

export type AdminPdfCaptureJob = {
  game: GameState;
  player: Player;
};

/** 导出 PDF 时冻结对局快照，避免 gameUpdate 中途篡改玩家/项目数据 */
export function freezeGameForPdfExport(game: GameState, player: Player): AdminPdfCaptureJob {
  const live =
    game.players.find((p) => p.id === player.id) ?? player;

  const players = game.players.map((p) => ({
    ...p,
    investment: { ...p.investment },
    longTerm: Object.fromEntries(
      Object.entries(p.longTerm ?? {}).map(([k, v]) => [k, { ...v }]),
    ),
    wealthHistory: [...(p.wealthHistory ?? [])],
    inventory: [...(p.inventory ?? [])],
    usedCards: [...(p.usedCards ?? [])],
    analysisResult: p.analysisResult ? { ...p.analysisResult, scores: { ...p.analysisResult.scores } } : undefined,
  }));

  const frozenPlayer = players.find((p) => p.id === live.id)!;

  return {
    game: {
      ...game,
      players,
      activeProjects: [...game.activeProjects],
      uncompletedProjects: [...game.uncompletedProjects],
      completedProjects: [...game.completedProjects],
    },
    player: frozenPlayer,
  };
}
