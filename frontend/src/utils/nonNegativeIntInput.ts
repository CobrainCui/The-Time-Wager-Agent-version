/** 整数输入：只保留数字，去掉首部多余 0（"05"→"5"，单独 "0" 保留） */
export function normalizeDigitsNonNegativeInt(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits === "") return "";
  return String(parseInt(digits, 10));
}

export function parseNormalizedNonNegativeInt(normalized: string, fallback = 0): number {
  if (normalized === "") return fallback;
  const n = parseInt(normalized, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, n);
}
