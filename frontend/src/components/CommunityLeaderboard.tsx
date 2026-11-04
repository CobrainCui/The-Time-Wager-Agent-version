import React from "react";
import { uiRem } from "../utils/typography";

export interface CommunityLeaderboardEntry {
  name: string;
  score: number;
  recordedAt?: number;
}

interface Props {
  entries: CommunityLeaderboardEntry[];
  highlightName?: string;
  emptyMessage?: string;
}

export const CommunityLeaderboard: React.FC<Props> = ({
  entries,
  highlightName,
  emptyMessage,
}) => {
  if (entries.length === 0) {
    if (!emptyMessage) return null;
    return (
      <p
        style={{
          marginTop: "2rem",
          fontSize: uiRem(0.85),
          color: "var(--color-text-muted)",
          lineHeight: 1.5,
        }}
      >
        {emptyMessage}
      </p>
    );
  }

  return (
    <div
      style={{
        background: "var(--color-bg-card)",
        border: "1px solid rgba(168,85,247,0.25)",
        borderRadius: "1.25rem",
        overflow: "hidden",
        marginTop: highlightName === undefined ? "2rem" : undefined,
        marginBottom: "2rem",
      }}
      aria-label="跨房间社区总财富排行榜"
    >
      <div
        style={{
          padding: "1rem 1.5rem",
          borderBottom: "1px solid rgba(168,85,247,0.15)",
        }}
      >
        <h3 style={{ fontWeight: 700, color: "#c084fc", fontSize: uiRem(1), margin: 0 }}>
          🌍 社区排行榜
        </h3>
        <p style={{ margin: "0.35rem 0 0", fontSize: uiRem(0.72), color: "var(--color-text-muted)" }}>
          各社区玩家总财富之和（全服 Top 10）
        </p>
      </div>
      <ol style={{ listStyle: "none", margin: 0, padding: "0.75rem 1rem" }}>
        {entries.map((rec, i) => {
          const isHighlight = Boolean(highlightName && rec.name === highlightName);
          const rankKey = `${rec.name}-${rec.recordedAt ?? i}`;
          return (
            <li
              key={rankKey}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "0.75rem 0.5rem",
                borderRadius: "0.625rem",
                background: isHighlight ? "rgba(168,85,247,0.08)" : "transparent",
                border: isHighlight ? "1px solid rgba(168,85,247,0.25)" : "1px solid transparent",
                marginBottom: "0.375rem",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", minWidth: 0 }}>
                <span
                  aria-hidden
                  style={{
                    width: "1.5rem",
                    height: "1.5rem",
                    borderRadius: "50%",
                    flexShrink: 0,
                    background: i === 0 ? "#f59e0b" : i === 1 ? "#94a3b8" : i === 2 ? "#cd7c32" : "#1f2937",
                    color: i < 3 ? (i === 0 ? "#000" : "#fff") : "#6b7280",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: uiRem(0.65),
                    fontWeight: 800,
                  }}
                >
                  {i + 1}
                </span>
                <span
                  style={{
                    color: "var(--color-text-primary)",
                    fontWeight: isHighlight ? 700 : 400,
                    fontSize: uiRem(0.9),
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  title={rec.name}
                >
                  {isHighlight ? "▶ " : ""}【{rec.name}】
                </span>
              </div>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontWeight: 700,
                  color: "#fbbf24",
                  fontSize: uiRem(0.95),
                  flexShrink: 0,
                  marginLeft: "0.5rem",
                }}
              >
                {rec.score}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
};
