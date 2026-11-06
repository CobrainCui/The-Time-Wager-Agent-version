import React, { useEffect, useState } from "react";
import { uiRem } from "../utils/typography";
import { socket } from "../socket";
import { LighterBurnNotice } from "../types";

type Props = {
  notices?: LighterBurnNotice[];
  readOnly?: boolean;
};

export const LighterBurnConfirmModal: React.FC<Props> = ({ notices, readOnly = false }) => {
  const notice = notices?.[0];
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setSubmitting(false);
  }, [notice?.id]);

  useEffect(() => {
    const onError = () => setSubmitting(false);
    socket.on("error", onError);
    return () => {
      socket.off("error", onError);
    };
  }, []);

  if (!notice) return null;

  const isInventory = notice.kind === "inventory";
  const isMiss = notice.kind === "miss";
  const blocked = readOnly || submitting;

  return (
    <div className="modal-overlay" role="presentation">
      <div
        className="modal-box animate-bounce-in"
        role="dialog"
        aria-modal="true"
        aria-labelledby="lighter-burn-title"
        style={{
          border: isMiss
            ? "2px solid rgba(148,163,184,0.55)"
            : "2px solid rgba(249,115,22,0.65)",
          boxShadow: isMiss
            ? "0 0 40px rgba(148,163,184,0.18)"
            : "0 0 60px rgba(249,115,22,0.28)",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: "3.5rem", marginBottom: "1rem" }} aria-hidden>
          {isMiss ? "🕯️" : "🔥"}
        </div>
        <h3
          id="lighter-burn-title"
          style={{ fontSize: "1.35rem", fontWeight: 800, color: "white", marginBottom: "0.5rem" }}
        >
          {isMiss
            ? "打火机 · 未烧中"
            : isInventory
              ? "打火机 · 手牌被烧毁"
              : "打火机 · 本卡生效轮次内效果作废"}
        </h3>
        <p style={{ color: "var(--color-text-secondary)", marginBottom: "1rem", lineHeight: 1.5 }}>
          {notice.message}
        </p>
        {(notice.energyRefund != null || notice.wealthRefund != null) && (
          <div
            style={{
              background: "rgba(249,115,22,0.1)",
              border: "1px solid rgba(249,115,22,0.3)",
              borderRadius: "0.875rem",
              padding: "0.75rem 1rem",
              marginBottom: "1rem",
              fontSize: uiRem(0.85),
              color: "#fdba74",
            }}
          >
            {notice.energyRefund != null && (
              <div>
                精力调整：{notice.energyRefund > 0 ? `+${notice.energyRefund}` : notice.energyRefund}
              </div>
            )}
            {notice.wealthRefund != null && notice.wealthRefund > 0 && (
              <div>财富扣回：-{notice.wealthRefund}</div>
            )}
          </div>
        )}
        {isInventory && (
          <p style={{ fontSize: uiRem(0.78), color: "var(--color-text-muted)", marginBottom: "1rem" }}>
            确认后【{notice.cardName}】将从你的手牌移除。
          </p>
        )}
        <button
          type="button"
          disabled={blocked}
          onClick={() => {
            if (blocked) return;
            setSubmitting(true);
            socket.emit("ackLighterBurn", { noticeId: notice.id });
          }}
          className="btn btn-purple btn-full"
          style={{ fontSize: uiRem(1) }}
        >
          {readOnly ? "观战模式" : submitting ? "处理中…" : "我知道了"}
        </button>
      </div>
    </div>
  );
};
