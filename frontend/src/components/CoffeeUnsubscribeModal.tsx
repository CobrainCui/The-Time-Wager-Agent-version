import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { uiRem } from "../utils/typography";
import { socket } from "../socket";
import { COFFEE_ENERGY_GAIN, COFFEE_WEALTH_COST } from "../config/coffeeConfig";
import { normalizeDigitsNonNegativeInt } from "../utils/nonNegativeIntInput";

interface Props {
  open: boolean;
  maxPurchased: number;
  wealth: number;
  energy: number;
  onClose: () => void;
  /** 退订成功（杯数减少）时通知父组件，用于无服务端计数字段时的本地兜底 */
  onRefunded?: (count: number) => void;
}

export const CoffeeUnsubscribeModal: React.FC<Props> = ({
  open,
  maxPurchased,
  wealth,
  energy,
  onClose,
  onRefunded,
}) => {
  const [countInput, setCountInput] = useState("1");
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const countInputRef = useRef<HTMLInputElement>(null);
  const closeRef = useRef<() => void>(() => {});
  const overlayPointerDownRef = useRef(false);
  const titleId = useId();
  const descId = useId();
  const prevPurchasedRef = useRef(maxPurchased);
  const wasOpenRef = useRef(false);
  const refundAttemptRef = useRef<{ wealth: number; energy: number; count: number } | null>(null);

  const close = useCallback(() => {
    if (confirming) {
      refundAttemptRef.current = null;
      setConfirming(false);
    }
    setInlineError(null);
    setCountInput("1");
    onClose();
  }, [confirming, onClose]);

  useEffect(() => {
    closeRef.current = close;
  }, [close]);

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      setCountInput("1");
      setInlineError(null);
      setConfirming(false);
      prevPurchasedRef.current = maxPurchased;
    }
    if (!open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset confirming when modal closes
      setConfirming(false);
    }
    wasOpenRef.current = open;
  }, [open, maxPurchased]);

  useEffect(() => {
    if (!open || confirming) return;
    prevPurchasedRef.current = maxPurchased;
  }, [maxPurchased, open, confirming]);

  useEffect(() => {
    if (open && maxPurchased <= 0 && !confirming) {
      onClose();
    }
  }, [open, maxPurchased, confirming, onClose]);

  const finishRefundSuccess = useCallback(
    (refunded: number) => {
      refundAttemptRef.current = null;
      setConfirming(false);
      setInlineError(null);
      setCountInput("1");
      prevPurchasedRef.current = Math.max(0, prevPurchasedRef.current - refunded);
      if (refunded > 0) onRefunded?.(refunded);
      onClose();
    },
    [onClose, onRefunded]
  );

  useEffect(() => {
    if (!open || !confirming) return;

    if (maxPurchased < prevPurchasedRef.current) {
      finishRefundSuccess(prevPurchasedRef.current - maxPurchased);
      return;
    }

    const attempt = refundAttemptRef.current;
    if (!attempt) return;
    const wealthDelta = wealth - attempt.wealth;
    const energyDelta = attempt.energy - energy;
    const expectWealth = COFFEE_WEALTH_COST * attempt.count;
    const expectEnergy = COFFEE_ENERGY_GAIN * attempt.count;
    if (wealthDelta === expectWealth && energyDelta === expectEnergy) {
      finishRefundSuccess(attempt.count);
    }
  }, [maxPurchased, wealth, energy, open, confirming, finishRefundSuccess]);

  useEffect(() => {
    if (!open || !confirming) return;
    const t = window.setTimeout(() => {
      refundAttemptRef.current = null;
      setConfirming(false);
      setInlineError("退订未确认，请重试或刷新页面");
    }, 8_000);
    return () => window.clearTimeout(t);
  }, [open, confirming]);

  // 焦点陷阱只依赖 open：父级倒计时重渲染换掉 onClose/close 时不要重跑并抢焦点
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // 仅打开瞬间聚焦取消；之后由用户点进输入框，避免反复收起键盘
    cancelRef.current?.focus();

    const restoreDialogFocus = () => {
      const active = document.activeElement;
      const root = dialogRef.current;
      if (!root) return;
      if (active && root.contains(active)) return;
      // 键盘弹出时 Safari 常把焦点落到 body：拉回杯数输入，不抢回「取消」
      if (
        !active ||
        active === document.body ||
        active === document.documentElement
      ) {
        countInputRef.current?.focus();
        return;
      }
      // 真正落到弹层外其它控件：收回弹层内
      cancelRef.current?.focus();
    };

    const onFocusIn = (e: FocusEvent) => {
      const root = dialogRef.current;
      if (!root) return;
      if (root.contains(e.target as Node)) return;
      e.stopPropagation();
      restoreDialogFocus();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        closeRef.current();
        return;
      }
      if (e.key !== "Tab" || !dialogRef.current) return;
      const focusables = dialogRef.current.querySelectorAll<HTMLElement>(
        "button:not(:disabled), input:not(:disabled)"
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("focusin", onFocusIn, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("focusin", onFocusIn, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onError = () => {
      // 只处理「正在退订」期间的失败，避免其它 socket error 误报退订失败
      if (!refundAttemptRef.current) return;
      refundAttemptRef.current = null;
      setConfirming(false);
      setInlineError("退订失败，请先调低预填投资或稍后重试");
    };
    socket.on("error", onError);
    return () => {
      socket.off("error", onError);
    };
  }, [open]);

  const handleConfirm = () => {
    if (confirming || maxPurchased <= 0) return;
    const count = Math.floor(Number(countInput));
    if (!Number.isFinite(count) || count < 1 || count > maxPurchased) {
      setInlineError("请输入有效的退订杯数");
      return;
    }
    setInlineError(null);
    setConfirming(true);
    prevPurchasedRef.current = maxPurchased;
    refundAttemptRef.current = { wealth, energy, count };
    socket.emit("cancelCoffee", { count });
  };

  if (!open) return null;

  return (
    <div
      className="modal-overlay leave-game-modal"
      onPointerDown={(e) => {
        overlayPointerDownRef.current = e.target === e.currentTarget;
      }}
      onPointerUp={(e) => {
        const startedOnOverlay = overlayPointerDownRef.current;
        overlayPointerDownRef.current = false;
        if (startedOnOverlay && e.target === e.currentTarget) {
          close();
        }
      }}
      onPointerCancel={() => {
        overlayPointerDownRef.current = false;
      }}
    >
      <div
        ref={dialogRef}
        className="modal-box"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        style={{ textAlign: "left" }}
      >
        <h3
          id={titleId}
          style={{
            margin: "0 0 0.75rem",
            fontSize: uiRem(1.25),
            fontWeight: 800,
            color: "white",
          }}
        >
          咖啡退订
        </h3>
        <p
          id={descId}
          style={{
            margin: "0 0 1rem",
            color: "var(--color-text-secondary)",
            fontSize: uiRem(0.95),
            lineHeight: 1.6,
          }}
        >
          退订将按杯返还财富并减少精力（每杯 +{COFFEE_WEALTH_COST}💰、−{COFFEE_ENERGY_GAIN}⚡）。
        </p>
        <label style={{ display: "block", marginBottom: "0.5rem", fontSize: uiRem(0.9), color: "var(--color-text-muted)" }}>
          退订杯数
          <input
            ref={countInputRef}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            value={countInput}
            disabled={confirming}
            onChange={(e) => {
              const normalized = normalizeDigitsNonNegativeInt(e.target.value);
              setCountInput(normalized);
              setInlineError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleConfirm();
              }
            }}
            style={{
              display: "block",
              width: "100%",
              marginTop: "0.35rem",
              padding: "0.5rem 0.75rem",
              borderRadius: "0.5rem",
              border: "1px solid var(--color-border)",
              background: "rgba(0,0,0,0.25)",
              color: "white",
              fontSize: uiRem(1),
            }}
          />
        </label>
        {inlineError && (
          <p role="alert" style={{ margin: "0 0 1rem", color: "#f87171", fontSize: uiRem(0.9) }}>
            {inlineError}
          </p>
        )}
        <div className="leave-game-modal__actions">
          <button type="button" className="btn btn-danger" disabled={confirming} onClick={handleConfirm}>
            {confirming ? "处理中…" : "确认退订"}
          </button>
          <button ref={cancelRef} type="button" className="btn btn-gold" onClick={close}>
            取消
          </button>
        </div>
      </div>
    </div>
  );
};
