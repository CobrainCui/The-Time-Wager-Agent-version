import React from "react";
import { uiRem } from "../utils/typography";

interface Props {
  connected: boolean;
  /** 曾经连上过：短断线时继续渲染子树，避免卸载 Admin/玩家状态 */
  everConnected?: boolean;
  error: string | null;
  onRetry: () => void;
  /** admin 子域提示更具体 */
  variant?: "player" | "admin";
  children: React.ReactNode;
}

export const ConnectionGate: React.FC<Props> = ({
  connected,
  everConnected = false,
  error,
  onRetry,
  variant = "player",
  children,
}) => {
  // 已连上，或曾经连上且尚未判定致命失败：保持子树挂载
  if (connected || (everConnected && !error)) {
    if (connected) return <>{children}</>;
    return (
      <>
        <div
          role="status"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            zIndex: 9999,
            padding: "0.45rem 1rem",
            textAlign: "center",
            fontSize: uiRem(0.85),
            fontWeight: 600,
            color: "#fbbf24",
            background: "rgba(42, 34, 16, 0.95)",
            borderBottom: "1px solid rgba(251,191,36,0.35)",
          }}
        >
          正在重新连接…
        </div>
        {children}
      </>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        background: "#070b14",
        flexDirection: "column",
        gap: "1rem",
        padding: "1.5rem",
        textAlign: "center",
      }}
    >
      {!error ? (
        <>
          <div
            style={{
              width: "3rem",
              height: "3rem",
              borderRadius: "50%",
              border: "3px solid rgba(255,255,255,0.1)",
              borderTopColor: "#3b82f6",
              animation: "spin 1s linear infinite",
            }}
          />
          <div style={{ color: "var(--color-text-muted)", fontSize: uiRem(1) }}>正在连接服务器...</div>
        </>
      ) : (
        <>
          <div style={{ color: "#f87171", fontSize: uiRem(1.05), fontWeight: 700, maxWidth: "28rem" }}>
            {error}
          </div>
          {variant === "admin" && (
            <p style={{ color: "var(--color-text-muted)", fontSize: uiRem(0.85), maxWidth: "32rem", lineHeight: 1.6 }}>
              管理后台与玩家站需反代到<strong style={{ color: "var(--color-text-secondary)" }}>同一</strong> Node 进程。
              宝塔请在 admin 站点配置与主站相同的 <code style={{ fontFamily: "var(--font-mono)" }}>/socket.io/</code> 与{" "}
              <code style={{ fontFamily: "var(--font-mono)" }}>/api/</code>。
            </p>
          )}
          <button type="button" className="btn btn-primary btn-sm" onClick={onRetry}>
            重试连接
          </button>
        </>
      )}
    </div>
  );
};
