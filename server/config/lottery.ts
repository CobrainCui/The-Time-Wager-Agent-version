/**
 * 彩票线上随机开奖配置。
 *
 * 规则：掷 1 颗六面骰，点数决定奖金（非负整数）。
 * 默认优先调用 random.org 的公开随机数接口；网络不可用或超时则退回
 * Node crypto.randomInt，并在导出里标记真实来源。
 */

function envFlag(name: string, fallback: boolean): boolean {
  const raw = (process.env[name] ?? "").trim().toLowerCase();
  if (!raw) return fallback;
  return ["1", "true", "yes", "on"].includes(raw);
}

function envInt(name: string, fallback: number, min = 0): number {
  const n = Number(process.env[name]);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.trunc(n));
}

export const LOTTERY_ONLINE_RANDOM = envFlag("LOTTERY_ONLINE_RANDOM", true);
export const LOTTERY_RANDOM_TIMEOUT_MS = envInt("LOTTERY_RANDOM_TIMEOUT_MS", 2_500, 500);
export const LOTTERY_RANDOM_ENDPOINT =
  "https://www.random.org/integers/?num=1&min=1&max=6&col=1&base=10&format=plain&rnd=new";

/** 点数 → 奖金。索引 0 对应骰子 1。 */
export const LOTTERY_PRIZE_BY_ROLL = [0, 30, 60, 90, 120, 200] as const;

export const LOTTERY_ROLL_MIN = 1;
export const LOTTERY_ROLL_MAX = 6;
