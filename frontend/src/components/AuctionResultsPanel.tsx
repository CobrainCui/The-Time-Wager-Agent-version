import React from "react";
import { BUFF_CARD_DEFS } from "../config/buffCards";
import { BuffCardArt } from "./BuffCardArt";
import { uiRem } from "../utils/typography";
import { formatAuctionLotPrice, resolveAuctionLotSource } from "../utils/auctionLotDisplay";

export type AuctionSoldLotView = {
  cardId: string;
  playerId: string;
  playerName: string;
  cost: number;
  source?: "hammer" | "force_buy";
};

type Props = {
  lots: AuctionSoldLotView[];
  buffImages?: Record<string, number>;
  meId: string;
  variant: "rail" | "strip";
};

export const AuctionResultsPanel: React.FC<Props> = ({
  lots,
  buffImages = {},
  meId,
  variant,
}) => {
  const isStrip = variant === "strip";

  if (lots.length === 0) {
    return (
      <div
        style={{
          padding: isStrip ? "0.65rem 0.85rem" : "0.85rem 1rem",
          borderRadius: "0.875rem",
          border: "1px dashed rgba(168,85,247,0.28)",
          color: "var(--color-text-muted)",
          fontSize: uiRem(0.82),
          textAlign: isStrip ? "center" : "left",
        }}
      >
        本场尚无成交
      </div>
    );
  }

  if (isStrip) {
    return (
      <div
        className="auction-results-strip"
        style={{
          display: "flex",
          gap: "0.65rem",
          overflowX: "auto",
          paddingBottom: "0.25rem",
          WebkitOverflowScrolling: "touch",
        }}
      >
        {lots.map((lot) => (
          <AuctionResultCard
            key={lot.cardId}
            lot={lot}
            buffImages={buffImages}
            meId={meId}
            compact
          />
        ))}
      </div>
    );
  }

  return (
    <div
      style={{
        background: "rgba(0,0,0,0.28)",
        border: "1px solid rgba(251,191,36,0.28)",
        borderRadius: "1rem",
        padding: "0.85rem 0.9rem",
        position: "sticky",
        top: "calc(var(--buff-invest-tab-h, 0px) + 0.75rem)",
        maxHeight: "min(70vh, 520px)",
        overflowY: "auto",
      }}
    >
      <div
        style={{
          fontWeight: 800,
          color: "#fbbf24",
          fontSize: uiRem(0.85),
          marginBottom: "0.65rem",
          letterSpacing: "0.04em",
        }}
      >
        本场成交
        <span style={{ color: "var(--color-text-muted)", fontWeight: 600, marginLeft: "0.35rem" }}>
          ({lots.length})
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.55rem" }}>
        {lots.map((lot) => (
          <AuctionResultCard
            key={lot.cardId}
            lot={lot}
            buffImages={buffImages}
            meId={meId}
            compact={false}
          />
        ))}
      </div>
    </div>
  );
};

const AuctionResultCard: React.FC<{
  lot: AuctionSoldLotView;
  buffImages: Record<string, number>;
  meId: string;
  compact: boolean;
}> = ({ lot, buffImages, meId, compact }) => {
  const def = BUFF_CARD_DEFS[lot.cardId];
  const isMe = lot.playerId === meId;
  const priceLabel = formatAuctionLotPrice(lot.cost, lot.source);
  const isForceBuy = resolveAuctionLotSource(lot.cost, lot.source) === "force_buy";

  if (compact) {
    return (
      <div
        style={{
          flex: "0 0 auto",
          width: "9.5rem",
          background: "rgba(255,255,255,0.04)",
          border: `1px solid ${isMe ? "rgba(251,191,36,0.45)" : "rgba(255,255,255,0.08)"}`,
          borderRadius: "0.75rem",
          padding: "0.5rem",
          display: "flex",
          flexDirection: "column",
          gap: "0.35rem",
        }}
      >
        <div style={{ width: "100%", maxWidth: "4.5rem", margin: "0 auto" }}>
          <BuffCardArt cardId={lot.cardId} buffImages={buffImages} compact />
        </div>
        <div
          style={{
            fontWeight: 800,
            fontSize: uiRem(0.72),
            color: def?.color || "#d8b4fe",
            lineHeight: 1.25,
            textAlign: "center",
          }}
        >
          {def?.name || lot.cardId}
        </div>
        <div
          style={{
            fontSize: uiRem(0.7),
            fontWeight: isMe ? 800 : 700,
            color: isMe ? "#fbbf24" : "white",
            textAlign: "center",
          }}
        >
          {lot.playerName}
        </div>
        <div
          style={{
            fontSize: uiRem(0.68),
            fontWeight: 800,
            fontFamily: isForceBuy ? undefined : "var(--font-mono)",
            color: isForceBuy ? "#c084fc" : "#fbbf24",
            textAlign: "center",
          }}
        >
          {priceLabel}
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "3.25rem 1fr",
        gap: "0.55rem 0.65rem",
        alignItems: "center",
        padding: "0.45rem 0.5rem",
        borderRadius: "0.65rem",
        background: "rgba(255,255,255,0.03)",
        border: `1px solid ${isMe ? "rgba(251,191,36,0.35)" : "rgba(255,255,255,0.06)"}`,
      }}
    >
      <div style={{ width: "3.25rem" }}>
        <BuffCardArt cardId={lot.cardId} buffImages={buffImages} compact />
      </div>
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontWeight: 800,
            fontSize: uiRem(0.82),
            color: def?.color || "#d8b4fe",
            lineHeight: 1.25,
            marginBottom: "0.15rem",
          }}
        >
          {def?.name || lot.cardId}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem 0.5rem", alignItems: "center" }}>
          <span
            style={{
              fontWeight: isMe ? 800 : 700,
              fontSize: uiRem(0.78),
              color: isMe ? "#fbbf24" : "white",
            }}
          >
            {lot.playerName}
          </span>
          <span
            style={{
              fontSize: uiRem(0.72),
              fontWeight: 800,
              fontFamily: isForceBuy ? undefined : "var(--font-mono)",
              color: isForceBuy ? "#c084fc" : "#fbbf24",
              background: isForceBuy ? "rgba(168,85,247,0.15)" : "rgba(251,191,36,0.12)",
              padding: "0.1rem 0.4rem",
              borderRadius: "0.35rem",
            }}
          >
            {priceLabel}
          </span>
        </div>
      </div>
    </div>
  );
};
