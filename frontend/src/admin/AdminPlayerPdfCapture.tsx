import React, { useEffect, useRef } from "react";
import {
  Chart as ChartJS,
  RadialLinearScale,
  PointElement,
  LineElement,
  BarElement,
  Filler,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  Title,
} from "chart.js";
import { Radar, Line, Bar } from "react-chartjs-2";
import type { GeneratePdfResult } from "../utils/pdfGenerator";
import {
  buildPdfProjectParticipationChart,
  buildPdfUnfinishedProjects,
} from "../utils/gameOverPdf";
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
import { AdminPdfCaptureJob } from "./adminPdfSnapshot";

ChartJS.register(
  RadialLinearScale,
  PointElement,
  LineElement,
  BarElement,
  Filler,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  Title,
);

export const ADMIN_PDF_RADAR_CHART_ID = "admin-pdf-radar-chart";
export const ADMIN_PDF_LINE_CHART_ID = "admin-pdf-line-chart";
export const ADMIN_PDF_PROJECT_BAR_CHART_ID = "admin-pdf-project-bar-chart";

interface Props {
  job: AdminPdfCaptureJob | null;
  onComplete: (result: GeneratePdfResult) => void;
}

export const AdminPlayerPdfCapture: React.FC<Props> = ({ job, onComplete }) => {
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const capturePlayer = job?.player ?? null;
  const jobIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!job?.player.analysisResult) return;

    const jobKey = `${job.player.id}:${job.game.roomId}:${job.game.globalRound ?? 0}`;
    jobIdRef.current = jobKey;

    const { game, player: capturePlayer } = job;
    let cancelled = false;

    (async () => {
      const { generateCollectionManual } = await import("../utils/pdfGenerator");
      const result = await generateCollectionManual({
        playerName: capturePlayer.name,
        persona: capturePlayer.analysisResult!.primaryPersona,
        remainingEnergy: capturePlayer.energy,
        unfinishedProjects: buildPdfUnfinishedProjects(game, capturePlayer),
        projectParticipationChart: buildPdfProjectParticipationChart(game, capturePlayer),
        radarChartElementId: ADMIN_PDF_RADAR_CHART_ID,
        lineChartElementId: ADMIN_PDF_LINE_CHART_ID,
        projectBarChartElementId: ADMIN_PDF_PROJECT_BAR_CHART_ID,
      });

      if (!cancelled && jobIdRef.current === jobKey) {
        onCompleteRef.current(result);
      }
    })().catch(() => {
      if (!cancelled && jobIdRef.current === jobKey) {
        onCompleteRef.current({ ok: false, message: "生成 PDF 失败" });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [job]);

  if (!capturePlayer?.analysisResult) return null;

  const pdfRadarData = buildPdfRadarChartData(capturePlayer);
  const pdfLineData = buildPdfLineChartData(capturePlayer);
  const pdfAccent = resolveFateSketchAccent(capturePlayer);
  const pdfProjectParticipation = buildPdfProjectParticipationChart(job!.game, capturePlayer);
  const pdfProjectBarData = buildPdfProjectBarChartData(pdfProjectParticipation);

  const containerWidth = Math.max(
    PDF_RADAR_CAPTURE.width,
    PDF_LINE_CAPTURE.width,
    PDF_PROJECT_BAR_CAPTURE.width
  );
  const containerHeight =
    PDF_RADAR_CAPTURE.height + PDF_LINE_CAPTURE.height + PDF_PROJECT_BAR_CAPTURE.height;

  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        left: 0,
        top: 0,
        transform: "translateX(calc(-100% - 100vw))",
        width: `${containerWidth}px`,
        height: `${containerHeight}px`,
        opacity: 1,
        pointerEvents: "none",
        zIndex: -1,
        overflow: "hidden",
      }}
    >
      <div
        id={ADMIN_PDF_RADAR_CHART_ID}
        style={{
          width: `${PDF_RADAR_CAPTURE.width}px`,
          height: `${PDF_RADAR_CAPTURE.height}px`,
          background: "#ffffff",
        }}
      >
        <Radar
          key={pdfAccent}
          data={pdfRadarData}
          options={buildPdfChartOptions(pdfAccent)}
        />
      </div>
      <div
        id={ADMIN_PDF_LINE_CHART_ID}
        style={{
          width: `${PDF_LINE_CAPTURE.width}px`,
          height: `${PDF_LINE_CAPTURE.height}px`,
          background: "#ffffff",
        }}
      >
        <Line
          key={pdfAccent}
          data={pdfLineData}
          options={buildPdfLineChartOptions(pdfAccent)}
        />
      </div>
      <div
        id={ADMIN_PDF_PROJECT_BAR_CHART_ID}
        style={{
          width: `${PDF_PROJECT_BAR_CAPTURE.width}px`,
          height: `${PDF_PROJECT_BAR_CAPTURE.height}px`,
          background: "transparent",
        }}
      >
        <Bar
          key={pdfProjectBarData.datasets[0].data.join("-")}
          data={pdfProjectBarData}
          options={buildPdfProjectBarChartOptions(pdfProjectParticipation)}
        />
      </div>
    </div>
  );
};
