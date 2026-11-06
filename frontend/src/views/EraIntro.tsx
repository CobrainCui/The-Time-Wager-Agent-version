import React from "react";
import { uiRem } from "../utils/typography";
import { GameState, Player } from "../types";
import { socket } from "../socket";
import { getEraDefaultImageSrc, getEraImageDisplay } from "../utils/gameImageDisplay";
import { useImageWithFallback } from "../hooks/useImageWithFallback";
import { ERA_BONUS_LONG, ERA_BONUS_SHORT } from "../config/projectCatalog";

interface Props {
  game: GameState;
  me: Player;
  eraImages?: Record<string, number>;
  /** 主持公共预览：不展示准备与个人财富 */
  embed?: boolean;
}

const ERA_NAMES: Record<number, string> = { 1: "青年", 2: "壮年", 3: "中年", 4: "老年" };
const ERA_ICONS: Record<number, string> = { 1: "🌱", 2: "⚡", 3: "🏔️", 4: "🌙" };

const ERA_GRADIENTS: Record<string, string> = {
  green:  "linear-gradient(135deg, rgba(16,185,129,0.15) 0%, rgba(5,150,105,0.08) 100%)",
  blue:   "linear-gradient(135deg, rgba(59,130,246,0.15) 0%, rgba(37,99,235,0.08) 100%)",
  red:    "linear-gradient(135deg, rgba(239,68,68,0.15) 0%, rgba(185,28,28,0.08) 100%)",
  orange: "linear-gradient(135deg, rgba(249,115,22,0.15) 0%, rgba(194,65,12,0.08) 100%)",
  yellow: "linear-gradient(135deg, rgba(168,85,247,0.15) 0%, rgba(109,40,217,0.08) 100%)",
};

const ERA_COLORS: Record<string, string> = {
  green: "#10b981", blue: "#3b82f6", red: "#ef4444", orange: "#f97316", yellow: "#a855f7",
};

