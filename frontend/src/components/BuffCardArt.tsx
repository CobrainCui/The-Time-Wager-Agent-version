import React, { useEffect } from "react";
import { BUFF_CARD_DEFS } from "../config/buffCards";
import { uiRem } from "../utils/typography";
import { getBuffDefaultImageSrc, getBuffImageDisplay } from "../utils/gameImageDisplay";
import { useImageWithFallback } from "../hooks/useImageWithFallback";

interface Props {
  cardId: string;
  buffImages?: Record<string, number>;
  compact?: boolean;
  onImageBroken?: () => void;
}

export const BuffCardArt: React.FC<Props> = ({ cardId, buffImages = {}, compact, onImageBroken }) => {
  const def = BUFF_CARD_DEFS[cardId] || { name: cardId, desc: "", icon: "🃏", color: "#a855f7" };
  const resolved = getBuffImageDisplay(cardId, buffImages);
  const fallback = resolved.source === "custom" ? getBuffDefaultImageSrc(cardId) : null;
  const img = useImageWithFallback(resolved.src, fallback);

  useEffect(() => {
    if (img.showPlaceholder) onImageBroken?.();
  }, [img.showPlaceholder, onImageBroken]);

  return (
    <div
      style={{
        width: "100%",
        aspectRatio: "3 / 4",
        borderRadius: compact ? "0.625rem" : "0.875rem",
        overflow: "hidden",
        background: "rgba(0,0,0,0.35)",
        border: `1px solid ${def.color}44`,
        display: "flex",
        flexDirection: "column",
        position: "relative",
      }}
    >
      {!img.showPlaceholder ? (
        <img
          src={img.src}
          alt={def.name}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
          onError={img.onError}
        />
      ) : (
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.5rem",
            padding: "0.75rem",
            color: "var(--color-text-muted)",
          }}
        >
          <span style={{ fontSize: compact ? "2rem" : "2.75rem" }}>{def.icon}</span>
          <span style={{ fontSize: uiRem(0.7), textAlign: "center" }}>暂无卡面</span>
        </div>
      )}
    </div>
  );
};
