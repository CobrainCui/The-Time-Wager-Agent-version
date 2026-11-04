import React, { useEffect, useRef, useState } from "react";
import { uiRem } from "../utils/typography";

interface Props {
  src: string;
  alt: string;
  /** 主图加载失败时回退（如自定义上传 404 → 默认卡面） */
  fallbackSrc?: string;
  onClose: () => void;
}

export const ImageLightbox: React.FC<Props> = ({ src, alt, fallbackSrc, onClose }) => {
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const [imgSrc, setImgSrc] = useState(src);
  const triedFallback = useRef(false);

  useEffect(() => {
    setImgSrc(src);
    triedFallback.current = false;
  }, [src]);

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    closeBtnRef.current?.focus();
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={`预览：${alt}`}
      onClick={onClose}
      style={{ cursor: "zoom-out", padding: "1.5rem" }}
    >
      <button
        ref={closeBtnRef}
        type="button"
        className="btn btn-ghost btn-sm"
        aria-label="关闭预览"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        style={{
          position: "fixed",
          top: "1rem",
          right: "1rem",
          zIndex: 101,
          background: "rgba(0,0,0,0.5)",
          border: "1px solid rgba(255,255,255,0.2)",
        }}
      >
        关闭 ✕
      </button>
      <img
        src={imgSrc}
        alt={alt}
        onClick={(e) => e.stopPropagation()}
        onError={() => {
          if (!triedFallback.current && fallbackSrc && fallbackSrc !== imgSrc) {
            triedFallback.current = true;
            setImgSrc(fallbackSrc);
          }
        }}
        style={{
          maxWidth: "min(90vw, 1200px)",
          maxHeight: "90vh",
          objectFit: "contain",
          borderRadius: "0.75rem",
          boxShadow: "0 24px 80px rgba(0,0,0,0.6)",
        }}
      />
      <p
        style={{
          position: "fixed",
          bottom: "1rem",
          left: "50%",
          transform: "translateX(-50%)",
          color: "var(--color-text-muted)",
          fontSize: uiRem(0.75),
          margin: 0,
          pointerEvents: "none",
        }}
      >
        Esc 或点击背景关闭
      </p>
    </div>
  );
};
