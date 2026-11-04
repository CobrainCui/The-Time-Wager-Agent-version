import { useCallback, useEffect, useRef, useState } from "react";
import { uiRem } from "../utils/typography";
import { socket } from "../socket";
import { GameState } from "../types";
import { AdminView } from "../views/AdminView";
import { AdminImageManager } from "./AdminImageManager";
import { AdminSessionHistory } from "./AdminSessionHistory";
import { AdminLogin } from "./AdminLogin";
import { clearAdminToken, getAdminToken, setAdminToken } from "./adminToken";
import { ConnectionGate } from "../components/ConnectionGate";
import { handleServerClientUpdateRequired } from "../bootstrapAppUpdate";
import { useSocketConnection } from "../hooks/useSocketConnection";

type AuthState = "connecting" | "login" | "authenticated";
type AdminScreen = "rooms" | "images" | "sessions";

interface AdminRoomSummary {
  roomId: string;
  playerCount: number;
  phase: string;
}

const AUTH_TIMEOUT_MS = 15_000;

export default function AdminApp() {
  const { connected, everConnected, error: connectError, retry: retryConnect } = useSocketConnection();
  const [authState, setAuthState] = useState<AuthState>("connecting");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authPending, setAuthPending] = useState(false);
  const [game, setGame] = useState<GameState | null>(null);
  const [adminRoomList, setAdminRoomList] = useState<AdminRoomSummary[]>([]);
  const [projectImages, setProjectImages] = useState<Record<number, number>>({});
  const [eraImages, setEraImages] = useState<Record<string, number>>({});
  const [buffImages, setBuffImages] = useState<Record<string, number>>({});
  const [personaImages, setPersonaImages] = useState<Record<string, number>>({});
  const [adminScreen, setAdminScreen] = useState<AdminScreen>("rooms");

  const spectatingRoomIdRef = useRef<string | null>(null);
  const authTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 进行中的鉴权序号；null 表示无等待 */
  const pendingAuthSeqRef = useRef<number | null>(null);
  const authSeqRef = useRef(0);

  const clearAuthTimeout = useCallback(() => {
    if (authTimeoutRef.current) {
      clearTimeout(authTimeoutRef.current);
      authTimeoutRef.current = null;
    }
  }, []);

  const finishAuthSuccess = useCallback(() => {
    if (pendingAuthSeqRef.current === null) return;
    pendingAuthSeqRef.current = null;
    clearAuthTimeout();
    setAuthState("authenticated");
    setAuthPending(false);
    setAuthError(null);
    const roomId = spectatingRoomIdRef.current;
    if (roomId) {
      socket.emit("adminSpectate", { targetRoomId: roomId });
      socket.emit("requestGameState");
    }
  }, [clearAuthTimeout]);

  const finishAuthFailed = useCallback(
    (message?: string) => {
      if (pendingAuthSeqRef.current === null) return;
      pendingAuthSeqRef.current = null;
      clearAuthTimeout();
      clearAdminToken();
      setAuthState("login");
      setAuthPending(false);
      setAuthError(message || "密钥无效");
      setGame(null);
    },
    [clearAuthTimeout],
  );

  const finishAuthTimeout = useCallback(() => {
    if (pendingAuthSeqRef.current === null) return;
    pendingAuthSeqRef.current = null;
    clearAuthTimeout();
    clearAdminToken();
    setAuthPending(false);
    setAuthError(
      "验证超时：后端未响应 adminAuthenticate。请在服务器 server 目录执行 npm run build 与 pm2 restart，并确认 .env 中 ADMIN_TOKEN 与输入一致（等号两侧勿加空格）。",
    );
    setAuthState("login");
    setGame(null);
  }, [clearAuthTimeout]);

  useEffect(() => {
    const onAuthOk = () => finishAuthSuccess();
    const onAuthFailed = (payload: { message?: string }) => finishAuthFailed(payload.message);

    socket.on("adminAuthOk", onAuthOk);
    socket.on("adminAuthFailed", onAuthFailed);

    return () => {
      socket.off("adminAuthOk", onAuthOk);
      socket.off("adminAuthFailed", onAuthFailed);
    };
  }, [finishAuthSuccess, finishAuthFailed]);

  const authenticate = useCallback(
    (token: string) => {
      const trimmed = token.trim();
      if (!trimmed) return;

      if (!socket.connected) {
        setAuthState("login");
        setAuthPending(false);
        pendingAuthSeqRef.current = null;
        setAuthError("未连接服务器：请先启动 server（端口 3001）并刷新页面");
        return;
      }

      if (pendingAuthSeqRef.current !== null) return;

      const seq = ++authSeqRef.current;
      pendingAuthSeqRef.current = seq;
      setAuthPending(true);
      setAuthError(null);
      setAdminToken(trimmed);
      clearAuthTimeout();

      authTimeoutRef.current = setTimeout(() => {
        if (pendingAuthSeqRef.current === seq) finishAuthTimeout();
      }, AUTH_TIMEOUT_MS);
      socket.emit("adminAuthenticate", { token: trimmed });
    },
    [clearAuthTimeout, finishAuthTimeout],
  );

  useEffect(() => {
    const tryStoredAuth = () => {
      if (pendingAuthSeqRef.current !== null) return;
      const stored = getAdminToken();
      if (stored) authenticate(stored);
      else {
        setAuthState("login");
        setAuthPending(false);
      }
    };

    const onConnect = () => {
      setAuthState((s) => (s === "authenticated" ? s : "connecting"));
      tryStoredAuth();
    };

    const onDisconnect = () => {
      pendingAuthSeqRef.current = null;
      clearAuthTimeout();
      setAuthPending(false);
    };

    const onGameUpdate = (newGame: GameState) => setGame(newGame);
    const onAdminRoomList = (list: AdminRoomSummary[]) => setAdminRoomList(list);
    const onRoomDissolved = () => {
      alert("房间已解散");
      setGame(null);
    };
    const onSocketError = (msg: string) => {
      alert(typeof msg === "string" ? msg : "操作失败");
    };
    const onClientUpdateRequired = () => {
      handleServerClientUpdateRequired("admin");
    };
    const onSyncImages = (images: Record<number, number>) => setProjectImages(images);
    const onSyncEraImages = (images: Record<string, number>) => setEraImages(images);
    const onSyncBuffImages = (images: Record<string, number>) => setBuffImages(images);
    const onSyncPersonaImages = (images: Record<string, number>) => setPersonaImages(images);

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("gameUpdate", onGameUpdate);
    socket.on("adminRoomList", onAdminRoomList);
    socket.on("roomDissolved", onRoomDissolved);
    socket.on("error", onSocketError);
    socket.on("clientUpdateRequired", onClientUpdateRequired);
    socket.on("syncProjectImages", onSyncImages);
    socket.on("syncEraImages", onSyncEraImages);
    socket.on("syncBuffImages", onSyncBuffImages);
    socket.on("syncPersonaImages", onSyncPersonaImages);

    if (socket.connected) onConnect();

    return () => {
      clearAuthTimeout();
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("gameUpdate", onGameUpdate);
      socket.off("adminRoomList", onAdminRoomList);
      socket.off("roomDissolved", onRoomDissolved);
      socket.off("error", onSocketError);
      socket.off("clientUpdateRequired", onClientUpdateRequired);
      socket.off("syncProjectImages", onSyncImages);
      socket.off("syncEraImages", onSyncEraImages);
      socket.off("syncBuffImages", onSyncBuffImages);
      socket.off("syncPersonaImages", onSyncPersonaImages);
    };
  }, [authenticate, clearAuthTimeout]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible" || authState !== "authenticated" || !game) return;
      if (!socket.connected) return;
      socket.emit("requestGameState");
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [authState, game]);

  const handleSpectate = (roomId: string) => {
    spectatingRoomIdRef.current = roomId;
    socket.emit("adminSpectate", { targetRoomId: roomId });
    // 确保拿到 god 视图完整字段（pendingAuctionOffers 等）
    socket.emit("requestGameState");
  };

  const handleExitRoom = () => {
    spectatingRoomIdRef.current = null;
    if (game) socket.emit("adminLeaveRoom", { roomId: game.roomId });
    setGame(null);
    setAdminScreen("rooms");
  };

  const handleLogin = (token: string) => {
    if (!connected) {
      setAuthError("未连接服务器，请稍后重试");
      return;
    }
    authenticate(token);
  };

  const handleLogout = () => {
    pendingAuthSeqRef.current = null;
    clearAuthTimeout();
    clearAdminToken();
    spectatingRoomIdRef.current = null;
    setGame(null);
    setAdminRoomList([]);
    setAuthState("login");
    setAdminScreen("rooms");
    socket.disconnect();
    socket.connect();
  };

  return (
    <ConnectionGate
      connected={connected}
      everConnected={everConnected}
      error={connectError}
      onRetry={retryConnect}
      variant="admin"
    >
      {authPending ? (
        <div
          className="page-center"
          style={{ minHeight: "100vh", background: "#070b14", color: "var(--color-text-muted)" }}
        >
          正在验证密钥…
        </div>
      ) : authState === "login" || authState === "connecting" ? (
        <AdminLogin onSubmit={handleLogin} error={authError} pending={authPending} />
      ) : game ? (
        <AdminView
          game={game}
          onExit={handleExitRoom}
          projectImages={projectImages}
          eraImages={eraImages}
          buffImages={buffImages}
          personaImages={personaImages}
        />
      ) : adminScreen === "sessions" ? (
        <AdminSessionHistory onBack={() => setAdminScreen("rooms")} />
      ) : adminScreen === "images" ? (
        <AdminImageManager
          projectImages={projectImages}
          eraImages={eraImages}
          buffImages={buffImages}
          personaImages={personaImages}
          onProjectImageVersion={(id, version) =>
            setProjectImages((prev) => ({ ...prev, [id]: version }))
          }
          onEraImageVersion={(eraName, version) =>
            setEraImages((prev) => ({ ...prev, [eraName]: version }))
          }
          onBuffImageVersion={(cardId, version) =>
            setBuffImages((prev) => ({ ...prev, [cardId]: version }))
          }
          onPersonaImageVersion={(slug, version) =>
            setPersonaImages((prev) => ({ ...prev, [slug]: version }))
          }
          onBack={() => setAdminScreen("rooms")}
        />
      ) : (
        <div style={{ minHeight: "100vh", background: "#070b14", padding: "2rem 1.5rem" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              marginBottom: "2rem",
              flexWrap: "wrap",
              gap: "1rem",
            }}
          >
            <div>
              <h1 style={{ fontSize: "2.5rem", fontWeight: 900, color: "#fbbf24", marginBottom: "0.375rem" }}>
                上帝视角控制台
              </h1>
              <p style={{ color: "var(--color-text-muted)", fontSize: uiRem(0.9) }}>
                当前活跃房间 ({adminRoomList.length})
              </p>
            </div>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setAdminScreen("sessions")}
              >
                历史场次
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setAdminScreen("images")}
              >
                图片资源管理
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={handleLogout}>
                退出登录
              </button>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
              gap: "1rem",
            }}
          >
            {adminRoomList.map((room) => (
              <div
                key={room.roomId}
                style={{
                  background: "var(--color-bg-card)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "1.25rem",
                  padding: "1.5rem",
                }}
              >
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "2rem",
                    fontWeight: 900,
                    color: "#fbbf24",
                    marginBottom: "0.5rem",
                  }}
                >
                  {room.roomId}
                </div>
                <div style={{ color: "var(--color-text-muted)", fontSize: uiRem(0.85), marginBottom: "1.25rem" }}>
                  <div>人数：{room.playerCount} / 6</div>
                  <div>阶段：{room.phase}</div>
                </div>
                <button
                  type="button"
                  onClick={() => handleSpectate(room.roomId)}
                  className="btn btn-primary btn-full"
                  style={{ fontSize: uiRem(0.9) }}
                >
                  进入
                </button>
              </div>
            ))}
            {adminRoomList.length === 0 && (
              <div
                style={{
                  gridColumn: "1 / -1",
                  textAlign: "center",
                  padding: "4rem",
                  color: "var(--color-text-muted)",
                  border: "2px dashed var(--color-border)",
                  borderRadius: "1.25rem",
                }}
              >
                暂无活跃房间，等待玩家创建...
              </div>
            )}
          </div>
        </div>
      )}
    </ConnectionGate>
  );
}
