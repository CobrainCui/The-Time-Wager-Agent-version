import React from "react";
import { uiRem } from "../../utils/typography";
import { TUTORIAL_ENERGY_SCHEDULE_ROWS } from "../../config/tutorialProjectTypes";

export interface EnergyScheduleMiniTableProps {
  lineFont: string;
  fitViewport?: boolean;
}

export const EnergyScheduleMiniTable: React.FC<EnergyScheduleMiniTableProps> = ({
  lineFont,
  fitViewport = false,
}) => (
  <div className="tutorial-energy-schedule-mini" style={{ padding: fitViewport ? "0.35rem 0 0.5rem" : "0.5rem 0 0.65rem" }}>
    <table
      className="tutorial-energy-schedule-mini__table"
      style={{
        width: "100%",
        maxWidth: "20rem",
        borderCollapse: "collapse",
        fontSize: lineFont,
      }}
    >
      <caption className="sr-only">各时代每轮精力</caption>
      <thead>
        <tr style={{ color: "var(--color-text-muted)", fontSize: uiRem(0.78) }}>
          <th scope="col" style={{ textAlign: "left", padding: "0.3rem 0.5rem", fontWeight: 700 }}>
            阶段
          </th>
          <th scope="col" style={{ textAlign: "right", padding: "0.3rem 0.5rem", fontWeight: 700 }}>
            精力
          </th>
        </tr>
      </thead>
      <tbody>
        {TUTORIAL_ENERGY_SCHEDULE_ROWS.map((row) => (
          <tr key={row.label} style={{ borderTop: "1px solid rgba(255, 255, 255, 0.06)" }}>
            <td style={{ padding: "0.35rem 0.5rem", color: "var(--color-text-secondary)" }}>{row.label}</td>
            <td style={{ padding: "0.35rem 0.5rem", textAlign: "right", color: "var(--color-text-secondary)" }}>
              {row.energy}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);
