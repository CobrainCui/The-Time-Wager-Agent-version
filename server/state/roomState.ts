import { GameState } from "./gameState.js";

export function markPlayerFinished(game: GameState, playerId: string) {
  game.phaseFinished.add(playerId);
  const activePlayers = game.players.filter(p => p.connected);
  return game.phaseFinished.size >= activePlayers.length;
}

export function autoFinishDisconnected(game: GameState) {
  game.players.forEach(player => {
    if (!player.connected) game.phaseFinished.add(player.id);
  });
}
