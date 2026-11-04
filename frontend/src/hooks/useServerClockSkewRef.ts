import { useRef } from "react";
import { computeClockSkewMs } from "../utils/actionCountdown";

/** 仅在 gameUpdate 带来新 serverNow 时校准 skew；避免倒计时 setState 重渲染把 skew 刷成常数导致 UI 卡住 */
export function useServerClockSkewRef(serverNow?: number) {
  const skewRef = useRef(0);
  const lastServerNowRef = useRef<number | undefined>(undefined);

  if (serverNow != null && serverNow !== lastServerNowRef.current) {
    lastServerNowRef.current = serverNow;
    skewRef.current = computeClockSkewMs(serverNow);
  }

  return skewRef;
}
