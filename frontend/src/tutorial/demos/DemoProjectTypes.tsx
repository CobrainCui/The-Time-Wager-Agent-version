import React, { useMemo, useState } from "react";
import { uiRem } from "../../utils/typography";
import { ProjectCard } from "../../components/ProjectCard";
import { PlayerResourceStatusBar } from "../../components/PlayerResourceStatusBar";
import { ProjectDetailModal } from "../../components/ProjectDetailModal";
import { PlayerGameHelp, PlayerSidebarPanel } from "../../components/PlayerGameHelp";
import { TUTORIAL_PROJECT_TYPES_PLAY_ID } from "../../config/playerHelpReference";
import { ActiveProject } from "../../types";
import {
  TUTORIAL_RISK_PROJECT,
  createTutorialPlayer,
  createTutorialProjectTableGame,
  TUTORIAL_DEMO_PROJECTS,
} from "../tutorialMock";

/** 与教程文案一致：试玩总精力池 */
const DEMO_ENERGY_POOL = 20;

export const DemoProjectTypes: React.FC = () => {
  const [investments, setInvestments] = useState<Record<number, number>>({});
  const [detailProjectId, setDetailProjectId] = useState<number | null>(null);
  const [sidebarPanel, setSidebarPanel] = useState<PlayerSidebarPanel>("projects");
  const riskPool = TUTORIAL_RISK_PROJECT.accumulatedInvested;

  const meBase = useMemo(
    () =>
      createTutorialPlayer({
        energy: DEMO_ENERGY_POOL,
        longTerm: {
          [TUTORIAL_DEMO_PROJECTS[1].id]: {
            projectId: TUTORIAL_DEMO_PROJECTS[1].id,
            totalInvested: 6,
            status: "active",
          },
        },
      }),
    []
  );

  const me = useMemo(
    () => ({
      ...meBase,
      investmentDraft: investments,
    }),
    [meBase, investments]
  );

  const game = useMemo(() => createTutorialProjectTableGame({ players: [me] }), [me]);

  const detailProject = useMemo((): ActiveProject | null => {
    if (detailProjectId == null) return null;
    return TUTORIAL_DEMO_PROJECTS.find((p) => p.id === detailProjectId) ?? null;
  }, [detailProjectId]);
  const allocated = Object.values(investments).reduce((a, b) => a + b, 0);
  const remainingEnergy = me.energy - allocated;

  const riskInvest = investments[TUTORIAL_RISK_PROJECT.id] || 0;
  const riskTotal = riskPool + riskInvest;
  const riskOver = riskTotal > TUTORIAL_RISK_PROJECT.maxEnergy;

  const handleChange = (id: number, val: number) => {
    const next = Math.max(0, Math.floor(Number(val) || 0));
    setInvestments((prev) => {
      const otherSum = Object.entries(prev).reduce(
        (sum, [pid, amt]) => (Number(pid) === id ? sum : sum + (Number(amt) || 0)),
        0
      );
      const capped = Math.min(next, DEMO_ENERGY_POOL - otherSum);
      return { ...prev, [id]: capped };
    });
  };

  return (
    <div id={TUTORIAL_PROJECT_TYPES_PLAY_ID} className="tutorial-project-types-play">
      <PlayerGameHelp
        panel={sidebarPanel}
        onPanelChange={setSidebarPanel}
        game={game}
        me={me}
        embedInTutorial
      />
      <div className="tutorial-project-types-play__main">
        <ProjectDetailModal
          project={detailProject}
          playerCount={6}
          onClose={() => setDetailProjectId(null)}
        />
        <PlayerResourceStatusBar
          remainingEnergy={remainingEnergy}
          energyTotal={me.energy}
          wealth={me.wealth}
        />
        <div
          className="tutorial-project-types-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            gap: "1rem",
            alignItems: "stretch",
          }}
        >
          {TUTORIAL_DEMO_PROJECTS.map((proj) => (
            <div key={proj.id} style={{ minWidth: 0, display: "flex" }}>
              <ProjectCard
                project={proj}
                myInvest={investments[proj.id] || 0}
                onChange={handleChange}
                disabled={false}
                remainingEnergy={remainingEnergy}
                me={me}
                balanceHeights
                onOpenDetail={setDetailProjectId}
              />
            </div>
          ))}
        </div>

        {riskInvest > 0 && (
          <div
            style={{
              marginTop: "1rem",
              padding: "0.75rem",
              borderRadius: "0.75rem",
              fontSize: uiRem(0.85),
              border: `1px solid ${riskOver ? "rgba(239,68,68,0.4)" : "rgba(59,130,246,0.25)"}`,
              background: riskOver ? "rgba(239,68,68,0.1)" : "rgba(59,130,246,0.08)",
              color: riskOver ? "#fca5a5" : "var(--color-text-secondary)",
            }}
          >
            风险项目试算：全场已有 {riskPool} + 你投入 {riskInvest} = {riskTotal} / 上限{" "}
            {TUTORIAL_RISK_PROJECT.maxEnergy}
            {riskOver ? " — 超过上限将触发倒扣历史收益！" : " — 尚未爆线。"}
          </div>
        )}
      </div>
    </div>
  );
};
