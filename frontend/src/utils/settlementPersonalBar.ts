export function repairPersonalRoundSlices(slices: number[], total: number, thisRound: number): number[] {
  const positive = slices.filter((x) => x > 0);
  const sum = positive.reduce((s, x) => s + x, 0);
  if (total <= 0) return [];
  if (positive.length === 0) {
    if (thisRound > 0 && total > thisRound) return [total - thisRound, thisRound];
    return [total];
  }
  if (sum === total) return positive;
  if (sum < total) return [...positive, total - sum];
  const excess = sum - total;
  const trimmed = [...positive];
  trimmed[trimmed.length - 1] = Math.max(0, trimmed[trimmed.length - 1]! - excess);
  return trimmed.filter((x) => x > 0);
}

/** 与 GlobalCard 个人条分段一致：兜底单段并修复 sum 与累计不等 */
export function normalizePersonalSlices(repaired: number[], personalEnergy: number): number[] {
  if (personalEnergy <= 0) return [];
  if (repaired.length === 0) return [personalEnergy];
  const sum = repaired.reduce((s, x) => s + x, 0);
  if (sum === personalEnergy) return repaired;
  return repairPersonalRoundSlices(repaired, personalEnergy, 0);
}

export function formatPersonalBarCaption(
  personalLabel: string,
  slices: number[],
  total: number,
  maxEnergy: number,
  hideCapRatio: boolean
): string {
  if (total <= 0) {
    if (hideCapRatio) return `${personalLabel} 0`;
    if (maxEnergy > 0) return `${personalLabel} 0 / ${maxEnergy}`;
    return personalLabel;
  }
  const displaySlices = slices.length > 0 ? slices : [total];
  const amounts = displaySlices.join(" + ");
  if (hideCapRatio) return `${personalLabel} ${amounts}`;
  return `${personalLabel} ${amounts} / ${maxEnergy}`;
}
