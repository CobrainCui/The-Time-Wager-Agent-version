import React, { useEffect, useMemo, useRef, useState } from "react";
import { uiRem } from "../utils/typography";
import { GameState, Player } from "../types";
import { BUFF_CARD_DEFS, getAuctionCardsForEra } from "../config/buffCards";
import { AuctionResultsPanel } from "../components/AuctionResultsPanel";
import { BuffCardArt } from "../components/BuffCardArt";
import { GavelIcon } from "../components/icons/GavelIcon";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { socket } from "../socket";
import {
  formatWealthHoldNote,
  playerAvailableWealth,
  playerLeadingBidReservedWealth,
  playerPendingTransferOutWealth,
} from "../utils/availableWealth";
import {
  normalizeDigitsNonNegativeInt,
  parseNormalizedNonNegativeInt,
} from "../utils/nonNegativeIntInput";
import { BuffDescText } from "../utils/buffDescEmphasis";

interface Props {
  game: GameState;
  me: Player;
  buffImages?: Record<string, number>;
  /** 主持公共预览：只展示牌面与出价记录，隐藏个人出价 */
  embed?: boolean;
  /** 教程等本地试玩：出价走回调，不发 socket */
  onPlaceBid?: (amount: number) => void;
  onUseForceBuy?: () => void;
  /** 嵌入教程下半区，去掉整页留白 */
  layout?: "page" | "embedded";
}

function formatBidTime(ts: number): string {
  try {
    return new Date(ts).toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return "";
  }
}

