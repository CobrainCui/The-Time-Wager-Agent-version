import React, { useEffect, useMemo, useState } from "react";
import { uiRem } from "../utils/typography";
import { socket } from "../socket";
import type { LotterySource } from "../types";

export type LotterySettleRequest = {
  offerId: string;
  amount: number;
  /** 线上随机骰子点数 1–6；旧档/手动开奖为空 */
  roll?: number | null;
  source?: LotterySource;
  drawnAt?: number | null;
};

type Props = {
  pending?: LotterySettleRequest | null;
  wealth: number;
  /** 本轮是否持有点石成金（正奖金确认时显示 ×1.5） */
  hasGoldBuff?: boolean;
  readOnly?: boolean;
};

const PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

function lotteryCreditedAmount(faceAmount: number, hasGoldBuff: boolean): number {
  if (hasGoldBuff && faceAmount > 0) return Math.floor(faceAmount * 1.5);
  return faceAmount;
}

const DiceFace: React.FC<{ value: number; rolling?: boolean }> = ({ value, rolling = false }) => {
  const pips = useMemo(() => new Set(PIPS[value] ?? PIPS[1]), [value]);
  return (
    <div
      className={`lottery-dice${rolling ? " lottery-dice--rolling" : ""}`}
      aria-label={`骰子 ${value} 点`}
      role="img"
    >
      {Array.from({ length: 9 }, (_, i) => (
        <span
          key={i}
          className={`lottery-dice__pip${pips.has(i) ? " is-on" : ""}`}
          aria-hidden
        />
      ))}
    </div>
  );
};

export const LotteryConfirmModal: React.FC<Props> = ({
  pending,
  wealth,
  hasGoldBuff = false,
  readOnly = false,
}) => {
  const [submitting, setSubmitting] = useState(false);
  const [rolling, setRolling] = useState(false);
  const [face, setFace] = useState(1);

  const targetRoll =
    pending && typeof pending.roll === "number" && pending.roll >= 1 && pending.roll <= 6
      ? pending.roll
      : null;

  useEffect(() => {
    setSubmitting(false);
  }, [pending?.offerId]);

  useEffect(() => {
    if (!pending) {
      setRolling(false);
      setSubmitting(false);
      return;
    }
    if (targetRoll == null) {
      setRolling(false);
      setFace(1);
      return;
    }
    setRolling(true);
    setFace(1);
    const spin = setInterval(() => setFace((f) => (f % 6) + 1), 95);
    const timer = setTimeout(() => {
      clearInterval(spin);
      setFace(targetRoll);
      setRolling(false);
    }, 1800);
    return () => {
      clearInterval(spin);
      clearTimeout(timer);
    };
  }, [pending?.offerId, targetRoll]);

  useEffect(() => {
    const onError = () => setSubmitting(false);
    socket.on("error", onError);
    return () => {
      socket.off("error", onError);
    };
  }, []);

  const handleRespond = () => {
    if (readOnly || !pending || submitting || rolling) return;
    setSubmitting(true);
    socket.emit("playerRespondLottery", { offerId: pending.offerId, accept: true });
  };

  if (!pending) return null;
  const faceAmount = pending.amount;
  const goldApplied = hasGoldBuff && faceAmount > 0;
  const credited = lotteryCreditedAmount(faceAmount, hasGoldBuff);
  const isLoss = credited < 0;
  const isZero = credited === 0;
  const wealthAfter = wealth + credited;
  const sourceLabel =
    pending.source === "random.org"
      ? "线上随机 · random.org"
      : pending.source === "manual"
        ? "主持手动开奖"
        : pending.source === "server"
          ? "服务器加密随机"
          : "";

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
        <h3
          id="lottery-confirm-title"
          style={{ fontSize: "1.4rem", fontWeight: 800, color: "white", marginBottom: "0.35rem" }}
        >
          🎲 彩票开奖
        </h3>
        <p style={{ color: "var(--color-text-muted)", margin: "0 0 1rem", fontSize: uiRem(0.8) }}>
          {rolling ? "正在掷骰…" : sourceLabel || "开奖结果已生成"}
        </p>

        {targetRoll != null ? (
          <div style={{ marginBottom: "1rem" }}>
            <DiceFace value={face} rolling={rolling} />
            <div
              style={{
                marginTop: "0.65rem",
                fontFamily: "var(--font-mono)",
                fontSize: uiRem(0.85),
                color: rolling ? "var(--color-text-muted)" : "#f9a8d4",
                fontWeight: 700,
                minHeight: "1.2em",
              }}
            >
              {rolling ? "点数滚动中…" : `骰子 ${targetRoll} 点`}
            </div>
          </div>
        ) : (
          <div style={{ fontSize: "3rem", marginBottom: "0.75rem" }} aria-hidden>
            🎲
          </div>
        )}

        <p style={{ color: "var(--color-text-secondary)", marginBottom: "0.75rem" }}>
          {isZero
            ? "本局开奖金额为 0"
            : isLoss
              ? "本局开奖结果为扣减财富"
              : goldApplied
                ? "你获得了彩票奖金（点石成金：正向收益按 1.5 倍结算）"
                : "你获得了彩票奖金"}
        </p>
        <div
          className={rolling ? undefined : "lottery-prize-reveal"}
          style={{
            background: "rgba(236,72,153,0.1)",
            border: "1px solid rgba(236,72,153,0.25)",
            borderRadius: "0.875rem",
            padding: "1rem",
            marginBottom: "0.75rem",
            opacity: rolling ? 0.35 : 1,
            transition: "opacity 180ms ease",
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
                {rolling ? "?" : `（${faceAmount}）的 1.5 倍`}
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
                {rolling ? "等待揭晓" : `入账 +${credited}`}
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
              {rolling ? "?" : credited > 0 ? `+${credited}` : credited}
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
          {rolling ? "开奖后自动显示入账金额" : `确认后财富 ${wealth} → ${wealthAfter}`}
        </p>
        <button
          type="button"
          disabled={readOnly || submitting || rolling}
          onClick={handleRespond}
          className="btn btn-purple btn-full"
          style={{ fontSize: uiRem(1) }}
        >
          {rolling ? "摇奖中…" : submitting ? "处理中…" : "确认领取 ✓"}
        </button>
      </div>
    </div>
  );
};
