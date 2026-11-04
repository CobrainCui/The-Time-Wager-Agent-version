import { useCallback, useEffect, useRef, useState, type SyntheticEvent } from "react";

type ImageFallbackState = {
  /** 当前应渲染的地址 */
  src: string;
  showPlaceholder: boolean;
  /** 已从 primary 切到 fallback */
  usingFallback: boolean;
  onError: (e: SyntheticEvent<HTMLImageElement>) => void;
};

function stripRetryBust(url: string): string {
  return url.replace(/([?&])_retry=\d+(?=&|$)/g, "$1").replace(/[?&]$/, "");
}

function withRetryBust(url: string, attempt: number): string {
  const base = stripRetryBust(url);
  if (!base) return base;
  return `${base}${base.includes("?") ? "&" : "?"}_retry=${attempt}`;
}

function sameLogicalUrl(a: string, b: string): boolean {
  return stripRetryBust(a) === stripRetryBust(b);
}

/**
 * 图片加载：忽略过期 onError；同址 cache-bust 最多两次；有独立 fallback 再回退；最后才占位。
 */
export function useImageWithFallback(
  primary: string,
  fallback?: string | null,
): ImageFallbackState {
  const [src, setSrc] = useState(primary);
  const [showPlaceholder, setShowPlaceholder] = useState(false);
  const [usingFallback, setUsingFallback] = useState(false);
  const wantRef = useRef(primary);
  const sameSrcAttemptsRef = useRef(0);

  const distinctFallback = (() => {
    const fb = fallback?.trim() || "";
    if (!fb || sameLogicalUrl(fb, primary)) return "";
    return fb;
  })();

  useEffect(() => {
    wantRef.current = primary;
    sameSrcAttemptsRef.current = 0;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync display state to new primary URL
    setSrc(primary);
    setShowPlaceholder(false);
    setUsingFallback(false);
  }, [primary, distinctFallback]);

  const onError = useCallback(
    (e: SyntheticEvent<HTMLImageElement>) => {
      const attr = e.currentTarget.getAttribute("src") ?? "";
      if (!attr) return;

      const want = wantRef.current;
      if (attr !== want && !sameLogicalUrl(attr, want)) return;

      // 同逻辑地址最多 bust 两次（中断/瞬时失败），每次换 _retry=n 迫使重请求
      if (sameSrcAttemptsRef.current < 2) {
        sameSrcAttemptsRef.current += 1;
        const busted = withRetryBust(want, sameSrcAttemptsRef.current);
        wantRef.current = busted;
        setSrc(busted);
        return;
      }

      if (distinctFallback && !sameLogicalUrl(distinctFallback, want)) {
        wantRef.current = distinctFallback;
        sameSrcAttemptsRef.current = 0;
        setUsingFallback(true);
        setSrc(distinctFallback);
        return;
      }

      setShowPlaceholder(true);
    },
    [distinctFallback],
  );

  return {
    src,
    showPlaceholder,
    usingFallback,
    onError,
  };
}
