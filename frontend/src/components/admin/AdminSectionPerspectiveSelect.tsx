import React from "react";
import { uiRem } from "../../utils/typography";

type PlayerOption = { id: string; name: string };

type Props = {
  label: string;
  value: string;
  onChange: (playerId: string) => void;
  players: PlayerOption[];
  overviewLabel?: string;
};

export const AdminSectionPerspectiveSelect: React.FC<Props> = ({
  label,
  value,
  onChange,
  players,
  overviewLabel = "总览（全桌）",
}) => (
  <label
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: "0.4rem",
      fontSize: uiRem(0.75),
      color: "var(--color-text-muted)",
      flexWrap: "wrap",
    }}
  >
    <span style={{ whiteSpace: "nowrap" }}>{label}</span>
    <select
      className="input"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        fontSize: uiRem(0.75),
        padding: "0.25rem 0.5rem",
        minWidth: "7.5rem",
        maxWidth: "11rem",
      }}
      aria-label={label}
    >
      <option value="">{overviewLabel}</option>
      {players.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  </label>
);
