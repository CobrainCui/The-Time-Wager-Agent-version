import { randomInt } from "node:crypto";
import {
  LOTTERY_ONLINE_RANDOM,
  LOTTERY_PRIZE_BY_ROLL,
  LOTTERY_RANDOM_ENDPOINT,
  LOTTERY_RANDOM_TIMEOUT_MS,
  LOTTERY_ROLL_MAX,
  LOTTERY_ROLL_MIN,
} from "../config/lottery.js";

export type LotteryDrawSource = "random.org" | "server";

export interface LotteryDraw {
  roll: number;
  amount: number;
  source: LotteryDrawSource;
  drawnAt: number;
}

type FetchLike = (
  input: string,
  init?: { signal?: AbortSignal }
) => Promise<{ ok: boolean; text: () => Promise<string> }>;

export interface DrawLotteryOptions {
  /** 测试或需要完全离线时传入 false */
  online?: boolean;
  timeoutMs?: number;
  fetchImpl?: FetchLike | null;
}

export function isValidLotteryRoll(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= LOTTERY_ROLL_MIN &&
    value <= LOTTERY_ROLL_MAX
  );
}

export function lotteryAmountForRoll(roll: number): number {
  if (!isValidLotteryRoll(roll)) throw new Error(`invalid lottery roll: ${roll}`);
  return LOTTERY_PRIZE_BY_ROLL[roll - 1] ?? 0;
}

export function buildLotteryDraw(roll: number, source: LotteryDrawSource, drawnAt = Date.now()): LotteryDraw {
  return { roll, amount: lotteryAmountForRoll(roll), source, drawnAt };
}

/** 服务端加密随机（离线兜底） */
export function serverRandomRoll(): number {
  return randomInt(LOTTERY_ROLL_MIN, LOTTERY_ROLL_MAX + 1);
}

async function fetchRandomOrgRoll(
  fetchImpl: FetchLike,
  timeoutMs: number
): Promise<number | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(LOTTERY_RANDOM_ENDPOINT, { signal: controller.signal });
    if (!response.ok) return null;
    const text = (await response.text()).trim();
    // random.org 正常返回一行整数；防止代理页面/错误页混进来
    if (!/^\d+$/.test(text)) return null;
    const roll = Number(text);
    return isValidLotteryRoll(roll) ? roll : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 线上随机开奖：优先 random.org，失败/超时/关闭时使用 crypto 随机。
 * 永不抛异常——彩票不能因为第三方接口故障卡住整局。
 */
export async function drawLotteryRoll(options: DrawLotteryOptions = {}): Promise<LotteryDraw> {
  const online = options.online ?? LOTTERY_ONLINE_RANDOM;
  const fetchImpl =
    options.fetchImpl === undefined
      ? (typeof fetch === "function" ? (fetch as unknown as FetchLike) : null)
      : options.fetchImpl;
  const timeoutMs = options.timeoutMs ?? LOTTERY_RANDOM_TIMEOUT_MS;

  if (online && fetchImpl) {
    const roll = await fetchRandomOrgRoll(fetchImpl, timeoutMs);
    if (roll != null) return buildLotteryDraw(roll, "random.org");
  }
  return buildLotteryDraw(serverRandomRoll(), "server");
}
