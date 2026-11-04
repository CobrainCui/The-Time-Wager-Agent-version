import { useEffect, useState } from "react";
import { computeClockSkewMs, getRemainingSeconds } from "../utils/actionCountdown";
import { useServerClockSkewRef } from "./useServerClockSkewRef";

/** 投资阶段倒计时（秒）；pausedAt 有值时冻结不递减 */
export function useActionCountdown(
  enabled: boolean,
  endsAt: number | undefined,
  serverNow: number | undefined,
  pausedAt?: number | undefined
): number {
  const skewRef = useServerClockSkewRef(serverNow);
  const [timeLeft, setTimeLeft] = useState(() => {
    if (!enabled || !endsAt) return 0;
    const skew = serverNow != null ? computeClockSkewMs(serverNow) : 0;
    return getRemainingSeconds(endsAt, skew, pausedAt);
  });

  useEffect(() => {
    if (!enabled || !endsAt) {
      setTimeLeft(0);
      return;
    }
    if (typeof pausedAt === "number") {
      setTimeLeft(getRemainingSeconds(endsAt, 0, pausedAt));
      return;
    }
    const tick = () => setTimeLeft(getRemainingSeconds(endsAt, skewRef.current));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [enabled, endsAt, serverNow, pausedAt, skewRef]);

  return timeLeft;
}
