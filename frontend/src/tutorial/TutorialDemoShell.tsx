import React from "react";
import { uiRem } from "../utils/typography";

interface Props {
  children: React.ReactNode;
  onReset?: () => void;
  dense?: boolean;
  /** 动手试一试副标题（默认仅非 dense 显示试玩免责） */
  playHint?: string;
}

export const TutorialDemoShell: React.FC<Props> = ({ children, onReset, dense = false, playHint }) => (
  <div
    className={dense ? "tutorial-demo-shell tutorial-demo-shell--dense" : "tutorial-demo-shell"}
    style={{
      marginTop: dense ? "0.5rem" : "1.5rem",
      textAlign: "left",
      background: "rgba(59,130,246,0.06)",
      border: "1px solid rgba(59,130,246,0.2)",
      borderRadius: dense ? "0.75rem" : "1rem",
    }}
  >
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "0.75rem",
        padding: dense ? "0.5rem 0.75rem" : "0.75rem 1rem",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        flexWrap: "wrap",
      }}
    >
      <div>
        <div style={{ fontWeight: 800, color: "#93c5fd", fontSize: uiRem(dense ? 0.85 : 0.95) }}>🎮 动手试一试</div>
        <div
          className={dense && !playHint ? "sr-only" : undefined}
          style={{
            fontSize: uiRem(0.75),
            color: "var(--color-text-muted)",
            marginTop: "0.15rem",
            lineHeight: 1.45,
          }}
        >
          {playHint ?? "试玩数据不会上传或影响本局对局"}
        </div>
      </div>
      {onReset && (
        <button type="button" className="btn btn-ghost btn-sm" onClick={onReset}>
          重置
        </button>
      )}
    </div>
    <div
      className="tutorial-demo-shell__body"
      style={{ padding: dense ? "0.65rem 0.75rem 0.75rem" : "1rem 1.25rem 1.25rem" }}
    >
      {children}
    </div>
  </div>
);