export const AuctionView: React.FC<Props> = ({
  game,
  me,
  buffImages = {},
  embed = false,
  onPlaceBid,
  onUseForceBuy,
  layout = "page",
}) => {
  const distributed = new Set(game.auctionDistributedCardIds || []);
  const focusId = game.auctionFocusCardId;
  const hasForceBuy = me.inventory.includes("buff_force_buy");
  const forceBuyUsed = (game.forceBuyUsedPlayerIds ?? []).includes(me.id);
  const availableForBid = playerAvailableWealth(game, me, { exceptOwnLeading: true });
  const availableShown = playerAvailableWealth(game, me);
  const holdShown = formatWealthHoldNote(
    playerLeadingBidReservedWealth(game, me.id),
    playerPendingTransferOutWealth(game, me.id)
  );
  const holdForBid = formatWealthHoldNote(
    0,
    playerPendingTransferOutWealth(game, me.id)
  );

  const startingBid = game.auctionStartingBid ?? 5;
  const currentBid = game.auctionCurrentBid ?? 0;
  const minNext = game.auctionMinimumNextBid ?? 5;
  const highBidderId = game.auctionHighBidderId ?? null;
  const highBidderName = game.auctionHighBidderName ?? null;
  const history = game.auctionBidHistory ?? [];
  const soldLots = game.auctionSoldLots ?? [];
  const isWideLayout = useMediaQuery("(min-width: 900px)", false);
  const forceBuyTargetsSelf = focusId === "buff_force_buy";

  const [amountText, setAmountText] = useState("");
  const [sending, setSending] = useState(false);
  const lastAutoMinRef = useRef<number | null>(null);
  const focusIdRef = useRef(focusId);

  useEffect(() => {
    const focusChanged = focusIdRef.current !== focusId;
    focusIdRef.current = focusId;

    setAmountText((prev) => {
      const prevNum = parseNormalizedNonNegativeInt(prev, -1);
      // 换拍品 / 空输入：回到当前最低价
      if (focusChanged || lastAutoMinRef.current === null || prev === "") {
        lastAutoMinRef.current = minNext;
        return String(minNext);
      }
      // 别人抬价后，当前输入已不够：抬到最低价
      if (prevNum < minNext) {
        lastAutoMinRef.current = minNext;
        return String(minNext);
      }
      // 仍是上一档自动填的「至少要出到」：跟着涨，不打断更高的自定义加价
      if (prevNum === lastAutoMinRef.current) {
        lastAutoMinRef.current = minNext;
        return String(minNext);
      }
      lastAutoMinRef.current = minNext;
      return prev;
    });
  }, [minNext, focusId]);

  useEffect(() => {
    const onError = () => setSending(false);
    socket.on("error", onError);
    return () => {
      socket.off("error", onError);
    };
  }, []);

  // 自己的出价已出现在记录里：解除提交中状态
  useEffect(() => {
    if (!sending) return;
    if (highBidderId === me.id) setSending(false);
  }, [sending, highBidderId, me.id]);

  const amount = parseNormalizedNonNegativeInt(amountText, 0);
  const iAmLeading = highBidderId === me.id;
  const submitBlockReason = !focusId
    ? "现在没有正在拍的卡"
    : iAmLeading
      ? "你已暂时领先，无需再出"
      : sending
        ? "正在提交…"
        : !Number.isSafeInteger(amount) || amountText === ""
          ? "请输入出价金额"
          : amount < minNext
            ? `至少要出到 ${minNext}`
            : amount > availableForBid
              ? `可用财富不够（可用 ${availableForBid}${holdForBid ? `，${holdForBid}` : ""}）`
              : null;
  const canSubmit = submitBlockReason == null;

  const myStatus = useMemo(() => {
    if (!focusId) return "none" as const;
    const mineOnCard = history.some((b) => b.playerId === me.id);
    if (highBidderId === me.id) return "leading" as const;
    if (mineOnCard) return "outbid" as const;
    return "none" as const;
  }, [focusId, history, highBidderId, me.id]);

  const pendingCards = useMemo(() => {
    return getAuctionCardsForEra(game.currentEra).filter((c) => !distributed.has(c.id));
  }, [game.currentEra, game.auctionDistributedCardIds]);

  const upcoming = pendingCards.filter((c) => c.id !== focusId);
  const focusDef = focusId ? BUFF_CARD_DEFS[focusId] : null;

  const placeBid = (value: number) => {
    if (submitBlockReason) {
      window.alert(submitBlockReason);
      return;
    }
    if (!focusId || sending) return;
    setSending(true);
    if (onPlaceBid) {
      onPlaceBid(value);
      window.setTimeout(() => setSending(false), 400);
      return;
    }
    socket.emit("playerPlaceAuctionBid", { amount: value });
    window.setTimeout(() => setSending(false), 400);
  };

  const compact = layout === "embedded" || embed;
  const showResultsRail = isWideLayout && !compact;

  const resultsPanel = (
    <AuctionResultsPanel
      lots={soldLots}
      buffImages={buffImages}
      meId={me.id}
      variant={showResultsRail ? "rail" : "strip"}
    />
  );

  const pageStyle = compact
    ? {
        minHeight: 0,
        background: "transparent",
        padding: embed ? "0.5rem 0.75rem 0.75rem" : "0.25rem 0 0.5rem",
      }
    : {
        minHeight: "100vh",
        background: `radial-gradient(ellipse at 50% 0%, rgba(168,85,247,0.14) 0%, transparent 55%), #070b14`,
        padding: "2.5rem 1rem 3rem",
        paddingTop: "3.25rem",
        paddingBottom: "calc(3rem + env(safe-area-inset-bottom, 0px))",
      };

  return (
    <div
      className={compact ? "auction-page auction-page--embedded" : "auction-page"}
      style={pageStyle}
    >
      <div style={{ maxWidth: showResultsRail ? "1280px" : "1120px", margin: "0 auto" }}>
        {!compact && (
          <div style={{ textAlign: "center", marginBottom: "1.75rem" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                marginBottom: "0.75rem",
                animation: "float 3s ease-in-out infinite",
                filter: "drop-shadow(0 0 14px rgba(168,85,247,0.5))",
              }}
            >
              <GavelIcon size={56} decorative />
            </div>
            <h1 style={{ fontSize: "2rem", fontWeight: 900, color: "#c084fc", margin: 0 }}>拍卖会</h1>
          </div>
        )}

        {!showResultsRail && (
          <div style={{ marginBottom: compact ? "0.75rem" : "1.25rem" }}>
            {!compact && (
              <div
                style={{
                  fontWeight: 800,
                  color: "var(--color-text-secondary)",
                  marginBottom: "0.5rem",
                  fontSize: uiRem(0.85),
                }}
              >
                本场成交
              </div>
            )}
            {resultsPanel}
          </div>
        )}

        {!focusId ? (
          <div
            className="auction-lot-layout"
            style={{
              display: "grid",
              gridTemplateColumns: showResultsRail ? "minmax(0, 1fr) minmax(200px, 0.88fr)" : "1fr",
              gap: "1.25rem",
              alignItems: "start",
            }}
          >
            <div
              style={{
                border: "2px dashed rgba(168,85,247,0.35)",
                borderRadius: "1rem",
                padding: "2.5rem 1rem",
                textAlign: "center",
                color: "var(--color-text-muted)",
                fontSize: uiRem(0.9),
              }}
            >
              {pendingCards.length === 0
                ? "本轮待拍道具已全部成交，请等待主持人结束拍卖。"
                : "暂时没有正在拍的卡，请等待主持人选择。"}
            </div>
            {showResultsRail && resultsPanel}
          </div>
        ) : (
          <div
            className="auction-lot-layout"
            style={{
              display: "grid",
              gridTemplateColumns: showResultsRail
                ? "minmax(0, 1fr) minmax(0, 1.15fr) minmax(200px, 0.88fr)"
                : "minmax(0, 1fr) minmax(0, 1.15fr)",
              gap: "1.25rem",
              alignItems: "start",
            }}
          >
            {/* 左侧：正在拍 */}
            <div
              style={{
                background: "var(--color-bg-card)",
                border: "1px solid rgba(251,191,36,0.45)",
                boxShadow: "0 0 22px rgba(251,191,36,0.15)",
                borderRadius: "1.125rem",
                padding: "1.25rem",
                display: "flex",
                flexDirection: "column",
                gap: "0.875rem",
              }}
            >
              <div style={{ fontSize: uiRem(0.75), fontWeight: 800, color: "#fbbf24", letterSpacing: "0.06em" }}>
                正在拍
              </div>
              <BuffCardArt cardId={focusId} buffImages={buffImages} />
              <div>
                <div
                  style={{
                    fontWeight: 800,
                    color: focusDef?.color || "#d8b4fe",
                    fontSize: uiRem(1.2),
                    marginBottom: "0.5rem",
                    lineHeight: 1.3,
                  }}
                >
                  {focusDef?.name || focusId}
                </div>
                <div
                  style={{
                    fontSize: uiRem(0.88),
                    color: "var(--color-text-secondary)",
                    lineHeight: 1.55,
                  }}
                >
                  {focusDef?.desc ? <BuffDescText text={focusDef.desc} /> : "—"}
                </div>
              </div>
              {!embed && hasForceBuy && (
                <button
                  type="button"
                  className="btn btn-purple btn-sm"
                  disabled={forceBuyUsed || forceBuyTargetsSelf}
                  onClick={() => {
                    if (forceBuyUsed || forceBuyTargetsSelf) return;
                    const name = focusDef?.name || focusId;
                    if (
                      !window.confirm(
                        `使用强买强卖？\n将免费拿走正在拍的【${name}】。该卡牌（强买强卖）只能用一次。`
                      )
                    ) {
                      return;
                    }
                    if (onUseForceBuy) {
                      onUseForceBuy();
                      return;
                    }
                    socket.emit("useBuffCard", { cardId: "buff_force_buy" });
                  }}
                >
                  {forceBuyUsed
                    ? "该卡牌（强买强卖）只能用一次"
                    : forceBuyTargetsSelf
                      ? "不能强买正在拍的强买强卖"
                      : "强买强卖：免费拿走正在拍的这张"}
                </button>
              )}
            </div>

            {/* 右侧：加价过程 */}
            <div
              className="auction-bid-panel"
              style={{
                background: "rgba(168,85,247,0.06)",
                border: "1px solid rgba(168,85,247,0.3)",
                borderRadius: "1.125rem",
                padding: "1.25rem",
                display: "flex",
                flexDirection: "column",
                gap: "1rem",
                minHeight: "320px",
                minWidth: 0,
              }}
            >
              <div
                className="auction-price-grid"
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                  gap: "0.65rem",
                  fontSize: uiRem(0.82),
                }}
              >
                <PriceCell label="起拍价" value={String(startingBid)} />
                <PriceCell
                  label="现在最高价"
                  value={currentBid > 0 ? String(currentBid) : "—"}
                  hint={currentBid <= 0 ? "还没有人出价" : undefined}
                  accent
                />
                <PriceCell
                  label="出价最高的人"
                  value={highBidderName || "还没有人出价"}
                />
                <PriceCell label="至少要出到" value={String(minNext)} accent />
              </div>

              <div className="auction-my-bid-summary" style={{ fontSize: uiRem(0.8), color: "var(--color-text-secondary)" }}>
                {!embed && (
                  <>
                    <div className="auction-my-wealth-row" aria-label={`可用财富 ${availableShown}`}>
                      <span style={{ fontSize: uiRem(1.05) }} aria-hidden>💰</span>
                      <strong className="auction-mono-amount auction-mono-amount--wealth">
                        {availableShown}
                      </strong>
                      {holdShown ? (
                        <span className="auction-wealth-hold">{holdShown}</span>
                      ) : null}
                    </div>
                    {!iAmLeading && (
                      <div className="auction-my-bid-status-row">
                        <span
                          style={{
                            fontWeight: 700,
                            color:
                              myStatus === "outbid"
                                ? "#fca5a5"
                                : "var(--color-text-muted)",
                          }}
                        >
                          {myStatus === "outbid" ? "有人出得比你高" : "你还没出过价"}
                        </span>
                        {myStatus === "outbid" && currentBid > 0 ? (
                          <span className="auction-my-bid-amount-label">
                            现在最高价
                            <strong className="auction-mono-amount auction-mono-amount--bid">
                              {currentBid}
                            </strong>
                          </span>
                        ) : null}
                      </div>
                    )}
                  </>
                )}
                <span style={{ color: "var(--color-text-muted)" }}>
                  每次至少多加 {Math.max(1, minNext - currentBid)}
                </span>
              </div>

              <div>
                <div
                  style={{
                    fontWeight: 800,
                    fontSize: uiRem(0.85),
                    color: "#d8b4fe",
                    marginBottom: "0.5rem",
                  }}
                >
                  出价记录
                </div>
                <div
                  className="auction-bid-history-list"
                  style={{
                    maxHeight: layout === "embedded" ? undefined : "220px",
                    overflowY: layout === "embedded" ? undefined : "auto",
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.4rem",
                  }}
                >
                  {history.length === 0 ? (
                    <div style={{ color: "var(--color-text-muted)", fontSize: uiRem(0.8) }}>
                      还没有出价。起拍价是 {startingBid}，第一手至少出 {startingBid}。
                    </div>
                  ) : (
                    history.map((row, idx) => {
                      const isMine = row.playerId === me.id;
                      return (
                      <div
                        key={row.bidId}
                        className={`auction-bid-history-row${isMine ? " auction-bid-history-row--mine" : ""}`}
                        style={{
                          padding: "0.45rem 0.65rem",
                          borderRadius: "0.65rem",
                          background:
                            row.status === "leading"
                              ? "rgba(251,191,36,0.12)"
                              : "rgba(0,0,0,0.25)",
                          border:
                            row.status === "leading"
                              ? "1px solid rgba(251,191,36,0.4)"
                              : isMine
                                ? "1px solid rgba(134,239,172,0.25)"
                                : "1px solid transparent",
                          fontSize: uiRem(0.78),
                        }}
                      >
                        <span className="auction-bid-history-time">
                          {formatBidTime(row.timestamp)}
                        </span>
                        <span className="auction-bid-history-name">{row.playerName}</span>
                        <span className="auction-bid-history-amount">{row.amount}</span>
                        <span className="auction-bid-history-detail">
                          {idx === history.length - 1
                            ? row.amount === startingBid
                              ? "按起拍价出"
                              : `比起拍价多了 ${row.amount - startingBid}`
                            : `比上一手多了 ${row.incrementFromPrevious}`}
                        </span>
                        {row.status === "leading" ? (
                          <span className="auction-bid-history-tag auction-bid-history-tag--leading">
                            暂时领先
                          </span>
                        ) : (
                          <span className="auction-bid-history-tag">已被超过</span>
                        )}
                      </div>
                    );
                    })
                  )}
                </div>
              </div>

              {!embed && (
              <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {iAmLeading ? (
                  <div className="auction-my-leading-panel">
                    <div className="auction-my-leading-amount-wrap">
                      <span className="auction-my-leading-label">你的出价</span>
                      <span className="auction-mono-amount auction-mono-amount--bid-lg">
                        {currentBid > 0 ? currentBid : "—"}
                      </span>
                    </div>
                    <p className="auction-my-leading-hint">
                      暂时领先，无需再加。等主持人确认成交，或等有人出得比你高。
                    </p>
                  </div>
                ) : (
                  <>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => setAmountText(String(minNext))}
                      >
                        出最低这一手
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => {
                          const base = amountText === "" ? minNext : Math.max(amount, minNext);
                          setAmountText(String(base + 5));
                        }}
                      >
                        再加 5
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => {
                          const base = amountText === "" ? minNext : Math.max(amount, minNext);
                          setAmountText(String(base + 10));
                        }}
                      >
                        再加 10
                      </button>
                    </div>
                    <div className="auction-bid-submit-row" style={{ display: "flex", gap: "0.5rem", alignItems: "stretch" }}>
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        autoComplete="off"
                        className="input auction-bid-amount-input"
                        value={amountText}
                        onChange={(e) =>
                          setAmountText(normalizeDigitsNonNegativeInt(e.target.value))
                        }
                        aria-label="出价金额"
                        style={{
                          flex: "1 1 8rem",
                          minWidth: "7.5rem",
                          textAlign: "center",
                          fontFamily: "var(--font-mono)",
                          fontSize: uiRem(1.15),
                          fontWeight: 800,
                          fontVariantNumeric: "tabular-nums",
                        }}
                      />
                      <button
                        type="button"
                        className="btn btn-purple"
                        aria-disabled={!canSubmit}
                        title={submitBlockReason ?? "出价"}
                        onClick={() => placeBid(amount)}
                        style={{
                          minWidth: "5.5rem",
                          opacity: canSubmit ? 1 : 0.55,
                          cursor: canSubmit ? "pointer" : "not-allowed",
                        }}
                      >
                        {sending ? "…" : "出价"}
                      </button>
                    </div>
                    {submitBlockReason && !iAmLeading && (
                      <div style={{ color: "#fca5a5", fontSize: uiRem(0.75), fontWeight: 700 }}>
                        {submitBlockReason}
                      </div>
                    )}
                  </>
                )}
              </div>
              )}
              {embed && (
                <div
                  style={{
                    marginTop: "auto",
                    padding: "0.75rem 1rem",
                    borderRadius: "0.75rem",
                    background: "rgba(255,255,255,0.04)",
                    color: "var(--color-text-muted)",
                    fontWeight: 600,
                    fontSize: uiRem(0.85),
                    textAlign: "center",
                  }}
                >
                  观战预览 · 仅展示出价记录
                </div>
              )}
            </div>

            {showResultsRail && resultsPanel}
          </div>
        )}

        {upcoming.length > 0 && (
          <div style={{ marginTop: "2rem" }}>
            <div
              style={{
                fontWeight: 800,
                color: "var(--color-text-secondary)",
                marginBottom: "0.85rem",
                fontSize: uiRem(0.9),
              }}
            >
              待拍
            </div>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "1rem",
                justifyContent: "center",
              }}
            >
              {upcoming.map((card) => {
                const def = BUFF_CARD_DEFS[card.id];
                return (
                  <div
                    key={card.id}
                    style={{
                      flex: "0 1 220px",
                      width: "min(100%, 220px)",
                      background: "var(--color-bg-card)",
                      border: "1px solid rgba(168,85,247,0.22)",
                      borderRadius: "1rem",
                      padding: "1rem",
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.65rem",
                      opacity: 0.92,
                    }}
                  >
                    <BuffCardArt cardId={card.id} buffImages={buffImages} />
                    <div
                      style={{
                        fontWeight: 800,
                        fontSize: uiRem(1),
                        color: def?.color || "#d8b4fe",
                        lineHeight: 1.3,
                      }}
                    >
                      {def?.name || card.name}
                    </div>
                    <div
                      style={{
                        fontSize: uiRem(0.82),
                        color: "var(--color-text-secondary)",
                        lineHeight: 1.55,
                      }}
                    >
                      {def?.desc ? <BuffDescText text={def.desc} /> : "—"}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <style>{`
        @media (max-width: 899px) {
          .auction-lot-layout {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
};

const PriceCell: React.FC<{
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
}> = ({ label, value, hint, accent }) => (
  <div
    style={{
      background: "rgba(0,0,0,0.28)",
      borderRadius: "0.75rem",
      padding: "0.55rem 0.7rem",
      border: "1px solid rgba(168,85,247,0.18)",
      minWidth: 0,
    }}
  >
    <div style={{ color: "var(--color-text-muted)", fontSize: uiRem(0.7), marginBottom: "0.2rem" }}>
      {label}
    </div>
    <div
      style={{
        fontWeight: 800,
        fontFamily: accent ? "var(--font-mono)" : undefined,
        color: accent ? "#fbbf24" : "white",
        fontSize: uiRem(1),
        lineHeight: 1.2,
        fontVariantNumeric: accent ? "tabular-nums" : undefined,
        whiteSpace: accent ? "nowrap" : "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}
      title={value}
    >
      {value}
    </div>
    {hint && (
      <div style={{ color: "var(--color-text-muted)", fontSize: uiRem(0.68), marginTop: "0.15rem" }}>
        {hint}
      </div>
    )}
  </div>
);
