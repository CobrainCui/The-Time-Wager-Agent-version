import React, { useLayoutEffect, useRef, useState } from "react";
import { uiRem } from "../utils/typography";
import type { GameState } from "../types";
import { useActionCountdown } from "../hooks/useActionCountdown";

export type BuffInvestTab = "invest" | "buff";

interface Props {
  /** 道具页 */
  left: React.ReactNode;
  /** 投资页 */
  right: React.ReactNode;
  game: GameState;
  /** 默认投资 */
  defaultTab?: BuffInvestTab;
}

/** 同一投资阶段：顶部分段切换投资 / 道具；倒计时留在分段条上不随切页重置 */
export const BuffInvestmentSplit: React.FC<Props> = ({
  left,
  right,
  game,
  defaultTab = "invest",
}) => {
  const [tab, setTab] = useState<BuffInvestTab>(defaultTab);
  const [tabRound, setTabRound] = useState(game.globalRound);
  const rootRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);

  if (tabRound !== game.globalRound) {
    setTabRound(game.globalRound);
    setTab(defaultTab);
  }

  useLayoutEffect(() => {
    const root = rootRef.current;
    const bar = barRef.current;
    if (!root || !bar) return;
    const apply = () => root.style.setProperty("--buff-invest-tab-h", `${Math.ceil(bar.offsetHeight)}px`);
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(bar);
    return () => ro.disconnect();
  }, []);

  const switchTab = (next: BuffInvestTab) => {
    if (next === tab) return;
    setTab(next);
    // 对局里滚动的是 window，设备预览里滚动的是外层 stage，按实际滚动容器回到顶部
    rootRef.current?.scrollIntoView({ block: "start" });
  };

  const showCountdown = game.phase === "INVESTMENT" && !!game.investmentEndsAt;
  const timerPaused = typeof game.investmentTimerPausedAt === "number";
  const timeLeft = useActionCountdown(
    showCountdown,
    game.investmentEndsAt,
    game.serverNow,
    game.investmentTimerPausedAt
  );
  const mins = Math.floor(timeLeft / 60);
  const secs = (timeLeft % 60).toString().padStart(2, "0");
  const isUrgent = !timerPaused && timeLeft < 60 && timeLeft > 0;
  const isDanger = !timerPaused && timeLeft < 20 && timeLeft > 0;

  return (
    <div
      ref={rootRef}
      className="buff-invest-split"
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: "100vh",
        width: "100%",
      }}
    >
      <div
        ref={barRef}
        className="buff-invest-tab-bar"
        style={{
          position: "sticky",
          top: 0,
          zIndex: 45,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.75rem",
          flexWrap: "wrap",
          padding: "0.55rem 1rem",
          paddingRight: "calc(7rem + env(safe-area-inset-right, 0px))",
          background: "rgba(12, 13, 28, 0.96)",
          backdropFilter: "blur(16px)",
          borderBottom: "1px solid rgba(201,151,58,0.15)",
          boxSizing: "border-box",
        }}
      >
        <div
          role="tablist"
          aria-label="投资与道具"
          style={{
            display: "inline-flex",
            gap: "0.35rem",
            padding: "0.2rem",
            borderRadius: "9999px",
            background: "rgba(255,255,255,0.04)",
            border: "1px solid var(--color-border)",
          }}
        >
          {(
            [
              { id: "invest" as const, label: "投资" },
              { id: "buff" as const, label: "道具" },
            ] as const
          ).map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => switchTab(t.id)}
                className="btn btn-sm"
                style={{
                  border: "none",
                  borderRadius: "9999px",
                  padding: "0.4rem 1.1rem",
                  fontWeight: 700,
                  fontSize: uiRem(0.9),
                  background: active ? "rgba(59,130,246,0.25)" : "transparent",
                  color: active ? "#93c5fd" : "var(--color-text-muted)",
                  boxShadow: active ? "inset 0 0 0 1px rgba(96,165,250,0.45)" : "none",
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {showCountdown && game.investmentEndsAt ? (
          <div
            aria-live="polite"
            className="action-countdown-chip"
            style={{
              fontFamily: "var(--font-mono)",
              fontWeight: 700,
              fontSize: "1.25rem",
              lineHeight: 1.2,
              color: timerPaused
                ? "#fbbf24"
                : isDanger
                  ? "#ef4444"
                  : isUrgent
                    ? "#f97316"
                    : "#60a5fa",
              animation:
                !timerPaused && (isDanger || isUrgent)
                  ? `countdown-urgent ${isDanger ? "0.5s" : "1s"} ease-in-out infinite`
                  : undefined,
              background: timerPaused
                ? "#2a2210"
                : isDanger
                  ? "#321414"
                  : isUrgent
                    ? "#2e1c10"
                    : "#121a2c",
              padding: "0.3rem 0.75rem",
              borderRadius: "0.5rem",
              border: `1px solid ${
                timerPaused
                  ? "rgba(251,191,36,0.45)"
                  : isDanger
                    ? "rgba(239,68,68,0.55)"
                    : isUrgent
                      ? "rgba(249,115,22,0.5)"
                      : "rgba(59,130,246,0.4)"
              }`,
              isolation: "isolate",
            }}
          >
            ⏱ {mins}:{secs}
            {timerPaused ? (
              <span style={{ fontSize: "0.75rem", fontWeight: 600, marginLeft: "0.4rem" }}>已暂停</span>
            ) : null}
          </div>
        ) : (
          <span style={{ fontSize: uiRem(0.8), color: "var(--color-text-muted)" }}>投资阶段</span>
        )}
      </div>

      {/* 两页都挂载，避免切回时本地状态丢失；倒计时只在上方一条 */}
      <div style={{ display: tab === "invest" ? "block" : "none", flex: 1, minWidth: 0 }}>
        {right}
      </div>
      <div style={{ display: tab === "buff" ? "block" : "none", flex: 1, minWidth: 0 }}>
        {left}
      </div>
    </div>
  );
};
