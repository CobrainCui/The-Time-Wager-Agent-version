import React from "react";
import { uiRem } from "../utils/typography";
import { COFFEE_ENERGY_GAIN, COFFEE_WEALTH_COST } from "../config/coffeeConfig";

export interface PlayerResourceStatusBarProps {
  remainingEnergy: number;
  energyTotal: number;
  wealth: number;
  className?: string;
  style?: React.CSSProperties;
  coffee?: {
    onClick: () => void;
    disabled?: boolean;
    loading?: boolean;
    locked?: boolean;
  };
  trailing?: React.ReactNode;
}

/** 与投资阶段顶栏一致的精力 / 财富读数（教程试玩复用） */
export const PlayerResourceStatusBar: React.FC<PlayerResourceStatusBarProps> = ({
  remainingEnergy,
  energyTotal,
  wealth,
  className = "status-bar",
  style,
  coffee,
  trailing,
}) => (
  <div
    className={className}
    style={{
      borderRadius: "0.75rem",
      marginBottom: "0.75rem",
      padding: "0.85rem 1.1rem",
      ...style,
    }}
  >
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "1rem",
        flexWrap: "wrap",
      }}
    >
      <div style={{ display: "flex", gap: "1.5rem", alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.15rem" }}>
          <span style={{ fontSize: uiRem(1.1) }}>⚡</span>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontWeight: 700,
              fontSize: uiRem(1.2),
              color: remainingEnergy < 0 ? "#ef4444" : "#34d399",
            }}
          >
            {Math.max(0, remainingEnergy)}
          </span>
          <span style={{ color: "var(--color-text-muted)", fontSize: uiRem(0.85) }}>
            / {Math.floor(energyTotal)}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span style={{ fontSize: uiRem(1.1) }}>💰</span>
          <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: uiRem(1.2), color: "#fbbf24" }}>
            {wealth}
          </span>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
        {coffee && (
          <button
            type="button"
            onClick={coffee.onClick}
            disabled={coffee.disabled || coffee.loading || coffee.locked}
            className="btn btn-sm"
            style={{
              background: "rgba(180,83,9,0.2)",
              border: "1px solid rgba(180,83,9,0.4)",
              color: wealth >= COFFEE_WEALTH_COST ? "#fcd34d" : "var(--color-text-muted)",
            }}
            title={`消耗${COFFEE_WEALTH_COST}财富换${COFFEE_ENERGY_GAIN}精力`}
          >
            ☕{" "}
            {coffee.loading
              ? "..."
              : `来杯咖啡（-${COFFEE_WEALTH_COST}💰+${COFFEE_ENERGY_GAIN}⚡）`}
          </button>
        )}
        {trailing}
      </div>
    </div>
  </div>
);
