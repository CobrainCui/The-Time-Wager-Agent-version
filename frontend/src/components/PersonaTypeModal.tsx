import React, { useEffect, useState } from "react";
import { uiRem } from "../utils/typography";
import {
  FATE_SKETCH_CONFIG,
  FATE_SKETCH_PERSONA_COLORS,
  getFateSketchPlayerDesc,
} from "../config/personaConfig";
import { getPersonaDefaultImageSrc, getPersonaImageDisplay, getPersonaImageSlug } from "../utils/gameImageDisplay";
import { ImageLightbox } from "./ImageLightbox";
import { PersonaPortraitImage } from "./PersonaPortraitImage";

interface Props {
  personaName: string;
  personaImages: Record<string, number>;
  onClose: () => void;
}

export const PersonaTypeModal: React.FC<Props> = ({ personaName, personaImages, onClose }) => {
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const config = FATE_SKETCH_CONFIG[personaName];
  const color = FATE_SKETCH_PERSONA_COLORS[personaName] || "#60a5fa";
  const display = getPersonaImageDisplay(personaName, personaImages);
  const personaFallbackSrc = getPersonaDefaultImageSrc(getPersonaImageSlug(personaName));

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  if (!config) return null;

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="persona-modal-title"
      onClick={onClose}
    >
      <div
        className="modal-box animate-bounce-in"
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "relative",
          maxWidth: "22rem",
          width: "100%",
          border: `1px solid ${color}55`,
          boxShadow: `0 0 40px ${color}18`,
        }}
      >
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={onClose}
          style={{ position: "absolute", top: "0.75rem", right: "0.75rem" }}
          aria-label="关闭"
        >
          ✕
        </button>
        <button
          type="button"
          onClick={() => setLightboxSrc(display.src)}
          style={{
            width: "100%",
            aspectRatio: "2/3",
            borderRadius: "0.75rem",
            overflow: "hidden",
            border: `1px solid ${color}33`,
            padding: 0,
            cursor: "zoom-in",
            marginBottom: "1rem",
            background: "rgba(0,0,0,0.35)",
          }}
        >
          <PersonaPortraitImage
            src={display.src}
            alt={personaName}
            fallbackSrc={display.source === "custom" ? personaFallbackSrc : undefined}
            borderColor={`${color}33`}
          />
        </button>
        <h2
          id="persona-modal-title"
          style={{ fontSize: uiRem(1.15), fontWeight: 800, color, margin: "0 0 0.65rem", lineHeight: 1.25 }}
        >
          {config.name}
        </h2>
        <p style={{ fontSize: uiRem(0.88), color: "var(--color-text-secondary)", lineHeight: 1.6, margin: 0 }}>
          {getFateSketchPlayerDesc(personaName)}
        </p>
      </div>
      {lightboxSrc && (
        <ImageLightbox
          src={lightboxSrc}
          alt={personaName}
          fallbackSrc={display.source === "custom" ? personaFallbackSrc : undefined}
          onClose={() => setLightboxSrc(null)}
        />
      )}
    </div>
  );
};
