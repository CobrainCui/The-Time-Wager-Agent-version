import React, { useState, useEffect, lazy, Suspense } from "react";
import { uiRem } from "../utils/typography";
import { GameState } from "../types";
import { socket } from "../socket";
import { clearGameSession, loadGameSession, saveGameSession } from "../gameSession";
import { LobbyTutorial } from "./LobbyTutorial";
const DevicePreviewShell = lazy(() =>
  import("../devicePreview/DevicePreviewShell").then((m) => ({ default: m.DevicePreviewShell }))
);

interface Props {
  game: GameState;
}

export const Lobby: React.FC<Props> = ({ game }) => {
  const [name, setName] = useState("");
  const [roomId, setRoomId] = useState("");
  const [isJoining, setIsJoining] = useState(false);
  const [devicePreviewOpen, setDevicePreviewOpen] = useState(false);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [hasStoredSession, setHasStoredSession] = useState(() => Boolean(loadGameSession()));

  useEffect(() => {
    const session = loadGameSession();
    if (session) {
      setRoomId(session.roomId);
      setName(session.playerName);
      setHasStoredSession(true);
    }
  }, []);

  useEffect(() => {
    const clearJoining = () => setIsJoining(false);
    socket.on("playerJoined", clearJoining);
    socket.on("deviceClaimPending", clearJoining);
    socket.on("error", clearJoining);
    return () => {
      socket.off("playerJoined", clearJoining);
      socket.off("deviceClaimPending", clearJoining);
      socket.off("error", clearJoining);
    };
  }, []);

  const joinGame = () => {
    const cleanRoomId = roomId.trim();
    const cleanName = name.trim();
    if (!cleanRoomId || !cleanName) return;
    setIsJoining(true);
    saveGameSession(cleanRoomId, cleanName);
    const session = loadGameSession();
    const reconnectToken =
      session?.roomId === cleanRoomId &&
      session?.playerName === cleanName &&
      session.reconnectToken
        ? session.reconnectToken
        : undefined;
    socket.emit("joinGame", { roomId: cleanRoomId, name: cleanName, reconnectToken });
  };

  const clearLocalSession = () => {
    clearGameSession();
    setHasStoredSession(false);
    setIsJoining(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") joinGame();
  };

  return (
    <>
      {tutorialOpen && (
        <LobbyTutorial playerName={name} onClose={() => setTutorialOpen(false)} />
      )}
      {devicePreviewOpen && (
        <Suspense fallback={null}>
          <DevicePreviewShell onClose={() => setDevicePreviewOpen(false)} />
        </Suspense>
      )}
    <div
      className="page-center"
      style={{
        background: `
          radial-gradient(ellipse at 20% 50%, rgba(59,130,246,0.15) 0%, transparent 60%),
          radial-gradient(ellipse at 80% 20%, rgba(168,85,247,0.12) 0%, transparent 50%),
          radial-gradient(ellipse at 50% 90%, rgba(16,185,129,0.08) 0%, transparent 50%),
          #070b14
        `,
        minHeight: "100vh",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `
            radial-gradient(circle at 10% 20%, rgba(59,130,246,0.06) 0%, transparent 40%),
            radial-gradient(circle at 90% 80%, rgba(168,85,247,0.06) 0%, transparent 40%)
          `,
          pointerEvents: "none",
        }}
      />

      <div className="container-sm" style={{ width: "100%", padding: "2rem 1rem" }}>
        <div className="text-center mb-8 animate-fadeIn">
          <div
            style={{
              fontSize: "5rem",
              fontWeight: 900,
              lineHeight: 1,
              background: "linear-gradient(135deg, #60a5fa 0%, #a78bfa 50%, #f472b6 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
              marginBottom: "0.5rem",
              letterSpacing: "-0.02em",
            }}
          >
            光阴对弈
          </div>
          <div
            style={{
              fontSize: uiRem(0.85),
              fontWeight: 600,
              letterSpacing: "0.35em",
              textTransform: "uppercase",
              color: "var(--color-text-muted)",
            }}
          >
            Time Gambit
          </div>
        </div>

        <div
          className="glass animate-slideUp"
          style={{
            borderRadius: "1.5rem",
            padding: "2rem",
            border: "1px solid rgba(255,255,255,0.08)",
            boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
          }}
        >
          <div className="space-y-6">
            <div>
              <input
                className="input input-mono"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="输入房间号"
                aria-label="房间号"
                maxLength={6}
                style={{ fontSize: "1.5rem", padding: "1rem" }}
              />
            </div>

            <div>
              <input
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="输入昵称"
                aria-label="昵称"
                style={{ textAlign: "center" }}
              />
            </div>

            <button
              onClick={joinGame}
              disabled={!name.trim() || !roomId.trim() || isJoining}
              className="btn btn-lg btn-full btn-primary"
              style={{ fontSize: uiRem(1.1), letterSpacing: "0.05em" }}
            >
              {isJoining ? (
                <span style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span className="animate-spin" style={{ display: "inline-block" }}>⟳</span>
                  正在连接...
                </span>
              ) : (
                "🚀 进入游戏"
              )}
            </button>

            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setTutorialOpen(true)}
              style={{
                width: "100%",
                marginTop: "0.5rem",
                fontSize: uiRem(0.78),
                color: "var(--color-text-muted)",
              }}
            >
              📖 教程（六人场玩法）
            </button>

            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setDevicePreviewOpen(true)}
              style={{
                width: "100%",
                marginTop: "0.5rem",
                fontSize: uiRem(0.78),
                color: "var(--color-text-muted)",
              }}
            >
              设备预览
            </button>

            {hasStoredSession && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={clearLocalSession}
                style={{
                  width: "100%",
                  marginTop: "0.25rem",
                  fontSize: uiRem(0.78),
                  color: "var(--color-text-muted)",
                }}
              >
                清除本机进房记录
              </button>
            )}
          </div>

          {game?.players && game.players.length > 0 && (
            <div
              className="animate-fadeIn"
              style={{
                marginTop: "1.5rem",
                paddingTop: "1.5rem",
                borderTop: "1px solid var(--color-border)",
              }}
            >
              <div
                style={{
                  fontSize: uiRem(0.75),
                  color: "var(--color-text-muted)",
                  marginBottom: "0.75rem",
                  textAlign: "center",
                }}
              >
                房间 <span style={{ color: "#60a5fa", fontFamily: "var(--font-mono)" }}>{roomId}</span> 已有{" "}
                <span style={{ color: "#34d399", fontWeight: 700 }}>{game.players.length}</span> 人在线
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", justifyContent: "center" }}>
                {game.players.map((p) => (
                  <span
                    key={p.id}
                    style={{
                      background: "rgba(255,255,255,0.05)",
                      border: "1px solid var(--color-border)",
                      borderRadius: "9999px",
                      padding: "0.25rem 0.75rem",
                      fontSize: uiRem(0.8),
                      color: "var(--color-text-secondary)",
                    }}
                  >
                    {p.name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      </div>
    </>
  );
};