export const EraIntro: React.FC<Props> = ({ game, me, eraImages = {}, embed = false }) => {
  const card = game.currentEraCard;
  const eraColor = card ? (ERA_COLORS[card.themeColor] || "#60a5fa") : "#60a5fa";
  const eraGradient = card ? (ERA_GRADIENTS[card.themeColor] || ERA_GRADIENTS.blue) : ERA_GRADIENTS.blue;
  const eraNum = game.currentEra;
  const readyCount = game.readyPlayers?.length ?? 0;
  const eraResolved = card ? getEraImageDisplay(card.era, eraImages) : null;
  const eraFallback =
    eraResolved?.source === "custom" && card ? getEraDefaultImageSrc(card.era) : null;
  const eraImg = useImageWithFallback(eraResolved?.src ?? "", eraFallback);

  return (
    <div
      className="page-center flex-col era-intro-shell"
      style={{
        background: `
          radial-gradient(ellipse at 50% 0%, ${eraColor}22 0%, transparent 60%),
          #070b14
        `,
        padding: "1rem 1.25rem",
        textAlign: "center",
      }}
    >
      <div className="era-intro-inner">
        {/* 时代标识 */}
        <div className="era-intro-header animate-slideDown" style={{ flexShrink: 0 }}>
          <div style={{ fontSize: "2rem", lineHeight: 1, marginBottom: "0.25rem", animation: "float 3s ease-in-out infinite" }}>
            {ERA_ICONS[eraNum] || "⏳"}
          </div>
          <div style={{ fontSize: uiRem(0.75), fontWeight: 700, letterSpacing: "0.25em", textTransform: "uppercase", color: "var(--color-text-muted)", marginBottom: "0.25rem" }}>
            第 {eraNum} 时代 · 第 {game.roundInEra} 轮
          </div>
          <div
            style={{
              fontSize: "2.125rem",
              fontWeight: 900,
              background: `linear-gradient(135deg, ${eraColor}, white)`,
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
              lineHeight: 1.15,
            }}
          >
            {ERA_NAMES[eraNum] || "新时代"}
          </div>
        </div>

        {/* 时代卡展示（竖版，仅图片） */}
        {card && (
          <div
            className="era-intro-card-stack animate-scaleIn"
            style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start", width: "100%" }}
          >
            <div
              className="era-intro-card"
              style={{
                background: eraGradient,
                border: `1px solid ${eraColor}44`,
                borderRadius: "1.25rem",
                padding: "0.75rem",
                boxShadow: `0 0 40px ${eraColor}22`,
              }}
            >
              <div
                className="era-intro-card-img-wrap"
                style={{
                  borderRadius: "0.875rem",
                  overflow: "hidden",
                  boxShadow: `0 10px 30px rgba(0,0,0,0.5)`,
                  border: `2px solid ${eraColor}66`,
                }}
              >
                {eraImg.showPlaceholder ? (
                  <div
                    className="era-intro-card-fallback"
                    style={{
                      width: "100%",
                      height: "100%",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "0.5rem",
                      background: `linear-gradient(160deg, ${eraColor}33, rgba(0,0,0,0.5))`,
                      color: "var(--color-text-muted)",
                      padding: "1rem",
                    }}
                  >
                    <span style={{ fontSize: uiRem(1.25), fontWeight: 800, color: eraColor }}>{card.era}</span>
                    <span style={{ fontSize: uiRem(0.75) }}>时代卡面暂不可用</span>
                  </div>
                ) : (
                  <img
                    src={eraImg.src}
                    alt={card.era}
                    style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
                    onError={eraImg.onError}
                  />
                )}
              </div>
            </div>
            <p
              className="era-intro-bonus"
              style={{
                marginTop: "0.875rem",
                fontSize: uiRem(1.05),
                fontWeight: 600,
                color: "var(--color-text-secondary)",
                lineHeight: 1.35,
              }}
            >
              <span style={{ display: "block", marginBottom: "0.35rem" }}>
                📢 时代加成：主题契合、历史总投入第 1 名
              </span>
              <span style={{ display: "block", fontWeight: 500, fontSize: uiRem(0.95) }}>
                本时代 <span style={{ color: eraColor, fontWeight: 700 }}>【{card.era}】</span>
                短期恰好满额 +{ERA_BONUS_SHORT}；长期满额或超上限 +{ERA_BONUS_LONG}
              </span>
              <span style={{ display: "block", fontWeight: 500, fontSize: uiRem(0.9), color: "var(--color-text-muted)", marginTop: "0.25rem" }}>
                短期爆掉与风险项目无时代加成
              </span>
            </p>
          </div>
        )}

        {/* 底栏：状态 + 准备 */}
        <div className="era-intro-footer" style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5rem" }}>
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", justifyContent: "center" }}>
            <div
              style={{
                background: "rgba(52,211,153,0.1)",
                border: "1px solid rgba(52,211,153,0.25)",
                borderRadius: "9999px",
                padding: "0.4rem 1rem",
                fontFamily: "var(--font-mono)",
                fontWeight: 700,
                fontSize: uiRem(0.85),
                color: "#34d399",
              }}
            >
              本轮精力 {me.energy}
            </div>
            {!embed && (
              <div
                style={{
                  background: "rgba(251,191,36,0.1)",
                  border: "1px solid rgba(251,191,36,0.25)",
                  borderRadius: "9999px",
                  padding: "0.4rem 1rem",
                  fontFamily: "var(--font-mono)",
                  fontWeight: 700,
                  fontSize: uiRem(0.85),
                  color: "#fbbf24",
                }}
              >
                💰 财富 {me.wealth}
              </div>
            )}
          </div>

          {embed ? (
            <div style={{ color: "var(--color-text-muted)", fontWeight: 600, fontSize: uiRem(0.9) }}>
              观战预览
            </div>
          ) : me.ready ? (
            <div
              className="animate-pulse"
              style={{
                color: "#4ade80",
                fontWeight: 700,
                fontSize: uiRem(1),
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
              }}
            >
              <span style={{ width: "0.625rem", height: "0.625rem", borderRadius: "50%", background: "#4ade80", display: "inline-block" }} />
              已准备，等待其他玩家...
            </div>
          ) : (
            <button
              onClick={() => socket.emit("playerReady")}
              className="btn btn-lg"
              style={{
                background: `linear-gradient(135deg, ${eraColor}, ${eraColor}aa)`,
                color: "white",
                padding: "0.75rem 2.5rem",
                boxShadow: `0 8px 30px ${eraColor}44`,
                border: "none",
              }}
            >
              我准备好了 ✓
            </button>
          )}

          <div style={{ fontSize: uiRem(0.75), color: "var(--color-text-muted)" }}>
            已准备 {readyCount} / {game.players.length} 人
          </div>
        </div>
      </div>
    </div>
  );
};
