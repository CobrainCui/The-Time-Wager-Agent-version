/** 与 server/logic/rankRewardSchedule.ts 算法一致 */

function enforceNonIncreasing(values: number[]): void {
  for (let i = 0; i < values.length - 1; i++) {
    while (values[i] < values[i + 1]) {
      values[i + 1] -= 1;
      values[i] += 1;
    }
  }
}

/** 排名奖/投爆罚档位数：1–3 人按五人档，4/5/6 按实际人数 */
export function resolveRankRewardTierCount(playerCount: number): number {
  if (playerCount >= 1 && playerCount <= 3) return 5;
  if (playerCount >= 6) return 6;
  if (playerCount === 4 || playerCount === 5) return playerCount;
  return 6;
}

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
  return result;
}

/** 展示/说明用；缺省六人基准 */
export function effectiveRankRewards(
  base?: number[],
  playerCount?: number
): number[] | undefined {
  if (!base?.length) return undefined;
  const raw = playerCount && playerCount > 0 ? playerCount : 6;
  return scaleRankRewardsForPlayerCount(base, raw);
}

export function resolveRankRewardTierCountFromGame(game: {
  energyTableSize?: number;
  players: { connected: boolean }[];
}): number {
  return resolveRankRewardTierCount(resolveRankPlayerCountFromGame(game));
}

/** 与 server resolveRankPlayerCount 一致 */
export function resolveRankPlayerCountFromGame(game: {
  energyTableSize?: number;
  players: { connected: boolean }[];
}): number {
  if (game.energyTableSize != null && game.energyTableSize > 0) {
    return game.energyTableSize;
  }
  let count = 0;
  for (const p of game.players) {
    if (p.connected) count += 1;
  }
  return count > 0 ? count : 6;
}
