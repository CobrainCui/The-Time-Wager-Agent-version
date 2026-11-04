import React from "react";
import { uiRem } from "../utils/typography";
import { EraCard } from "../types";

const ERA_COLORS: Record<string, string> = {
  green: "#10b981",
  blue: "#3b82f6",
  red: "#ef4444",
  orange: "#f97316",
  yellow: "#a855f7",
};

export const EraThemeBanner: React.FC<{
  eraCard: EraCard;
  currentEra?: number;
  compact?: boolean;
}> = ({ eraCard, currentEra, compact }) => {
  const eraColor = ERA_COLORS[eraCard.themeColor] || "#60a5fa";

  return (
    <div
      className="era-banner"
      style={{
        background: `linear-gradient(135deg, ${eraColor}18 0%, transparent 100%)`,
        border: `1px solid ${eraColor}33`,
        borderRadius: compact ? "0.75rem" : "1rem",
        padding: compact ? "0.875rem 1rem" : "1.25rem 1.75rem",
        display: "flex",
        alignItems: "center",
        gap: "1rem",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          right: "-1rem",
          top: "-1rem",
          fontSize: compact ? "4rem" : "6rem",
          fontWeight: 900,
          opacity: 0.05,
          color: eraColor,
          pointerEvents: "none",
          userSelect: "none",
        }}
      >
        {eraCard.era}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
          <h2 style={{ fontSize: compact ? uiRem(1.05) : "1.4rem", fontWeight: 900, color: "white", margin: 0 }}>
            🌍 {eraCard.name}
          </h2>
          {!compact && (
            <span style={{ color: "var(--color-text-secondary)", fontSize: uiRem(1) }}>— {eraCard.description}</span>
          )}
        </div>
        {compact ? (
          <div style={{ fontSize: uiRem(0.8), color: "var(--color-text-secondary)", marginTop: "0.25rem" }}>
            {eraCard.description}
          </div>
        ) : null}
        <div
          style={{
            fontSize: uiRem(0.75),
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: eraColor,
            opacity: 0.8,
            marginTop: "0.25rem",
          }}
        >
          {currentEra != null ? `第 ${currentEra} 时代 · ` : ""}当前时代主题 · 【{eraCard.era}】
        </div>
      </div>
    </div>
  );
};
