import { GameState } from "../state/gameState.js";
import { eraCards } from "../data/game_data.js";
import { shuffleArray } from "../utils/shuffle.js";

export function drawEraCard(game: GameState) {
  // 每个时代只抽一次（两轮）
  if (game.roundInEra !== 1) return;

  const card = shuffleArray(eraCards)[0];
  game.currentEraCard = card;

  game.logs.push(
    `🌍 进入时代「${card.name}」：${card.era}`
  );
}
