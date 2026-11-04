import React, { useState } from "react";
import { uiRem } from "../utils/typography";

interface Props {
  onSubmit: (token: string) => void;
  error?: string | null;
  pending?: boolean;
}

export const AdminLogin: React.FC<Props> = ({ onSubmit, error, pending }) => {
  const [token, setToken] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = token.trim();
    if (!trimmed || pending) return;
    onSubmit(trimmed);
  };

  return (
    <div
      className="page-center"
      style={{
        minHeight: "100vh",
        background: "#070b14",
        padding: "2rem 1rem",
      }}
    >
      <div className="container-sm" style={{ width: "100%", maxWidth: "28rem" }}>
        <h1
          style={{
            fontSize: "2rem",
            fontWeight: 900,
            color: "#fbbf24",
            marginBottom: "0.5rem",
            textAlign: "center",
          }}
        >
          管理员控制台
        </h1>
        <p style={{ color: "var(--color-text-muted)", textAlign: "center", marginBottom: "2rem", fontSize: uiRem(0.9) }}>
          请输入与服务器配置的 ADMIN_TOKEN 一致的密钥
        </p>
        <form onSubmit={handleSubmit} className="glass" style={{ borderRadius: "1.25rem", padding: "1.5rem" }}>
          <label
            style={{
              display: "block",
              fontSize: uiRem(0.75),
              fontWeight: 700,
              color: "var(--color-text-muted)",
              marginBottom: "0.5rem",
            }}
          >
            管理密钥
          </label>
          <input
            type="password"
            className="input input-mono"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="ADMIN_TOKEN"
            autoComplete="current-password"
            disabled={pending}
            style={{ marginBottom: "1rem" }}
          />
          {error && (
            <p style={{ color: "#f87171", fontSize: uiRem(0.85), marginBottom: "1rem" }}>{error}</p>
          )}
          <button type="submit" className="btn btn-gold btn-full btn-lg" disabled={!token.trim() || pending}>
            {pending ? "验证中…" : "登录"}
          </button>
        </form>
      </div>
    </div>
  );
};
