import React, { useEffect, useRef, useState } from "react";
import { uiRem } from "../utils/typography";
import { socket } from "../socket";

export type WealthAdjustRequest = {
  offerId: string;
  delta: number;
};

type Props = {
  pending?: WealthAdjustRequest | null;
  wealth: number;
  readOnly?: boolean;
};

export const WealthAdjustConfirmModal: React.FC<Props> = ({ pending, wealth, readOnly = false }) => {
  const [submitting, setSubmitting] = useState(false);
  const pendingOfferIdRef = useRef<string | null>(null);
  pendingOfferIdRef.current = pending?.offerId ?? null;

  useEffect(() => {
    setSubmitting(false);
  }, [pending?.offerId]);

  useEffect(() => {
    if (!pending) setSubmitting(false);
  }, [pending]);

  useEffect(() => {
    const onError = () => setSubmitting(false);
    const onCancelled = (payload?: { offerId?: string }) => {
      // 替换报价时会取消旧 offerId；勿误伤新报价提交中的状态
      if (payload?.offerId && pendingOfferIdRef.current && payload.offerId !== pendingOfferIdRef.current) {
        return;
      }
      setSubmitting(false);
    };
    socket.on("error", onError);
    socket.on("wealthAdjustCancelled", onCancelled);
    return () => {
      socket.off("error", onError);
      socket.off("wealthAdjustCancelled", onCancelled);
    };
  }, []);

  const handleRespond = (accept: boolean) => {
    if (readOnly) return;
    if (!pending || submitting) return;
    setSubmitting(true);
    socket.emit("playerRespondWealthAdjust", { offerId: pending.offerId, accept });
  };

  if (!pending) return null;
  const delta = pending.delta;
  const isLoss = delta < 0;
  const wealthAfter = wealth + delta;
  const signed = delta > 0 ? `+${delta}` : String(delta);

  return (
    <div className="modal-overlay" role="presentation">
      <div
        className="modal-box animate-bounce-in"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wealth-adjust-confirm-title"
        style={{
          border: "2px solid rgba(251,191,36,0.55)",
          boxShadow: "0 0 60px rgba(251,191,36,0.28)",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: "3.5rem", marginBottom: "1rem" }} aria-hidden>
          💰
        </div>
        <h3
          id="wealth-adjust-confirm-title"
          style={{ fontSize: "1.4rem", fontWeight: 800, color: "white", marginBottom: "0.5rem" }}
        >
          财富调整确认
        </h3>
        <p style={{ color: "var(--color-text-secondary)", marginBottom: "0.75rem" }}>
          {isLoss ? "主持人拟扣减你的财富" : "主持人拟增加你的财富"}
        </p>
        <div
          style={{
            background: "rgba(251,191,36,0.1)",
            border: "1px solid rgba(251,191,36,0.25)",
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
            {isLoss ? "扣除财富" : "获得财富"}
          </div>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "3rem",
              fontWeight: 900,
              color: isLoss ? "#f87171" : "#fbbf24",
              lineHeight: 1,
            }}
          >
            {signed}
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
          确认后财富 {wealth} → {wealthAfter}
        </p>
        <div style={{ display: "flex", gap: "0.75rem" }}>
          <button
            type="button"
            disabled={readOnly || submitting}
            onClick={() => handleRespond(false)}
            className="btn btn-ghost"
            style={{ flex: 1 }}
          >
            拒绝
          </button>
          <button
            type="button"
            disabled={readOnly || submitting}
            onClick={() => handleRespond(true)}
            className="btn btn-primary"
            style={{ flex: 1, fontSize: uiRem(1) }}
          >
            {submitting ? "处理中…" : "接受 ✓"}
          </button>
        </div>
      </div>
    </div>
  );
};
