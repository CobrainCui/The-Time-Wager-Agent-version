import React, { useState } from "react";
import { uiRem } from "../utils/typography";
import { GameState, Player } from "../types";
import { FATE_SKETCH_PERSONA_COLORS } from "../config/personaConfig";
import {
  Chart as ChartJS, RadialLinearScale, PointElement, LineElement, BarElement,
  Filler, Tooltip, Legend, CategoryScale, LinearScale, Title
} from "chart.js";
import { Radar, Line, Bar } from "react-chartjs-2";
import {
  buildPdfProjectParticipationChart,
  buildPdfUnfinishedProjects,
  PDF_LINE_CHART_ID,
  PDF_PROJECT_BAR_CHART_ID,
  PDF_RADAR_CHART_ID,
} from "../utils/gameOverPdf";
import { CommunityLeaderboard } from "../components/CommunityLeaderboard";
import {
  PDF_LINE_CAPTURE,
  PDF_PROJECT_BAR_CAPTURE,
  PDF_RADAR_CAPTURE,
} from "../utils/pdfLayout";
import {
  buildPdfChartOptions,
  buildPdfLineChartData,
  buildPdfLineChartOptions,
  buildPdfProjectBarChartData,
  buildPdfProjectBarChartOptions,
  buildPdfRadarChartData,
  resolveFateSketchAccent,
} from "../utils/playerManualPdfCharts";
import { normalizePersonaScores } from "../utils/personaReport";
import {
  buildGameOverRadarDataset,
  PersonaBehaviorProfile,
  PersonaPrimaryHero,
  PersonaSecondaryHints,
} from "../components/PersonaReportSections";
import { PersonaTypeModal } from "../components/PersonaTypeModal";

ChartJS.register(RadialLinearScale, PointElement, LineElement, BarElement, Filler, Tooltip, Legend, CategoryScale, LinearScale, Title);

interface Props {
  game: GameState;
  me?: Player;
  personaImages?: Record<string, number>;
  /** 主持嵌入：只展示公开排行，不展示个人人格块 */
  embed?: boolean;
}

