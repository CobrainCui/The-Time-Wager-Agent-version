import React, { useEffect } from "react";
import { uiRem } from "../utils/typography";
import { PersonaAnalysis } from "../types";
import {
  NormalizedPersonaScores,
  PERSONA_RADAR_LABELS,
  personaRadarValues,
  scalePersonaBarFillWidth,
  secondaryFateSketches,
  sessionDimensionPercentiles,
} from "../utils/personaReport";
import { Player } from "../types";
import { getPersonaDefaultImageSrc, getPersonaImageDisplay, getPersonaImageSlug } from "../utils/gameImageDisplay";
import { FATE_SKETCH_PERSONA_COLORS, getFateSketchPlayerDesc } from "../config/personaConfig";
import { PersonaPortraitImage } from "./PersonaPortraitImage";

const DIMENSION_KEYS: (keyof NormalizedPersonaScores)[] = [
  "longTermism",
  "shortTermism",
  "riskTaking",
  "ruleIntervention",
  "socialConnection",
  "resourceConversion",
];

const DIMENSION_LABEL: Record<keyof NormalizedPersonaScores, string> = {
  longTermism: PERSONA_RADAR_LABELS[0],
  shortTermism: PERSONA_RADAR_LABELS[1],
  riskTaking: PERSONA_RADAR_LABELS[2],
  ruleIntervention: PERSONA_RADAR_LABELS[3],
  socialConnection: PERSONA_RADAR_LABELS[4],
  resourceConversion: PERSONA_RADAR_LABELS[5],
};

function DimensionBar({
  label,
  value,
  dimensionKey,
  percentile,
  accent,
}: {
  label: string;
  value: number;
  dimensionKey: keyof NormalizedPersonaScores;
  percentile?: number;
  accent: string;
}) {
  const v = Math.round(Math.min(100, Math.max(0, value)));
  const barWidth = scalePersonaBarFillWidth(dimensionKey, value);
  return (
    <div style={{ marginBottom: "0.65rem" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: "0.5rem",
          marginBottom: "0.25rem",
        }}
      >
        <span style={{ fontSize: uiRem(0.78), color: "var(--color-text-secondary)" }}>
          {label}
        </span>
        <span style={{ fontSize: uiRem(0.72), color: "var(--color-text-muted)", fontFamily: "var(--font-mono)" }}>
          {v}
          {percentile != null && (
            <span style={{ marginLeft: "0.35rem" }}>· 高于本场 {percentile}%</span>
          )}
        </span>
      </div>
      <div
        style={{
          height: "6px",
          borderRadius: "999px",
          background: "rgba(255,255,255,0.06)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${barWidth}%`,
            height: "100%",
            borderRadius: "999px",
            background: accent,
            transition: "width 0.4s ease",
          }}
        />
      </div>
    </div>
  );
}

export const PersonaPrimaryHero: React.FC<{
  personaName: string;
  serverDesc?: string;
  personaImages: Record<string, number>;
}> = ({ personaName, serverDesc, personaImages }) => {
  const color = FATE_SKETCH_PERSONA_COLORS[personaName] || "#60a5fa";
  const display = getPersonaImageDisplay(personaName, personaImages);
  const personaFallbackSrc = getPersonaDefaultImageSrc(getPersonaImageSlug(personaName));
  const desc = getFateSketchPlayerDesc(personaName, serverDesc);

  // 挂载时再预热一次（含自定义）；命名阶段已在 GameRoom 预热过默认图
  useEffect(() => {
    const primary = new Image();
    primary.src = display.src;
    if (display.source === "custom") {
      const fallback = new Image();
      fallback.src = personaFallbackSrc;
    }
  }, [display.src, display.source, personaFallbackSrc]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div
        style={{
          width: "100%",
          maxWidth: "14rem",
          margin: "0 auto",
          aspectRatio: "2/3",
          borderRadius: "0.875rem",
          overflow: "hidden",
          boxShadow: `0 8px 32px ${color}15`,
        }}
      >
        <PersonaPortraitImage
          src={display.src}
          alt={personaName}
          fallbackSrc={display.source === "custom" ? personaFallbackSrc : undefined}
          borderColor={`${color}44`}
        />
      </div>
      <div style={{ fontSize: "clamp(1.5rem, 5vw, 1.75rem)", fontWeight: 900, color, lineHeight: 1.2, textAlign: "center" }}>
        {personaName}
      </div>
      {desc && (
        <div style={{ fontSize: uiRem(0.9), color: "var(--color-text-secondary)", lineHeight: 1.65 }}>
          {desc}
        </div>
      )}
    </div>
  );
};

export const PersonaBehaviorProfile: React.FC<{
  scores: NormalizedPersonaScores;
  game: { players: Player[] };
  meId: string;
  accent: string;
}> = ({ scores, game, meId, accent }) => {
  const percentiles = sessionDimensionPercentiles(game.players, meId);
  return (
    <div style={{ marginTop: "0.5rem" }}>
      <div
        style={{
          fontSize: uiRem(0.68),
          fontWeight: 700,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "var(--color-text-muted)",
          marginBottom: "0.65rem",
        }}
      >
        本局行为倾向
      </div>
      {DIMENSION_KEYS.map((key) => (
        <DimensionBar
          key={key}
          label={DIMENSION_LABEL[key]}
          value={scores[key]}
          dimensionKey={key}
          percentile={percentiles?.[key]}
          accent={accent}
        />
      ))}
    </div>
  );
};

export const PersonaSecondaryHints: React.FC<{
  result: PersonaAnalysis;
  onOpenPersona: (name: string) => void;
}> = ({ result, onOpenPersona }) => {
  const hints = secondaryFateSketches(result);
  if (!hints.length) return null;
  return (
    <p style={{ fontSize: uiRem(0.8), color: "var(--color-text-muted)", margin: "0.5rem 0 0", lineHeight: 1.55 }}>
      本局行为还带有一点：
      {hints.map((h, i) => (
        <span key={h.name}>
          {i > 0 ? "、" : ""}
          <button
            type="button"
            onClick={() => onOpenPersona(h.name)}
            aria-label={`查看${h.name}的介绍与立绘`}
            style={{
              background: "none",
              border: "none",
              padding: 0,
              font: "inherit",
              fontWeight: 700,
              color: "var(--color-text-secondary)",
              cursor: "pointer",
              textDecoration: "underline",
              textUnderlineOffset: "2px",
            }}
          >
            {h.name}
          </button>
        </span>
      ))}
      的色彩。
    </p>
  );
};

export function buildGameOverRadarDataset(
  scores: NormalizedPersonaScores,
  personaColor: string
) {
  return {
    labels: [...PERSONA_RADAR_LABELS],
    datasets: [
      {
        label: "行为六维",
        data: personaRadarValues(scores),
        backgroundColor: `${personaColor}30`,
        borderColor: personaColor,
        borderWidth: 3,
        pointBackgroundColor: personaColor,
        pointRadius: 5,
      },
    ],
  };
}
