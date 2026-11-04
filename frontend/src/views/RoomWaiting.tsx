import React from "react";
import { uiRem } from "../utils/typography";
import { GameState, Player } from "../types";
import { STARTING_WEALTH } from "../config/startingWealth";

interface Props {
  game: GameState;
  me: Player;
  /** 主持公共预览：不高亮座位 */
  embed?: boolean;
}

export const RoomWaiting: React.FC<Props> = ({ game, me, embed = false }) => {
  const online = game.players.filter((p) => p.connected);

  return (
    <div
      className="page-center"
      style={{
        minHeight: "100vh",
        background: `
          radial-gradient(ellipse at 30% 40%, rgba(59,130,246,0.12) 0%, transparent 55%),
          radial-gradient(ellipse at 70% 70%, rgba(16,185,129,0.08) 0%, transparent 50%),
          #070b14
        `,
        padding: "2rem 1rem",
      }}
    >
      <div className="container-sm" style={{ width: "100%", maxWidth: "420px" }}>
        <div
          className="glass animate-fadeIn"
          style={{
            borderRadius: "1.5rem",
            padding: "2rem",
            border: "1px solid rgba(255,255,255,0.08)",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: "2.5rem", marginBottom: "0.75rem" }} aria-hidden>
            ⏳
          </div>
          <h1 style={{ margin: "0 0 0.5rem", fontSize: uiRem(1.35), fontWeight: 800, color: "white" }}>
            等候开局
          </h1>
          <p style={{ margin: "0 0 1.5rem", color: "var(--color-text-secondary)", fontSize: uiRem(0.9), lineHeight: 1.5 }}>
            等待主持人开始游戏
            <br />
            <span style={{ fontSize: uiRem(0.82), color: "var(--color-text-muted)" }}>
              开局每人 {STARTING_WEALTH} 财富
            </span>
          </p>

          <div
            style={{
              marginBottom: "1.5rem",
              padding: "0.75rem 1rem",
              borderRadius: "0.75rem",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid var(--color-border)",
            }}
          >
            <div style={{ fontSize: uiRem(0.72), color: "var(--color-text-muted)", marginBottom: "0.35rem" }}>
              房间号
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: uiRem(1.4), fontWeight: 700, color: "#60a5fa" }}>
              {game.roomId}
            </div>
          </div>

          <div style={{ textAlign: "left", marginBottom: "1.5rem" }}>
            <div
              style={{
                fontSize: uiRem(0.75),
                fontWeight: 700,
                color: "var(--color-text-muted)",
                marginBottom: "0.65rem",
                textAlign: "center",
              }}
            >
              在线玩家 ({online.length})
            </div>
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {online.map((p) => {
                const isMe = !embed && p.id === me.id;
                return (
                <li
                  key={p.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "0.5rem 0.75rem",
                    borderRadius: "0.5rem",
                    background: isMe ? "rgba(59,130,246,0.12)" : "rgba(255,255,255,0.03)",
                    border: `1px solid ${isMe ? "rgba(59,130,246,0.25)" : "var(--color-border)"}`,
                  }}
                >
                  <span style={{ fontWeight: isMe ? 700 : 500, color: "white" }}>
                    {p.name}
                    {isMe && (
                      <span style={{ marginLeft: "0.35rem", fontSize: uiRem(0.75), color: "#93c5fd" }}>(我)</span>
                    )}
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: uiRem(0.8),
                      color: "#fbbf24",
                      fontWeight: 600,
                    }}
                  >
                    💰 {p.wealth}
                  </span>
                </li>
              );
              })}
              {online.length === 0 && (
                <li style={{ textAlign: "center", color: "var(--color-text-muted)", fontSize: uiRem(0.85) }}>暂无在线玩家</li>
              )}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