export const GameOver: React.FC<Props> = ({ game, me, personaImages = {}, embed = false }) => {
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [pdfProgress, setPdfProgress] = useState<string | null>(null);
  const [pdfFeedback, setPdfFeedback] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [personaModalName, setPersonaModalName] = useState<string | null>(null);

  const sortedPlayers = [...game.players].sort((a, b) => b.wealth - a.wealth);
  const totalWealth = game.players.reduce((s, p) => s + p.wealth, 0);
  const myResult = me?.analysisResult;
  const personaColor = me ? resolveFateSketchAccent(me) : "#60a5fa";
  const normalizedScores = myResult
    ? normalizePersonaScores(myResult.scores)
    : null;

  const wealthHistory = me?.wealthHistory?.length ? me.wealthHistory : [me?.wealth ?? 0];

  const radarData =
    me && normalizedScores
      ? buildGameOverRadarDataset(normalizedScores, personaColor)
      : null;

  const lineData = {
    labels: wealthHistory.map((_, i) => `R${i}`),
    datasets: [
      {
        label: "财富曲线",
        data: wealthHistory,
        borderColor: personaColor,
        backgroundColor: `${personaColor}1a`,
        borderWidth: 3,
        pointRadius: 0,
        tension: 0.4,
        fill: true,
      },
    ],
  };

  const pdfRadarData = me ? buildPdfRadarChartData(me) : null;
  const pdfLineData = me ? buildPdfLineChartData(me) : null;
  const pdfProjectParticipation = me
    ? buildPdfProjectParticipationChart(game, me)
    : null;
  const pdfProjectBarData = pdfProjectParticipation
    ? buildPdfProjectBarChartData(pdfProjectParticipation)
    : null;

  const rankBadge = (i: number) => {
    if (i === 0) return { bg: "#f59e0b", color: "#000", text: "🥇" };
    if (i === 1) return { bg: "#94a3b8", color: "#000", text: "🥈" };
    if (i === 2) return { bg: "#cd7c32", color: "#fff", text: "🥉" };
    return { bg: "#1f2937", color: "#6b7280", text: `${i + 1}` };
  };

  const handleExportPdf = async () => {
    if (!me || !myResult || isGeneratingPdf) return;
    setPdfFeedback(null);
    setPdfProgress("正在准备 PDF…");
    setIsGeneratingPdf(true);
    try {
      const { generateCollectionManual } = await import("../utils/pdfGenerator");
      const result = await generateCollectionManual({
        playerName: me.name,
        persona: myResult.primaryPersona,
        remainingEnergy: me.energy,
        unfinishedProjects: buildPdfUnfinishedProjects(game, me),
        projectParticipationChart: buildPdfProjectParticipationChart(game, me),
        radarChartElementId: PDF_RADAR_CHART_ID,
        lineChartElementId: PDF_LINE_CHART_ID,
        projectBarChartElementId: PDF_PROJECT_BAR_CHART_ID,
        onProgress: setPdfProgress,
      });
      if (result.ok) {
        const warn =
          result.warnings?.length ? `（${result.warnings.join("；")}）` : "";
        setPdfFeedback({ type: "ok", text: `已下载：${result.fileName}${warn}` });
      } else {
        setPdfFeedback({ type: "err", text: result.message });
      }
    } catch {
      setPdfFeedback({ type: "err", text: "生成 PDF 失败，请稍后重试" });
    } finally {
      setIsGeneratingPdf(false);
      setPdfProgress(null);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#070b14", padding: "2rem 1rem", overflowY: "auto" }}>
      <div style={{ position: "fixed", inset: 0, pointerEvents: "none", background: "radial-gradient(ellipse at 30% 20%, rgba(245,158,11,0.06) 0%, transparent 50%), radial-gradient(ellipse at 70% 80%, rgba(168,85,247,0.06) 0%, transparent 50%)" }} />

      <div style={{ maxWidth: "800px", margin: "0 auto", position: "relative" }}>
        <div style={{ textAlign: "center", marginBottom: "3rem" }} className="animate-slideDown">
          <h1
            style={{
              fontSize: "clamp(2.5rem, 10vw, 4.5rem)",
              fontWeight: 900,
              background: "linear-gradient(135deg, #f59e0b, #ef4444, #a855f7)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
              lineHeight: 1,
              marginBottom: "0.75rem",
              letterSpacing: "-0.03em",
            }}
          >
            GAME OVER
          </h1>
          <h2 style={{ fontSize: uiRem(1.15), fontWeight: 700, color: "white" }}>
            社区：{game.communityName || "未命名"}
          </h2>
        </div>

        <div
          style={{
            background: "rgba(245,158,11,0.06)",
            border: "1px solid rgba(245,158,11,0.25)",
            borderRadius: "1.25rem",
            padding: "2rem",
            textAlign: "center",
            marginBottom: "2rem",
            boxShadow: "0 0 40px rgba(245,158,11,0.1)",
          }}
        >
          <div style={{ fontSize: uiRem(0.75), fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.2em", color: "var(--color-text-muted)", marginBottom: "0.75rem" }}>
            本社区总财富
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "clamp(2.5rem, 12vw, 4rem)", fontWeight: 900, color: "#fbbf24", lineHeight: 1 }}>
            {totalWealth}
          </div>
        </div>

        <CommunityLeaderboard
          entries={game.globalLeaderboard ?? []}
          highlightName={game.communityName}
        />

        <div
          style={{
            background: "var(--color-bg-card)",
            border: "1px solid var(--color-border)",
            borderRadius: "1.25rem",
            overflow: "hidden",
            marginBottom: "2rem",
          }}
        >
          <div style={{ padding: "1rem 1.5rem", borderBottom: "1px solid var(--color-border)" }}>
            <h3 style={{ fontWeight: 700, color: "white", fontSize: uiRem(1) }}>🏆 个人排行榜</h3>
          </div>
          {sortedPlayers.map((p, i) => {
            const badge = rankBadge(i);
            const isMe = p.id === me?.id;
            const pColor = p.analysisResult
              ? (FATE_SKETCH_PERSONA_COLORS[p.analysisResult.primaryPersona] || "#60a5fa")
              : "#60a5fa";
            return (
              <div
                key={p.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "0.75rem",
                  padding: "1rem 1.5rem",
                  borderBottom: "1px solid rgba(255,255,255,0.04)",
                  background: isMe ? "rgba(245,158,11,0.04)" : "transparent",
                  flexWrap: "wrap",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap", minWidth: 0 }}>
                  <span style={{ width: "2rem", height: "2rem", borderRadius: "50%", background: badge.bg, color: badge.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: uiRem(0.85), fontWeight: 800, flexShrink: 0 }}>
                    {badge.text}
                  </span>
                  <span style={{ fontWeight: isMe ? 700 : 500, fontSize: uiRem(1), color: isMe ? "#fbbf24" : "white" }}>
                    {p.name}
                  </span>
                  {p.analysisResult && (
                    <span style={{ fontSize: uiRem(0.68), fontWeight: 700, padding: "0.2rem 0.55rem", borderRadius: "9999px", background: `${pColor}20`, color: pColor, border: `1px solid ${pColor}40` }}>
                      {p.analysisResult.primaryPersona}
                    </span>
                  )}
                </div>
                <span style={{ fontFamily: "var(--font-mono)", fontWeight: 800, fontSize: uiRem(1.25), color: isMe ? "#fbbf24" : "var(--color-text-secondary)", marginLeft: "auto" }}>
                  {p.wealth}
                </span>
              </div>
            );
          })}
        </div>

        {!embed && me && myResult && (
          <div style={{ marginBottom: "2rem" }}>
            <div style={{ textAlign: "center", marginBottom: "1.25rem" }}>
              <p style={{ fontSize: uiRem(0.8), color: "var(--color-text-muted)", margin: 0 }}>
                根据本局行为判断的风格类型
              </p>
            </div>

            <div
              style={{
                background: "var(--color-bg-card)",
                border: `1px solid ${personaColor}44`,
                borderRadius: "1.25rem",
                padding: "1.5rem",
                boxShadow: `0 0 24px ${personaColor}10`,
                display: "flex",
                flexDirection: "column",
                gap: "0.75rem",
                marginBottom: "1rem",
              }}
            >
              <PersonaPrimaryHero
                personaName={myResult.primaryPersona}
                serverDesc={myResult.primaryPersonaDesc}
                personaImages={personaImages}
              />
              <PersonaSecondaryHints
                result={myResult}
                onOpenPersona={(name) => setPersonaModalName(name)}
              />
              {normalizedScores && me && (
                <PersonaBehaviorProfile
                  scores={normalizedScores}
                  game={game}
                  meId={me.id}
                  accent={personaColor}
                />
              )}
              <div style={{ height: "240px", marginTop: "0.75rem" }} aria-label="行为六维雷达图">
                <Radar
                  data={radarData!}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                      r: {
                        min: 0, max: 100,
                        ticks: { display: false },
                        pointLabels: { font: { size: 10 }, color: "#94a3b8" },
                        grid: { color: "rgba(255,255,255,0.06)" },
                        angleLines: { color: "rgba(255,255,255,0.06)" },
                      },
                    },
                  }}
                />
              </div>
            </div>

            <div style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border)", borderRadius: "1.25rem", padding: "1.25rem", marginBottom: "1rem" }}>
              <div style={{ fontSize: uiRem(0.7), fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--color-text-muted)", marginBottom: "0.75rem" }}>
                📈 财富曲线
              </div>
              <div style={{ height: "160px" }} aria-label="本局财富变化曲线">
                <Line
                  data={lineData}
                  options={{
                    responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                      x: { ticks: { color: "#6b7280", font: { size: 10 } }, grid: { display: false } },
                      y: { ticks: { color: "#6b7280", font: { size: 10 } }, grid: { color: "rgba(255,255,255,0.04)" } },
                    },
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {!embed && !myResult && me && (
          <p style={{ textAlign: "center", color: "var(--color-text-muted)", fontSize: uiRem(0.85), marginBottom: "1.5rem" }}>
            人格分析数据尚未就绪，请稍候刷新或联系管理员。
          </p>
        )}

        {!embed && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.75rem" }}>
          <div style={{ display: "flex", justifyContent: "center", gap: "1rem", flexWrap: "wrap", width: "100%" }}>

            {myResult && me && (
              <button
                onClick={handleExportPdf}
                className="btn btn-primary"
                type="button"
                disabled={isGeneratingPdf}
                aria-busy={isGeneratingPdf}
                style={{
                  background: "linear-gradient(135deg, #f59e0b, #d97706)",
                  border: "none",
                  color: "white",
                  minWidth: "12rem",
                }}
              >
                {isGeneratingPdf ? pdfProgress || "正在生成 PDF…" : "📄 导出《人生决策手册》"}
              </button>
            )}
          </div>

          {pdfFeedback && (
            <p
              role="status"
              style={{
                margin: 0,
                fontSize: uiRem(0.82),
                color: pdfFeedback.type === "ok" ? "#6ee7b7" : "#fca5a5",
                textAlign: "center",
                maxWidth: "28rem",
              }}
            >
              {pdfFeedback.text}
            </p>
          )}
        </div>
        )}
      </div>

      {!embed && me && myResult && pdfRadarData && pdfLineData && pdfProjectBarData && (
      <div
        id="pdf-charts-hidden-container"
        aria-hidden="true"
        style={{
          position: "fixed",
          left: 0,
          top: 0,
          transform: "translateX(calc(-100% - 100vw))",
          width: `${Math.max(PDF_RADAR_CAPTURE.width, PDF_LINE_CAPTURE.width, PDF_PROJECT_BAR_CAPTURE.width)}px`,
          height: `${PDF_RADAR_CAPTURE.height + PDF_LINE_CAPTURE.height + PDF_PROJECT_BAR_CAPTURE.height}px`,
          opacity: 1,
          pointerEvents: "none",
          zIndex: -1,
          overflow: "hidden",
        }}
      >
        <div
          id={PDF_RADAR_CHART_ID}
          style={{
            width: `${PDF_RADAR_CAPTURE.width}px`,
            height: `${PDF_RADAR_CAPTURE.height}px`,
            background: "#ffffff",
          }}
        >
          <Radar
            key={personaColor}
            data={pdfRadarData}
            options={buildPdfChartOptions(personaColor)}
          />
        </div>
        <div
          id={PDF_LINE_CHART_ID}
          style={{
            width: `${PDF_LINE_CAPTURE.width}px`,
            height: `${PDF_LINE_CAPTURE.height}px`,
            background: "#ffffff",
          }}
        >
          <Line
            key={personaColor}
            data={pdfLineData}
            options={buildPdfLineChartOptions(personaColor)}
          />
        </div>
        <div
          id={PDF_PROJECT_BAR_CHART_ID}
          style={{
            width: `${PDF_PROJECT_BAR_CAPTURE.width}px`,
            height: `${PDF_PROJECT_BAR_CAPTURE.height}px`,
            background: "transparent",
          }}
        >
          <Bar
            key={pdfProjectBarData.datasets[0].data.join("-")}
            data={pdfProjectBarData}
            options={buildPdfProjectBarChartOptions(pdfProjectParticipation!)}
          />
        </div>
      </div>
      )}

      {personaModalName && (
        <PersonaTypeModal
          personaName={personaModalName}
          personaImages={personaImages}
          onClose={() => setPersonaModalName(null)}
        />
      )}
    </div>
  );
};
