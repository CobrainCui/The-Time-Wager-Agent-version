import { GameState } from "../state/gameState.js";
import { longTermProjects, shortTermProjects } from "../data/game_data.js";

/** 与 energySchedule 一致：已锁定人数优先，否则在线人数 */
export function resolveRankPlayerCount(game: GameState): number {
  if (game.energyTableSize != null && game.energyTableSize > 0) {
    return game.energyTableSize;
  }
  let count = 0;
  for (const p of game.players) {
    if (p.connected) count += 1;
  }
  return count > 0 ? count : 6;
}

/** 排名奖缩放档位数：1–3 人按五人档，4/5/6 按实际人数 */
export function resolveRankRewardTierCount(playerCount: number): number {
  if (playerCount >= 1 && playerCount <= 3) return 5;
  if (playerCount >= 6) return 6;
  if (playerCount === 4 || playerCount === 5) return playerCount;
  return 6;
}

export function resolveRankRewardTierCountForGame(game: GameState): number {
  return resolveRankRewardTierCount(resolveRankPlayerCount(game));
}

function enforceNonIncreasing(values: number[]): void {
  for (let i = 0; i < values.length - 1; i++) {
    while (values[i] < values[i + 1]) {
      values[i + 1] -= 1;
      values[i] += 1;
    }
  }
}

/**
 * 六人 rankRewards 为基准；4/5 人生成 N 档递减数组，总和与六人六档之和相同。
 */
export function scaleRankRewardsForPlayerCount(
  base: number[] | undefined,
  playerCount: number
): number[] | undefined {
  if (!base?.length) return base ? [...base] : undefined;
  const tierCount = resolveRankRewardTierCount(playerCount > 0 ? playerCount : 6);
  if (tierCount >= 6 || (tierCount !== 4 && tierCount !== 5)) {
    return [...base];
  }

  const N = tierCount;
  const totalTarget = base.reduce((a, b) => a + b, 0);
  const weights: number[] = [];
  for (let i = 0; i < N; i++) weights.push(N - i);
  const weightSum = weights.reduce((a, b) => a + b, 0);

  const floors = weights.map((w) => Math.floor((totalTarget * w) / weightSum));
  const result = [...floors];
  let remainder = totalTarget - result.reduce((a, b) => a + b, 0);
  for (let i = 0; i < N && remainder > 0; i++) {
    result[i] += 1;
    remainder -= 1;
  }

  enforceNonIncreasing(result);

  if (result.reduce((a, b) => a + b, 0) !== totalTarget) {
    throw new Error("rankRewardSchedule: sum mismatch after scale");
  }

  return result;
}

function assertCatalogRankRewards(): void {
  const cards = [...shortTermProjects, ...longTermProjects];
  for (const card of cards) {
    const base = card.rankRewards;
    if (!base?.length) continue;
    const totalBase = base.reduce((a, b) => a + b, 0);
    for (const n of [4, 5, 6]) {
      const scaled = scaleRankRewardsForPlayerCount(base, n)!;
      const sum = scaled.reduce((a, b) => a + b, 0);
      if (sum !== totalBase) {
        throw new Error(`rankRewardSchedule: card ${card.id} n=${n} sum ${sum} != ${totalBase}`);
      }
      for (let i = 0; i < scaled.length - 1; i++) {
        if (scaled[i] < scaled[i + 1]) {
          throw new Error(`rankRewardSchedule: card ${card.id} n=${n} not non-increasing`);
        }
      }
      if (n === 6 && scaled.length !== base.length) {
        throw new Error(`rankRewardSchedule: card ${card.id} six-player length mismatch`);
      }
      if ((n === 4 || n === 5) && scaled.length !== n) {
        throw new Error(`rankRewardSchedule: card ${card.id} n=${n} length ${scaled.length}`);
      }
    }
  }
}

assertCatalogRankRewards();
