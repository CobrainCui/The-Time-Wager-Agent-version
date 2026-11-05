import React from "react";
import { uiRem } from "../../utils/typography";
import { TUTORIAL_ENERGY_INTRO_LINE } from "../../config/tutorialProjectTypes";
import {
  GUIDE_CHAT_ROWS,
  GUIDE_FLOW_PHASES,
  GUIDE_INVEST_TIMER_ROWS,
  GUIDE_RESOURCE_ROWS,
} from "../../config/playerHelpReference";
import { EnergyScheduleMiniTable } from "./EnergyScheduleMiniTable";
import { GuideMiniTable } from "./GuideMiniTable";
import { GuideBulletList } from "./GuideBulletList";
import { GavelIcon } from "../icons/GavelIcon";

const lineFontDefault = uiRem(0.82);

export const GuideResourcesBlock: React.FC<{ lineFont?: string }> = ({ lineFont = lineFontDefault }) => (
  <div className="player-guide-block" style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
    <p style={{ margin: 0, color: "var(--color-text-secondary)", fontSize: lineFont, lineHeight: 1.5 }}>
      {TUTORIAL_ENERGY_INTRO_LINE}
    </p>
    <EnergyScheduleMiniTable lineFont={lineFont} />
    <GuideMiniTable
      caption="财富与赛制"
      lineFont={lineFont}
      columns={[
        { key: "label", label: "资源" },
        { key: "brief", label: "要点" },
      ]}
      rows={GUIDE_RESOURCE_ROWS.map((r) => ({ label: r.label, brief: r.brief }))}
    />
  </div>
);

export const GuideFlowBlock: React.FC<{ lineFont?: string; overview: string }> = ({
  lineFont = lineFontDefault,
  overview,
}) => (
  <div className="player-guide-block" style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
    <p
      style={{
        margin: 0,
        padding: "0.55rem 0.75rem",
        borderRadius: "0.65rem",
        background: "rgba(96,165,250,0.08)",
        border: "1px solid rgba(96,165,250,0.22)",
        color: "#93c5fd",
        fontSize: uiRem(0.9),
        fontWeight: 700,
        lineHeight: 1.45,
      }}
    >
      {overview}
    </p>
    {GUIDE_FLOW_PHASES.map((phase) => (
      <section key={phase.id}>
        <h4
          style={{
            margin: "0 0 0.35rem",
            fontSize: uiRem(0.9),
            fontWeight: 800,
            color: "white",
            display: "flex",
            alignItems: "center",
            gap: "0.35rem",
          }}
        >
          {phase.gavelIcon ? <GavelIcon size={16} decorative style={{ color: "#c084fc" }} /> : null}
          {phase.title}
        </h4>
        <GuideBulletList items={phase.bullets} fontSize={lineFont} />
        {phase.showInvestTimer && (
          <div style={{ marginTop: "0.5rem" }}>
            <GuideMiniTable
              caption="投资阶段倒计时"
              lineFont={lineFont}
              columns={[
                { key: "label", label: "轮次" },
                { key: "duration", label: "时限", align: "right" },
              ]}
              rows={GUIDE_INVEST_TIMER_ROWS.map((r) => ({ label: r.label, duration: r.duration }))}
              minWidth="14rem"
            />
          </div>
        )}
      </section>
    ))}
  </div>
);

export const GuideChatBlock: React.FC<{ lineFont?: string }> = ({ lineFont = lineFontDefault }) => (
  <GuideMiniTable
    caption="私信、转账与群聊"
    lineFont={lineFont}
    minWidth="22rem"
    columns={[
      { key: "feature", label: "功能" },
      { key: "how", label: "怎么做" },
      { key: "note", label: "注意" },
    ]}
    rows={GUIDE_CHAT_ROWS.map((r) => ({ feature: r.feature, how: r.how, note: r.note }))}
  />
);
