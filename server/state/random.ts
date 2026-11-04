import type { GameState } from "./gameState.js";
import { nextRandomValue } from "../utils/rng.js";

/** 从本局的可复现随机流取一个 [0,1) 值。 */
export function gameRandom(game: GameState): number {
  const [value, state] = nextRandomValue(game.rngState);
  game.rngState = state;
  return value;
}

/** Fisher–Yates，使用本局随机流。 */
export function gameShuffle<T>(game: GameState, items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(gameRandom(game) * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
