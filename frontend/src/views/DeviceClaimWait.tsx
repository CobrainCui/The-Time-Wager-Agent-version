import React from "react";
import { uiRem } from "../utils/typography";
import { socket } from "../socket";
import { clearGameSession } from "../gameSession";

type Props = {
  roomId: string;
  playerName: string;
  onCancel: () => void;
};

export const DeviceClaimWait: React.FC<Props> = ({ roomId, playerName, onCancel }) => {
  return (
    <div
      className="page-center"
      style={{
        minHeight: "100vh",
        padding: "1.5rem",
        flexDirection: "column",
        gap: "1.25rem",
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: "3rem" }} aria-hidden>
        ⏳
      </div>
      <h1 style={{ fontSize: uiRem(1.35), fontWeight: 800, color: "white", margin: 0 }}>
        等待主持人认领
      </h1>
      <p style={{ color: "var(--color-text-secondary)", maxWidth: "22rem", lineHeight: 1.6 }}>
        你已用昵称 <strong style={{ color: "#fbbf24" }}>{playerName}</strong> 请求进入房间{" "}
        <span style={{ fontFamily: "var(--font-mono)" }}>{roomId}</span>。
        请提醒主持在控制台点击「认领」，通过后即可同步当前对局进度。
      </p>
      <button
        type="button"
        className="btn btn-ghost"
        onClick={() => {
          socket.emit("cancelDeviceClaim");
          clearGameSession();
          onCancel();
        }}
      >
        取消等待
      </button>
    </div>
  );
};
