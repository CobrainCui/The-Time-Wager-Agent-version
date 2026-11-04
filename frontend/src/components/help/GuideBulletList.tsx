import React from "react";
import { uiRem } from "../../utils/typography";
import { BuffDescText } from "../../utils/buffDescEmphasis";

export const GuideBulletList: React.FC<{ items: string[]; fontSize?: string }> = ({
  items,
  fontSize = uiRem(0.82),
}) => (
  <ul className="player-guide-bullets" style={{ fontSize }}>
    {items.map((text, i) => (
      <li key={i}>
        <BuffDescText text={text} />
      </li>
    ))}
  </ul>
);
