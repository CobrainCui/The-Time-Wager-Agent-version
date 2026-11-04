import React, { useId, useState } from "react";
import { uiRem } from "../../utils/typography";
import { BUFF_SIDEBAR_BRIEF } from "../../config/playerHelpReference";
import type { BuffHelpEntry } from "../../config/playerHelpReference";
import { BuffDescText } from "../../utils/buffDescEmphasis";

export const BuffHelpCardBody: React.FC<{ entry: BuffHelpEntry }> = ({ entry }) => {
  const [expanded, setExpanded] = useState(false);
  const panelId = useId();
  const briefs = BUFF_SIDEBAR_BRIEF[entry.cardId] ?? [];
  const hasBrief = briefs.length > 0;

  return (
    <div style={{ fontSize: uiRem(0.82) }}>
      {hasBrief && (
        <ul className="player-guide-buff-card-brief">
          {briefs.map((line, i) => (
            <li key={`${entry.cardId}-${i}`}>
              <BuffDescText text={line} />
            </li>
          ))}
        </ul>
      )}
      {hasBrief ? (
        <>
          <button
            type="button"
            className="btn btn-ghost btn-sm player-guide-buff-card-toggle"
            aria-expanded={expanded}
            aria-controls={panelId}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? "收起完整说明" : "展开完整说明"}
          </button>
          {expanded && (
            <p
              id={panelId}
              style={{
                margin: "0.35rem 0 0",
                color: "var(--color-text-secondary)",
                lineHeight: 1.45,
              }}
            >
              <BuffDescText text={entry.desc} />
            </p>
          )}
        </>
      ) : (
        <p
          style={{
            margin: 0,
            color: "var(--color-text-secondary)",
            lineHeight: 1.45,
          }}
        >
          <BuffDescText text={entry.desc} />
        </p>
      )}
    </div>
  );
};
