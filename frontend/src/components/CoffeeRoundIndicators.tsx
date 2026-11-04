import React from "react";
import { uiRem } from "../utils/typography";

interface Props {
  count: number;
  disabled?: boolean;
  onOpenUnsubscribe: () => void;
}

export const CoffeeRoundIndicators: React.FC<Props> = ({ count, disabled, onOpenUnsubscribe }) => {
  if (count <= 0) return null;

  return (
    <button
      type="button"
      className="coffee-round-indicator"
      title="咖啡退订"
      aria-label={`咖啡退订，已购 ${count} 杯`}
      disabled={disabled}
      onClick={onOpenUnsubscribe}
      style={{
        minHeight: "2.75rem",
        padding: "0.25rem 0.55rem",
        border: "1px solid rgba(180,83,9,0.45)",
        borderRadius: "0.5rem",
        background: "rgba(180,83,9,0.12)",
        cursor: disabled ? "default" : "pointer",
        fontSize: uiRem(0.9),
        fontWeight: 700,
        lineHeight: 1.2,
        color: "#fcd34d",
        fontFamily: "var(--font-mono)",
        letterSpacing: "0.02em",
        opacity: disabled ? 0.45 : 1,
        whiteSpace: "nowrap",
      }}
    >
      ☕×{count}
    </button>
  );
};
