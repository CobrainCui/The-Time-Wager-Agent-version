import { useCallback, useEffect, useRef, useState } from "react";
import { socket } from "../socket";

const FIRST_CONNECT_MS = 20_000;
/** 曾连上后持续断线超过此时长，再视为致命失败（避免无限重连时永不报错） */
const RECONNECT_GIVE_UP_MS = 15_000;

export function useSocketConnection() {
  const [connected, setConnected] = useState(socket.connected);
  const [everConnected, setEverConnected] = useState(socket.connected);
  const [error, setError] = useState<string | null>(null);
  const firstConnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectGiveUpRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const everConnectedRef = useRef(socket.connected);

  const clearFirstConnectTimer = useCallback(() => {
    if (firstConnectTimerRef.current) {
      clearTimeout(firstConnectTimerRef.current);
      firstConnectTimerRef.current = null;
    }
  }, []);

  const clearReconnectGiveUp = useCallback(() => {
    if (reconnectGiveUpRef.current) {
      clearTimeout(reconnectGiveUpRef.current);
      reconnectGiveUpRef.current = null;
    }
  }, []);

  const armReconnectGiveUp = useCallback(() => {
    if (!everConnectedRef.current) return;
    clearReconnectGiveUp();
    reconnectGiveUpRef.current = setTimeout(() => {
      reconnectGiveUpRef.current = null;
      if (socket.connected) return;
      setError("多次重连失败，请检查网络或服务器状态后重试。");
    }, RECONNECT_GIVE_UP_MS);
  }, [clearReconnectGiveUp]);

  const retry = useCallback(() => {
    setError(null);
    clearFirstConnectTimer();
    clearReconnectGiveUp();
    if (!socket.connected) {
      firstConnectTimerRef.current = setTimeout(() => {
        if (!socket.connected) {
          setError(
            "无法连接 WebSocket。生产环境请确认站点 Nginx 已配置 location /socket.io/ 反代到 Node（3001）；本地请先启动 server 再通过 Vite 打开页面。",
          );
        }
      }, FIRST_CONNECT_MS);
      socket.connect();
    }
  }, [clearFirstConnectTimer, clearReconnectGiveUp]);

  useEffect(() => {
    const onConnect = () => {
      clearFirstConnectTimer();
      clearReconnectGiveUp();
      everConnectedRef.current = true;
      setConnected(true);
      setEverConnected(true);
      setError(null);
    };

    const onDisconnect = () => {
      setConnected(false);
      // 短暂断线：保持子树；超时仍未连上再报错
      armReconnectGiveUp();
    };

    const onConnectError = () => {
      setConnected(false);
      // 仍在自动重连中：不把瞬态错误当成致命失败；靠 give-up 计时兜底
      if (socket.active) {
        if (!reconnectGiveUpRef.current) armReconnectGiveUp();
        return;
      }
      clearReconnectGiveUp();
      setError(
        "连接被拒绝或网络异常。请确认后端已启动，且当前域名已反代 /socket.io/ 到 Node。",
      );
    };

    const onReconnectFailed = () => {
      setConnected(false);
      clearReconnectGiveUp();
      setError("多次重连失败，请检查网络或服务器状态后重试。");
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onConnectError);
    socket.on("reconnect_failed", onReconnectFailed);

    if (socket.connected) {
      onConnect();
    } else {
      firstConnectTimerRef.current = setTimeout(() => {
        if (!socket.connected) {
          setError(
            "连接超时。生产 admin 子域需配置 /socket.io/ 反代；本地请启动 server（3001）并使用 npm run dev 访问 admin.html。",
          );
        }
      }, FIRST_CONNECT_MS);
    }

    return () => {
      clearFirstConnectTimer();
      clearReconnectGiveUp();
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("connect_error", onConnectError);
      socket.off("reconnect_failed", onReconnectFailed);
    };
  }, [armReconnectGiveUp, clearFirstConnectTimer, clearReconnectGiveUp]);

  return { connected, everConnected, error, retry };
}
