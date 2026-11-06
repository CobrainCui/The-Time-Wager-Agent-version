import React, { useMemo, useState } from "react";
import { uiRem } from "../../utils/typography";
import { ProjectCard } from "../../components/ProjectCard";
import { ProjectDetailModal } from "../../components/ProjectDetailModal";
import { ERA_INTRO_ICONS, ERA_THEME_COLORS } from "../../config/eraIntro";
import { ERA_BONUS_LONG, ERA_BONUS_SHORT } from "../../config/projectCatalog";
import { TUTORIAL_ERA_OPTIONS, TUTORIAL_ERA_SAMPLE_PROJECT, createTutorialPlayer } from "../tutorialMock";

const DEMO_ERA = TUTORIAL_ERA_OPTIONS.find((e) => e.era === "气候") ?? TUTORIAL_ERA_OPTIONS[0];
const DEMO_ERA_NUM = 1;

const sidePanelStyle: React.CSSProperties = {
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  gap: "0.75rem",
  padding: "0.9rem 1rem",
  borderRadius: "0.75rem",
  border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(0,0,0,0.2)",
  fontSize: uiRem(0.95),
  lineHeight: 1.55,
  color: "var(--color-text-secondary)",
  textAlign: "left",
};

export const DemoEraTheme: React.FC = () => {
  const [invest, setInvest] = useState(0);
  const [detailOpen, setDetailOpen] = useState(false);
  const me = useMemo(() => createTutorialPlayer({ energy: 10 }), []);
  const sampleProject = { ...TUTORIAL_ERA_SAMPLE_PROJECT, era: "气候" as const };
  const eraAccent = ERA_THEME_COLORS[DEMO_ERA.themeColor] ?? "#10b981";

  return (
    <div className="tutorial-era-theme-demo">
      <div className="tutorial-era-theme-demo__row">
        <aside className="tutorial-era-theme-demo__side" style={sidePanelStyle}>
          <div style={{ fontWeight: 800, color: eraAccent, fontSize: uiRem(1.1) }}>
            {ERA_INTRO_ICONS[DEMO_ERA_NUM]} {DEMO_ERA.name}
          </div>
          <div style={{ color: "var(--color-text-muted)", fontSize: uiRem(0.85) }}>
            第 {DEMO_ERA_NUM} 时代 · 主题【{DEMO_ERA.era}】
          </div>
          <p style={{ margin: 0 }}>{DEMO_ERA.description}</p>
          <p style={{ margin: 0, color: "#93c5fd" }}>
            与主题契合的项目卡上会显示「🔥 时代UP」黄标（见本试玩区中间项目卡）。
          </p>
        </aside>

        <div className="tutorial-era-theme-demo__card">
          <ProjectCard
            project={sampleProject}
            myInvest={invest}
            onChange={(_, v) => setInvest(v)}
            disabled={false}
            remainingEnergy={me.energy - invest}
            eraTheme={DEMO_ERA.era}
            me={me}
            onOpenDetail={() => setDetailOpen(true)}
          />
        </div>

        <aside className="tutorial-era-theme-demo__side" style={sidePanelStyle}>
          <div style={{ fontWeight: 800, color: "#fbbf24", fontSize: uiRem(1.1) }}>时代加成</div>
          <p style={{ margin: 0 }}>短期：恰好满额，该项目总投入第一 → +{ERA_BONUS_SHORT} 💰</p>
          <p style={{ margin: 0 }}>长期：满额或超填，该项目总投入第一 → +{ERA_BONUS_LONG} 💰</p>
          <p style={{ margin: 0, color: "var(--color-text-muted)" }}>
            短期投资失败（爆掉）、风险项目：无时代加成。并列第 1 则均分。
          </p>
        </aside>
      </div>

      <ProjectDetailModal
        project={detailOpen ? sampleProject : null}
        eraTheme={DEMO_ERA.era}
        playerCount={6}
        onClose={() => setDetailOpen(false)}
      />
    </div>
  );
};
