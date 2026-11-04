import { useEffect, useState } from "react";
import { socket } from "./socket";
import { GameState } from "./types";
import GameRoom from "./GameRoom";
import { DeviceClaimWait } from "./views/DeviceClaimWait";
import { Lobby } from "./views/Lobby";
import { handleServerClientUpdateRequired } from "./bootstrapAppUpdate";
import { clearGameSession, loadGameSession, saveReconnectToken } from "./gameSession";
import { ConnectionGate } from "./components/ConnectionGate";
import { useSocketConnection } from "./hooks/useSocketConnection";

function tryRejoinFromSession() {
  const session = loadGameSession();
  if (!session?.reconnectToken) return;
  socket.emit("joinGame", {
    roomId: session.roomId,
    name: session.playerName,
    reconnectToken: session.reconnectToken,
  });
}

function App() {
  const { connected, everConnected, error: connectError, retry: retryConnect } = useSocketConnection();
  const [game, setGame] = useState<GameState | null>(null);
  const [myPlayerId, setMyPlayerId] = useState<string>("");
  const [projectImages, setProjectImages] = useState<Record<number, number>>({});
  const [eraImages, setEraImages] = useState<Record<string, number>>({});
  const [buffImages, setBuffImages] = useState<Record<string, number>>({});
  const [personaImages, setPersonaImages] = useState<Record<string, number>>({});
  const [playerNotify, setPlayerNotify] = useState<{ seq: number; text: string } | null>(null);
  const [deviceClaimWait, setDeviceClaimWait] = useState<{
    roomId: string;
    playerName: string;
  } | null>(null);

  useEffect(() => {
    if (!playerNotify) return;
    const t = window.setTimeout(() => setPlayerNotify(null), 6000);
    return () => window.clearTimeout(t);
  }, [playerNotify?.seq]);

  useEffect(() => {
    const onConnect = () => tryRejoinFromSession();

    const onGameUpdate = (newGame: GameState) => setGame(newGame);
    const onPlayerJoined = ({ playerId, reconnectToken }: { playerId: string; reconnectToken?: string }) => {
      setDeviceClaimWait(null);
      setMyPlayerId(playerId);
      if (reconnectToken) saveReconnectToken(reconnectToken);
    };
    const onDeviceClaimPending = (payload: {
      roomId?: string;
      playerName?: string;
    }) => {
      const roomId = payload?.roomId?.trim();
      const playerName = payload?.playerName?.trim();
      if (!roomId || !playerName) return;
      setDeviceClaimWait({ roomId, playerName });
      setGame(null);
      setMyPlayerId("");
    };
    const onDeviceClaimCancelled = () => setDeviceClaimWait(null);
    const onDeviceClaimSuperseded = ({ message }: { message?: string }) => {
      alert(message || "认领请求已失效，请重新加入");
      setDeviceClaimWait(null);
    };
    const onSessionReplaced = ({ message }: { message?: string }) => {
      alert(message || "你的身份已在其他页面登录");
      clearGameSession();
      setGame(null);
      setMyPlayerId("");
    };
    const onRoomDissolved = () => {
      alert("⚠️ 房间已被管理员解散！");
      clearGameSession();
      setGame(null);
      setMyPlayerId("");
    };
    const onClientUpdateRequired = () => {
      handleServerClientUpdateRequired("player");
    };
    const onError = (msg: string) => alert(`❌ ${msg}`);
    const onPlayerKicked = ({ message }: { message?: string }) => {
      alert(message || "你已被移出房间");
      clearGameSession();
      setGame(null);
      setMyPlayerId("");
    };
    const onPlayerNotify = (
      payload: { type?: string; message?: string; msg?: string } | string
    ) => {
      if (typeof payload !== "string") {
        const t = payload?.type;
        if (t === "chat" || t === "transfer") return;
      }
      const text =
        typeof payload === "string"
          ? payload
          : payload?.message || payload?.msg || "";
      if (text) setPlayerNotify({ seq: Date.now(), text });
    };
    const onSyncImages = (images: Record<number, number>) => setProjectImages(images);
    const onSyncEraImages = (images: Record<string, number>) => setEraImages(images);
    const onSyncBuffImages = (images: Record<string, number>) => setBuffImages(images);
    const onSyncPersonaImages = (images: Record<string, number>) => setPersonaImages(images);

    socket.on("connect", onConnect);
    socket.on("gameUpdate", onGameUpdate);
    socket.on("playerJoined", onPlayerJoined);
    socket.on("deviceClaimPending", onDeviceClaimPending);
    socket.on("deviceClaimCancelled", onDeviceClaimCancelled);
    socket.on("deviceClaimSuperseded", onDeviceClaimSuperseded);
    socket.on("roomDissolved", onRoomDissolved);
    socket.on("clientUpdateRequired", onClientUpdateRequired);
    socket.on("error", onError);
    socket.on("playerKicked", onPlayerKicked);
    socket.on("sessionReplaced", onSessionReplaced);
    socket.on("playerNotify", onPlayerNotify);
    socket.on("syncProjectImages", onSyncImages);
    socket.on("syncEraImages", onSyncEraImages);
    socket.on("syncBuffImages", onSyncBuffImages);
    socket.on("syncPersonaImages", onSyncPersonaImages);

    if (socket.connected) tryRejoinFromSession();

    return () => {
      socket.off("connect", onConnect);
      socket.off("gameUpdate", onGameUpdate);
      socket.off("playerJoined", onPlayerJoined);
      socket.off("deviceClaimPending", onDeviceClaimPending);
      socket.off("deviceClaimCancelled", onDeviceClaimCancelled);
      socket.off("deviceClaimSuperseded", onDeviceClaimSuperseded);
      socket.off("roomDissolved", onRoomDissolved);
      socket.off("clientUpdateRequired", onClientUpdateRequired);
      socket.off("error", onError);
      socket.off("playerKicked", onPlayerKicked);
      socket.off("sessionReplaced", onSessionReplaced);
      socket.off("playerNotify", onPlayerNotify);
      socket.off("syncProjectImages", onSyncImages);
      socket.off("syncEraImages", onSyncEraImages);
      socket.off("syncBuffImages", onSyncBuffImages);
      socket.off("syncPersonaImages", onSyncPersonaImages);
    };
  }, []);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible" || !loadGameSession()) return;
      if (!socket.connected) return;
      socket.emit("requestGameState");
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  const handleExitRoom = () => {
    socket.emit("leaveGame");
    clearGameSession();
    setGame(null);
    setMyPlayerId("");
  };

  const me = game?.players.find((p) => p.id === myPlayerId);

  const notifyToast = playerNotify ? (
    <div className="player-notify-toast" role="status" aria-live="polite">
      {playerNotify.text}
    </div>
  ) : null;

  return (
    <ConnectionGate
      connected={connected}
      everConnected={everConnected}
      error={connectError}
      onRetry={retryConnect}
      variant="player"
    >
      {deviceClaimWait ? (
        <>
          {notifyToast}
          <DeviceClaimWait
            roomId={deviceClaimWait.roomId}
            playerName={deviceClaimWait.playerName}
            onCancel={() => setDeviceClaimWait(null)}
          />
        </>
      ) : game && me ? (
        <>
          {notifyToast}
          <GameRoom
            game={game}
            myPlayerId={myPlayerId}
            projectImages={projectImages}
            eraImages={eraImages}
            buffImages={buffImages}
            personaImages={personaImages}
            onExit={handleExitRoom}
          />
        </>
      ) : (
        <>
          {notifyToast}
          <Lobby game={game || ({ players: [] } as unknown as GameState)} />
        </>
      )}
    </ConnectionGate>
  );
}

export default App;
