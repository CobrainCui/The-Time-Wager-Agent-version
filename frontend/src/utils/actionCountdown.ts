/** 在收到服务端 serverNow 的瞬间计算偏差，之后 tick 时复用该固定值 */
export function computeClockSkewMs(serverNow: number): number {
  return serverNow - Date.now();
}

/** pausedAt 有值时剩余冻结为 endsAt - pausedAt（两端均为服务端绝对时间） */
export function getRemainingMs(
  endsAt: number,
  clockSkewMs: number,
  pausedAt?: number
): number {
  if (typeof pausedAt === "number") {
    return Math.max(0, endsAt - pausedAt);
  }
  return endsAt - Date.now() - clockSkewMs;
}

export function getRemainingSeconds(
  endsAt: number,
  clockSkewMs: number,
  pausedAt?: number
): number {
  return Math.max(0, Math.floor(getRemainingMs(endsAt, clockSkewMs, pausedAt) / 1000));
}
