import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { uiRem } from "../utils/typography";
import type { Phase } from "../types";

interface Props {
  phase: Phase;
  onExit: () => void;
}

function leaveMessage(phase: Phase): string {
  if (phase === "ROOM_WAITING") {
    return "退出后回到大厅，需重新加入房间。";
  }
  if (phase === "GAME_OVER") {
    return "对局已结束，退出后回到大厅。";
  }
  if (phase === "TUTORIAL") {
    return "教程会照常进行。你的座位会显示为离线，用同一昵称再次加入可回到原座位。";
  }
  return "未提交的操作不会代你完成。\n用同一昵称再次加入可回到原座位。";
}

export const LeaveGameButton: React.FC<Props> = ({ phase, onExit }) => {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const continueRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descId = useId();

  const close = useCallback(() => {
    setOpen(false);
    setConfirming(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    continueRef.current?.focus();

    const onFocusIn = (e: FocusEvent) => {
      const root = dialogRef.current;
      if (!root || root.contains(e.target as Node)) return;
      e.stopPropagation();
      continueRef.current?.focus();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        close();
        return;
      }
      if (e.key !== "Tab" || !dialogRef.current) return;
      const focusables = dialogRef.current.querySelectorAll<HTMLButtonElement>("button:not(:disabled)");
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
  }, [open, close]);

  const handleConfirm = () => {
    if (confirming) return;
    setConfirming(true);
    onExit();
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="leave-game-btn"
        aria-haspopup="dialog"
        aria-expanded={open}
        tabIndex={open ? -1 : 0}
        onClick={() => setOpen(true)}
      >
        退出游戏
      </button>
      {open && (
        <div className="modal-overlay leave-game-modal" onClick={close}>
          <div
            ref={dialogRef}
            className="modal-box"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descId}
            onClick={(e) => e.stopPropagation()}
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
              确认退出游戏吗？
            </h3>
            <p
              id={descId}
              style={{
                margin: "0 0 1.5rem",
                color: "var(--color-text-secondary)",
                fontSize: uiRem(0.95),
                lineHeight: 1.6,
                whiteSpace: "pre-line",
              }}
            >
              {leaveMessage(phase)}
            </p>
            <div className="leave-game-modal__actions">
              <button
                type="button"
                className="btn btn-danger"
                disabled={confirming}
                onClick={handleConfirm}
              >
                确认退出
              </button>
              <button
                ref={continueRef}
                type="button"
                className="btn btn-gold"
                disabled={confirming}
                onClick={close}
              >
                继续游戏
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
