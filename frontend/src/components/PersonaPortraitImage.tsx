import React from "react";
import { uiRem } from "../utils/typography";
import { useImageWithFallback } from "../hooks/useImageWithFallback";

interface Props {
  src: string;
  alt: string;
  /** 自定义立绘加载失败时回退（通常为 /images/personas 默认图） */
  fallbackSrc?: string;
  borderColor?: string;
  className?: string;
  style?: React.CSSProperties;
}

export const PersonaPortraitImage: React.FC<Props> = ({
  src,
  alt,
  fallbackSrc,
  borderColor = "rgba(255,255,255,0.12)",
  style,
}) => {
  const img = useImageWithFallback(src, fallbackSrc);

  if (img.showPlaceholder) {
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "rgba(255,255,255,0.04)",
          color: "var(--color-text-muted)",
          fontSize: uiRem(0.75),
          textAlign: "center",
          padding: "0.75rem",
          ...style,
        }}
      >
        立绘加载失败
      </div>
    );
  }

  return (
    <img
      src={img.src}
      alt={alt}
      style={{
        width: "100%",
        height: "100%",
        objectFit: "cover",
        display: "block",
        border: `1px solid ${borderColor}`,
        ...style,
      }}
      onError={img.onError}
    />
  );
};
