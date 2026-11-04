import React, { useState } from "react";
import { uiRem } from "../utils/typography";
import { GameState, Player } from "../types";
import { socket } from "../socket";

interface Props { game: GameState; me: Player; embed?: boolean; }

export const CommunityNaming: React.FC<Props> = ({ game, me, embed = false }) => {
  const [name, setName] = useState("");
  const namer = game.players
    .filter((p) => p.connected && !p.isAI)
    .sort((a, b) => b.wealth - a.wealth)[0];
  const canName = !embed && namer?.id === me.id;

  const handleSubmit = () => {
    if (!name.trim()) return;
    socket.emit("submitCommunityName", { name: name.trim() });
  };

  return (
    <div
      className="page-center flex-col"
      style={{
        background: `radial-gradient(ellipse at 50% 40%, rgba(245,158,11,0.1) 0%, transparent 60%), #070b14`,
        minHeight: "100vh",
        textAlign: "center",
        padding: "2rem 1rem",
      }}
    >
      <div style={{ maxWidth: "520px", width: "100%" }} className="animate-slideUp">
        <div style={{ fontSize: "3rem", marginBottom: "1rem", animation: "float 3s ease-in-out infinite" }}>🏙️</div>
        <h1 style={{ fontSize: "2.25rem", fontWeight: 900, color: "white", marginBottom: "0.5rem" }}>
          为你们的社区命名
        </h1>
        <p style={{ color: "var(--color-text-muted)", marginBottom: "2.5rem", fontSize: uiRem(0.95) }}>
          游戏已结束，请为本次冒险命名，留下你们共同的印记
        </p>

        {canName ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              placeholder="输入社区名称..."
              maxLength={20}
              style={{ textAlign: "center", fontSize: uiRem(1.25), padding: "1rem", letterSpacing: "0.05em" }}
              autoFocus
            />
            <button
              onClick={handleSubmit}
              disabled={!name.trim()}
              className="btn btn-gold btn-lg btn-full"
              style={{ fontSize: uiRem(1.1) }}
            >
              🌟 确认命名
            </button>
          </div>
        ) : (
          <div
            style={{
              background: "rgba(245,158,11,0.08)",
              border: "1px solid rgba(245,158,11,0.2)",
              borderRadius: "1rem",
              padding: "2rem",
              color: "#fbbf24",
              fontWeight: 600,
              animation: "pulse 2s infinite",
            }}
          >
            ⏳ 等待在线首富{namer ? ` ${namer.name} ` : ""}为社区命名...
          </div>
        )}
      </div>
    </div>
  );
};
