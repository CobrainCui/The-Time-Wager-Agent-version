import React from "react";
import { uiRem } from "../../utils/typography";

export interface GuideMiniTableColumn {
  key: string;
  label: string;
  align?: "left" | "right" | "center";
}

export interface GuideMiniTableProps {
  caption: string;
  columns: GuideMiniTableColumn[];
  rows: Record<string, string>[];
  lineFont: string;
  minWidth?: string;
}

const thStyle = (align: GuideMiniTableColumn["align"]): React.CSSProperties => ({
  textAlign: align ?? "left",
  padding: "0.3rem 0.5rem",
  fontWeight: 700,
  fontSize: uiRem(0.78),
  color: "var(--color-text-muted)",
});

const tdStyle = (align: GuideMiniTableColumn["align"]): React.CSSProperties => ({
  padding: "0.35rem 0.5rem",
  textAlign: align ?? "left",
  color: "var(--color-text-secondary)",
  lineHeight: 1.4,
  verticalAlign: "top",
});

export const GuideMiniTable: React.FC<GuideMiniTableProps> = ({
  caption,
  columns,
  rows,
  lineFont,
  minWidth = "16rem",
}) => (
  <div className="player-guide-mini-table-wrap">
    <table
      className="player-guide-mini-table"
      style={{ width: "100%", minWidth, borderCollapse: "collapse", fontSize: lineFont }}
    >
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr>
          {columns.map((col) => (
            <th key={col.key} scope="col" style={thStyle(col.align)}>
              {col.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i} style={{ borderTop: "1px solid rgba(255, 255, 255, 0.06)" }}>
            {columns.map((col) => (
              <td key={col.key} style={tdStyle(col.align)}>
                {row[col.key]}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);
