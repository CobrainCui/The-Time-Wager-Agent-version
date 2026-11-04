import { useLayoutEffect, useRef } from "react";

/**
 * 测量固定底栏实际占用高度（含 bottom 偏移与换行），写入内容区的 --dock-clearance；
 * 默认同步到 documentElement，供视口级私信坞使用。嵌入观战时勿写 document，避免污染主持页。
 *
 * @param enabled 无底栏时写入较小留白
 * @param observeKey 底栏 DOM/内容切换时传入（如 ready），以便重新测量
 * @param syncDocumentRoot 是否同步到 <html>（嵌入预览传 false）
 */
export function useFixedDockClearance(
  enabled: boolean,
  observeKey?: string | number | boolean,
  syncDocumentRoot = true
) {
  const contentRef = useRef<HTMLDivElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const content = contentRef.current;
    const root = document.documentElement;

    const setClearance = (value: string) => {
      content?.style.setProperty("--dock-clearance", value);
      if (syncDocumentRoot) root.style.setProperty("--dock-clearance", value);
    };

    if (!enabled) {
      setClearance("1.5rem");
      return () => {
        if (syncDocumentRoot) root.style.removeProperty("--dock-clearance");
      };
    }

    const dock = dockRef.current;
    if (!dock) return;

    const apply = () => {
      const rect = dock.getBoundingClientRect();
      // 底栏所在页被分段切换隐藏（display:none）时 rect 全为 0，不能按整屏计算
      if (rect.height === 0) {
        setClearance("1.5rem");
        return;
      }
      const covered = Math.max(0, Math.ceil(window.innerHeight - rect.top));
      // 额外 12px，避免最后一行贴紧底栏
      setClearance(`${covered + 12}px`);
    };

    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(dock);
    window.addEventListener("resize", apply);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", apply);
      if (syncDocumentRoot) root.style.removeProperty("--dock-clearance");
    };
  }, [enabled, observeKey, syncDocumentRoot]);

  return { contentRef, dockRef };
}
