import { GameState, Player } from "../state/gameState.js";
import { resetCoffeePurchasesForRound } from "./coffeeLogic.js";

/**
 * 每轮人均精力。同一时代的两轮相同，同一轮所有玩家相同。
 * 六人版为基准；五人、四人让全场总精力尽量对齐 576。
 * 人数按开局时的在线人数写入 game.energyTableSize。
 * 第 1 轮进入消耗阶段前，进出房间会按新的在线人数重锁；之后固定。
 * 投资开始后才进房的人，本轮精力为 0，下一轮再跟大家一起发。
 * 下一轮精力由 peekNextRoundEnergy 下发，前端不再自备一份表。
 */
const ENERGY_BY_PLAYER_COUNT: Record<number, Record<number, number>> = {
  6: { 1: 15, 2: 13, 3: 11, 4: 9 },
  5: { 1: 18, 2: 16, 3: 13, 4: 11 },
  4: { 1: 23, 2: 20, 3: 16, 4: 13 },
};

const SIX_PLAYER = ENERGY_BY_PLAYER_COUNT[6];

/** 本轮精力已经发出、尚未被下一轮覆盖的阶段。 */
const ACTIVE_ROUND_PHASES = new Set<GameState["phase"]>([
  "ERA_INTRO",
  "TUTORIAL",
  "AUCTION",
  "BUFF_USAGE",
]);

/** 当前在线人数。离线空位不参与定档。 */
function seatedCount(game: GameState): number {
  let count = 0;
  for (const player of game.players) {
    if (player.connected) count += 1;
  }
  return count;
}

/** 4/5/6 人用对应表；其他正人数沿用六人表。人数或时代无效时返回 0。 */
export function energyForRound(playerCount: number, era: number): number {
  if (playerCount <= 0 || era < 1 || era > 4) return 0;
  const table = ENERGY_BY_PLAYER_COUNT[playerCount] ?? SIX_PLAYER;
  return table[era];
}

/**
 * 把全员精力设成当前时代的同一数值。
 * 换轮不传 relock，不改档。只有当时在线的玩家领到本轮精力；离线为 0，重连且尚未发放时再补。
 */
export function applyRoundEnergy(game: GameState, options?: { relock?: boolean }): void {
  if (options?.relock || game.energyTableSize == null) {
    const seated = seatedCount(game);
    if (seated > 0) game.energyTableSize = seated;
  }
  const count = game.energyTableSize ?? seatedCount(game);
  const energy = energyForRound(count, game.currentEra);
  if (energy <= 0) return;
  resetCoffeePurchasesForRound(game);
  for (const player of game.players) {
    if (!player.connected) {
      player.energy = 0;
      player.receivedRoundEnergy = false;
      continue;
    }
    player.energy = energy;
    player.receivedRoundEnergy = true;
  }
}

/** 第 1 轮还没进入可消耗精力的阶段时，座位变化可以重锁人数。 */
function energyTableStillOpen(game: GameState): boolean {
  return (
    game.energyTableSize != null &&
    game.globalRound === 1 &&
    game.currentEra === 1 &&
    game.roundInEra === 1 &&
    (game.phase === "ERA_INTRO" ||
      game.phase === "TUTORIAL" ||
      game.phase === "AUCTION")
  );
}

/** 开局之后才加入的玩家。投资或结算阶段本轮精力已经在用，不再补发。 */
function assignJoiningPlayerEnergy(game: GameState, player: Player): void {
  if (game.energyTableSize == null) return;
  if (game.phase === "INVESTMENT" || game.phase === "SETTLEMENT") {
    player.energy = 0;
    player.receivedRoundEnergy = true;
    return;
  }
  if (!ACTIVE_ROUND_PHASES.has(game.phase)) return;
  const energy = energyForRound(game.energyTableSize, game.currentEra);
  if (energy <= 0) return;
  player.energy = energy;
  player.receivedRoundEnergy = true;
}

/**
 * 加人 / 踢人之后调用。
 * 第 1 轮尚未消耗精力时，按新人数重锁并重发本轮精力；之后只给新玩家补精力。
 */
export function syncEnergyAfterRosterChange(game: GameState, joined?: Player): void {
  if (energyTableStillOpen(game)) {
    applyRoundEnergy(game, { relock: true });
    return;
  }
  if (joined && !joined.receivedRoundEnergy) {
    assignJoiningPlayerEnergy(game, joined);
  }
}

/** 结算页「下一轮精力」。终局返回 null。用已锁定的人数，与真正发精力的规则一致。 */
export function peekNextRoundEnergy(game: GameState): number | null {
  const nextEra = game.roundInEra === 2 ? game.currentEra + 1 : game.currentEra;
  if (nextEra > 4) return null;
  const count = game.energyTableSize ?? seatedCount(game);
  return energyForRound(count, nextEra) || null;
}

const FULL_GAME_TOTALS: Record<number, number> = { 4: 576, 5: 580, 6: 576 };
for (const count of [4, 5, 6]) {
  let total = 0;
  for (let era = 1; era <= 4; era++) total += energyForRound(count, era) * count * 2;
  if (total !== FULL_GAME_TOTALS[count]) {
    throw new Error(`精力表与设计不符: ${count}人全场 ${total}，应为 ${FULL_GAME_TOTALS[count]}`);
  }
}
