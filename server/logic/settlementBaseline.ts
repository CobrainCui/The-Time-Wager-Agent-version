import {
  ActiveProject,
  GameState,
  Player,
  RoundBuffPlayRecord,
  LighterBurnDeclaration,
} from "../state/gameState.js";

export type SettlementBaseline = {
  round: number;
  currentEra: number;
  roundInEra: number;
  activeProjects: ActiveProject[];
  uncompletedProjects: ActiveProject[];
  completedProjects: ActiveProject[];
  players: Player[];
  lighterBurnDeclarations?: LighterBurnDeclaration[];
  roundBuffPlays?: RoundBuffPlayRecord[];
};

function cloneJson<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

export function captureSettlementBaseline(game: GameState): SettlementBaseline {
  return {
    round: game.globalRound,
    currentEra: game.currentEra,
    roundInEra: game.roundInEra,
    activeProjects: cloneJson(game.activeProjects),
    uncompletedProjects: cloneJson(game.uncompletedProjects),
    completedProjects: cloneJson(game.completedProjects),
    players: cloneJson(game.players),
    lighterBurnDeclarations: game.lighterBurnDeclarations
      ? cloneJson(game.lighterBurnDeclarations)
      : undefined,
    roundBuffPlays: game.roundBuffPlays ? cloneJson(game.roundBuffPlays) : undefined,
  };
}

export function restoreSettlementBaseline(game: GameState, baseline: SettlementBaseline): void {
  if (
    baseline.round !== game.globalRound ||
    baseline.currentEra !== game.currentEra ||
    baseline.roundInEra !== game.roundInEra
  ) {
    throw new Error("结算快照与当前轮次不一致");
  }
  game.activeProjects = cloneJson(baseline.activeProjects);
  game.uncompletedProjects = cloneJson(baseline.uncompletedProjects);
  game.completedProjects = cloneJson(baseline.completedProjects);
  game.players = cloneJson(baseline.players);
  game.lighterBurnDeclarations = baseline.lighterBurnDeclarations
    ? cloneJson(baseline.lighterBurnDeclarations)
    : [];
  game.roundBuffPlays = baseline.roundBuffPlays ? cloneJson(baseline.roundBuffPlays) : [];
}
