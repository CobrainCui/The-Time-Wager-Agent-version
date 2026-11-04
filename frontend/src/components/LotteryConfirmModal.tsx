import React, { useEffect, useState } from "react";
import { uiRem } from "../utils/typography";
import { socket } from "../socket";

export type LotterySettleRequest = {
  offerId: string;
  amount: number;
};

type Props = {
  pending?: LotterySettleRequest | null;
  wealth: number;
  /** 本轮是否持有点石成金（正奖金确认时显示 ×1.5） */
  hasGoldBuff?: boolean;
  readOnly?: boolean;
};

function lotteryCreditedAmount(faceAmount: number, hasGoldBuff: boolean): number {
  if (hasGoldBuff && faceAmount > 0) return Math.floor(faceAmount * 1.5);
  return faceAmount;
}

export const LotteryConfirmModal: React.FC<Props> = ({ pending, wealth, hasGoldBuff = false, readOnly = false }) => {
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setSubmitting(false);
  }, [pending?.offerId]);

  useEffect(() => {
    if (!pending) setSubmitting(false);
  }, [pending]);

  useEffect(() => {
    const onError = () => setSubmitting(false);
    socket.on("error", onError);
    return () => {
      socket.off("error", onError);
    };
  }, []);

  const handleRespond = (accept: boolean) => {
    if (readOnly) return;
    if (!pending || submitting) return;
    setSubmitting(true);
    socket.emit("playerRespondLottery", { offerId: pending.offerId, accept });
  };

  if (!pending) return null;
  const faceAmount = pending.amount;
  const goldApplied = hasGoldBuff && faceAmount > 0;
  const credited = lotteryCreditedAmount(faceAmount, hasGoldBuff);
  const isLoss = credited < 0;
  const isZero = credited === 0;
  const wealthAfter = wealth + credited;

  return (
    <div className="modal-overlay" role="presentation">
      <div
        className="modal-box animate-bounce-in"
        role="dialog"
        aria-modal="true"
        aria-labelledby="lottery-confirm-title"
        style={{
          border: "2px solid rgba(236,72,153,0.6)",
          boxShadow: "0 0 60px rgba(236,72,153,0.35)",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: "3.5rem", marginBottom: "1rem" }} aria-hidden>
          🎲
        </div>
        <h3
          id="lottery-confirm-title"
          style={{ fontSize: "1.4rem", fontWeight: 800, color: "white", marginBottom: "0.5rem" }}
        >
          彩票开奖！
        </h3>
        <p style={{ color: "var(--color-text-secondary)", marginBottom: "0.75rem" }}>
          {isZero
            ? "本局开奖金额为 0"
            : isLoss
              ? "本局开奖结果为扣减财富"
              : goldApplied
                ? "你获得了彩票奖金（点石成金：正向收益 ×1.5）"
                : "你获得了彩票奖金"}
        </p>
        <div
          style={{
            background: "rgba(236,72,153,0.1)",
            border: "1px solid rgba(236,72,153,0.25)",
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
          {goldApplied ? (
            <>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "2.25rem",
                  fontWeight: 900,
                  color: "#fbbf24",
                  lineHeight: 1.15,
                }}
              >
                （{faceAmount}）×1.5
              </div>
              <div
                style={{
                  marginTop: "0.35rem",
                  fontFamily: "var(--font-mono)",
                  fontSize: uiRem(1.1),
                  fontWeight: 700,
                  color: "#fcd34d",
                }}
              >
                入账 +{credited}
              </div>
            </>
          ) : (
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "3rem",
                fontWeight: 900,
                color: isLoss ? "#f87171" : "#fbbf24",
                lineHeight: 1,
              }}
            >
              {credited > 0 ? `+${credited}` : credited}
            </div>
          )}
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
            金额有误
          </button>
          <button
            type="button"
            disabled={readOnly || submitting}
            onClick={() => handleRespond(true)}
            className="btn btn-purple"
            style={{ flex: 1, fontSize: uiRem(1) }}
          >
            {submitting ? "处理中…" : "确认领取 ✓"}
          </button>
        </div>
      </div>
    </div>
  );
};
