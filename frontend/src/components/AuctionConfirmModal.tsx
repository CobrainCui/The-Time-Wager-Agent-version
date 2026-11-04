import React, { useEffect, useMemo, useState } from "react";
import { uiRem } from "../utils/typography";
import { socket } from "../socket";
import type { GameState } from "../types";
import { GavelIcon } from "./icons/GavelIcon";
import {
  formatWealthHoldNote,
  playerAvailableWealth,
  playerLeadingBidReservedWealth,
  playerPendingTransferOutWealth,
} from "../utils/availableWealth";

const BUFF_NAME_MAP: Record<string, string> = {
  buff_gold: "点石成金",
  buff_short: "项目做空",
  buff_slack: "摸鱼传染",
  buff_insurance: "保险",
  buff_lottery: "彩票",
  buff_force_buy: "强买强卖",
  buff_work_rest: "劳逸结合",
  buff_lighter: "打火机",
};

export type AuctionTradeRequest = {
  offerId: string;
  cardId: string;
  cost: number;
};

type Props = {
  /** 当局序列化的本人待确认列表（状态驱动，刷新不丢） */
  pendingOffers?: AuctionTradeRequest[] | null;
  /** 兼容单笔顶单 */
  pending?: AuctionTradeRequest | null;
  wealth: number;
  /** 用于计算可用财富（减去未完成转出等） */
  game?: GameState | null;
  meId?: string;
  /** 离开拍卖阶段时清空本地兜底 */
  phase?: string;
  readOnly?: boolean;
};

export const AuctionConfirmModal: React.FC<Props> = ({
  pendingOffers,
  pending,
  wealth,
  game,
  meId,
  phase,
  readOnly = false,
}) => {
  const queue = useMemo(() => {
    if (pendingOffers && pendingOffers.length > 0) return pendingOffers;
    if (pending) return [pending];
    return [];
  }, [pendingOffers, pending]);

  const request = phase && phase !== "AUCTION" ? null : queue[0] ?? null;
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setSubmitting(false);
  }, [request?.offerId]);

  useEffect(() => {
    if (!request) setSubmitting(false);
  }, [request]);

  useEffect(() => {
    const onError = () => setSubmitting(false);
    const onResolved = (data: { offerId?: string }) => {
      if (!data?.offerId || data.offerId === request?.offerId) {
        setSubmitting(false);
      }
    };
    socket.on("error", onError);
    socket.on("auctionTradeResolved", onResolved);
    return () => {
      socket.off("error", onError);
      socket.off("auctionTradeResolved", onResolved);
    };
  }, [request?.offerId]);

  const handleRespond = (accept: boolean) => {
    if (readOnly) return;
    if (!request || submitting) return;
    setSubmitting(true);
    socket.emit("playerRespondAuction", { offerId: request.offerId, accept });
  };

  if (!request) return null;
  const cardName = BUFF_NAME_MAP[request.cardId] || request.cardId;
  const moreCount = queue.length - 1;
  const spendable =
    game && meId
      ? playerAvailableWealth(game, { id: meId, wealth })
      : wealth;
  const holdNote =
    game && meId
      ? formatWealthHoldNote(
          playerLeadingBidReservedWealth(game, meId),
          playerPendingTransferOutWealth(game, meId)
        )
      : "";
  const wealthAfter = spendable - request.cost;
  const cannotAfford = wealthAfter < 0;

  return (
    <div className="modal-overlay" role="presentation">
      <div
        className="modal-box animate-bounce-in"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auction-confirm-title"
        style={{
          border: "2px solid rgba(168,85,247,0.6)",
          boxShadow: "0 0 60px rgba(168,85,247,0.35)",
          textAlign: "center",
        }}
      >
        <div style={{ display: "flex", justifyContent: "center", marginBottom: "1rem" }} aria-hidden>
          <GavelIcon size={56} decorative />
        </div>
        <h3
          id="auction-confirm-title"
          style={{ fontSize: "1.4rem", fontWeight: 800, color: "white", marginBottom: "0.5rem" }}
        >
          竞拍成功！
        </h3>
        {moreCount > 0 && (
          <p style={{ color: "#c084fc", fontSize: uiRem(0.8), fontWeight: 700, marginBottom: "0.5rem" }}>
            还有 {moreCount} 笔待确认
          </p>
        )}
        <p style={{ color: "var(--color-text-secondary)", marginBottom: "0.75rem" }}>
          你拍得了{" "}
          <span style={{ color: "#d8b4fe", fontWeight: 800, fontSize: uiRem(1.1) }}>{cardName}</span>
        </p>
        <div
          style={{
            background: "rgba(168,85,247,0.1)",
            border: "1px solid rgba(168,85,247,0.25)",
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
            需支付
          </div>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "3rem",
              fontWeight: 900,
              color: "#fbbf24",
              lineHeight: 1,
            }}
          >
            {request.cost}
          </div>
        </div>
        <p
          style={{
            margin: "0 0 1.25rem",
            color: cannotAfford ? "#fca5a5" : "var(--color-text-muted)",
            fontSize: uiRem(0.8),
            fontFamily: "var(--font-mono)",
            fontWeight: cannotAfford ? 700 : 400,
          }}
        >
          {`可用 ${spendable}${holdNote ? `，${holdNote}` : ""}`}
          {cannotAfford ? "。确认后不足，可点「金额有误」" : `。确认后剩 ${wealthAfter}`}
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
            {submitting ? "处理中…" : "确认支付 ✓"}
          </button>
        </div>
      </div>
    </div>
  );
};
