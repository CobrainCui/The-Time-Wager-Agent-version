import React, { useEffect, useState } from "react";
import { uiRem } from "../utils/typography";
import { socket } from "../socket";
import { SlackHitNotice } from "../types";

type Props = {
  hits?: SlackHitNotice[];
  readOnly?: boolean;
};

export const SlackHitConfirmModal: React.FC<Props> = ({ hits, readOnly = false }) => {
  const hit = hits?.[0];
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setSubmitting(false);
  }, [hit?.id]);

  useEffect(() => {
    if (!hit) setSubmitting(false);
  }, [hit]);

  useEffect(() => {
    const onError = () => setSubmitting(false);
    socket.on("error", onError);
    return () => {
      socket.off("error", onError);
    };
  }, []);

  if (!hit) return null;
  const isGain = hit.energyDelta > 0;

  return (
    <div className="modal-overlay" role="presentation">
      <div
        className="modal-box animate-bounce-in"
        role="dialog"
        aria-modal="true"
        aria-labelledby="slack-hit-title"
        style={{
          border: isGain ? "2px solid rgba(34,197,94,0.65)" : "2px solid rgba(239,68,68,0.6)",
          boxShadow: isGain ? "0 0 60px rgba(34,197,94,0.28)" : "0 0 60px rgba(239,68,68,0.3)",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: "3.5rem", marginBottom: "1rem" }} aria-hidden>
          😴
        </div>
        <h3
          id="slack-hit-title"
          style={{ fontSize: "1.4rem", fontWeight: 800, color: "white", marginBottom: "0.5rem" }}
        >
          {isGain
            ? "摸鱼传染 · 劳逸结合"
            : hit.fromName === "你自己"
              ? "摸鱼传染"
              : "你被摸鱼传染了"}
        </h3>
        <p style={{ color: "var(--color-text-secondary)", marginBottom: "0.75rem" }}>
          {hit.fromName === "你自己"
            ? "你对自己使用了【摸鱼传染】"
            : "有人对你使用了【摸鱼传染】"}
          {isGain ? "，【劳逸结合】生效：获得 8 精力" : ""}
        </p>
        <div
          style={{
            background: isGain ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)",
            border: isGain ? "1px solid rgba(34,197,94,0.3)" : "1px solid rgba(239,68,68,0.25)",
            borderRadius: "0.875rem",
            padding: "1rem",
            marginBottom: "0.75rem",
          }}
        >
          <div
            style={{
              fontSize: uiRem(0.7),
              color: "var(--color-text-muted)",
              marginBottom: "0.25rem",
              fontWeight: 700,
              letterSpacing: "0.1em",
            }}
          >
            精力变化
          </div>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "3rem",
              fontWeight: 900,
              color: isGain ? "#86efac" : "#f87171",
              lineHeight: 1,
            }}
          >
            {hit.energyDelta > 0 ? `+${hit.energyDelta}` : hit.energyDelta}
          </div>
        </div>
        <p
          style={{
            margin: "0 0 1.25rem",
            color: "var(--color-text-muted)",
            fontSize: uiRem(0.8),
            fontFamily: "var(--font-mono)",
          }}
        >
          现在精力 {hit.energyAfter}
        </p>
        {hit.investmentAutoUnlocked && (
          <p
            style={{
              margin: "0 0 1.25rem",
              color: "#fbbf24",
              fontSize: uiRem(0.85),
              fontWeight: 600,
              lineHeight: 1.45,
            }}
          >
            你已自动解锁投资方案，精力已退回，请关闭后重新调整并提交。
          </p>
        )}
        <button
          type="button"
          disabled={readOnly || submitting}
          onClick={() => {
            if (readOnly || submitting) return;
            setSubmitting(true);
            socket.emit("ackSlackHit", { hitId: hit.id });
          }}
          className="btn btn-purple btn-full"
          style={{ fontSize: uiRem(1) }}
        >
          {submitting ? "处理中…" : "确认"}
        </button>
      </div>
    </div>
  );
};
