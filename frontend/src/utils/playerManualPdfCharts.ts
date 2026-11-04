import { FATE_SKETCH_PERSONA_COLORS } from "../config/personaConfig";
import { Player } from "../types";
import { PdfProjectParticipationChart } from "./gameOverPdf";
import {
  PDF_PROJECT_BAR_CAPTURE,
  pdfProjectBarChartLayoutPaddingPx,
} from "./pdfLayout";
import {
  normalizePersonaScores,
  PERSONA_PDF_RADAR_LABELS,
  personaPdfRadarValues,
} from "./personaReport";

const PDF_FALLBACK_ACCENT = "#60a5fa";

export function resolveFateSketchAccent(player: Player): string {
  const persona = player.analysisResult?.primaryPersona;
  if (!persona) return PDF_FALLBACK_ACCENT;
  return FATE_SKETCH_PERSONA_COLORS[persona] || PDF_FALLBACK_ACCENT;
}

/** Chart.js + html2canvas 对 rgba 比 8 位 hex 更稳定 */
function parseHexRgb(hex: string): { r: number; g: number; b: number } | null {
  const raw = hex.replace("#", "").trim();
  const six =
    raw.length === 3
      ? raw
          .split("")
          .map((c) => c + c)
          .join("")
      : raw.slice(0, 6);
  if (six.length !== 6) return null;
  const r = parseInt(six.slice(0, 2), 16);
  const g = parseInt(six.slice(2, 4), 16);
  const b = parseInt(six.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return null;
  return { r, g, b };
}

/**
 * 未完成 / 恰好完成 / 投爆：取自 Navigator / Planter / Poet 立绘主题，PDF 矿物调和
 */
export const PDF_PROJECT_BAR_COLORS = [
  "#4f7a9e",
  "#38735b",
  "#b85a42",
] as const;

/** 与 buildPdfProjectParticipationChart 三列顺序一致 */
export const PDF_PROJECT_BAR_AXIS_LABELS = ["未完成", "恰好完成", "投爆"] as const;

export function buildPdfProjectBarChartColors(): [string, string, string] {
  return [
    hexToRgba(PDF_PROJECT_BAR_COLORS[0], 1),
    hexToRgba(PDF_PROJECT_BAR_COLORS[1], 1),
    hexToRgba(PDF_PROJECT_BAR_COLORS[2], 1),
  ];
}

function hexToRgba(hex: string, alpha: number): string {
  const rgb = parseHexRgb(hex);
  if (!rgb) return `rgba(96, 165, 250, ${alpha})`;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

function pdfProjectBarMaxCount(chart: PdfProjectParticipationChart): number {
  return Math.max(
    chart.unfinished.length,
    chart.completed.length,
    chart.exploded.length,
    1
  );
}

function pdfProjectBarYStep(maxCount: number): number {
  if (maxCount <= 4) return 1;
  if (maxCount <= 8) return 2;
  return Math.ceil(maxCount / 4);
}

export function buildPdfChartOptions(accent: string) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: false as const,
    layout: {
      padding: { top: 4, bottom: 4, left: 0, right: 0 },
    },
    plugins: { legend: { display: false } },
    scales: {
      r: {
        min: 0,
        max: 100,
        ticks: { display: false },
        pointLabels: { font: { size: 28 }, color: "black", padding: 6 },
        grid: { color: hexToRgba(accent, 0.33), lineWidth: 2 },
        angleLines: { color: hexToRgba(accent, 0.25) },
      },
    },
  };
}

export const pdfLineChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  animation: false as const,
  plugins: { legend: { display: false } },
  scales: {
    x: {
      ticks: { color: "#374151", font: { size: 22 } },
      grid: { display: false },
    },
    y: {
      ticks: { color: "#374151", font: { size: 22 } },
      grid: { color: "rgba(0,0,0,0.12)" },
    },
  },
};

export function buildPdfLineChartOptions(accent: string) {
  return {
    ...pdfLineChartOptions,
    scales: {
      ...pdfLineChartOptions.scales,
      y: {
        ...pdfLineChartOptions.scales.y,
        grid: { color: hexToRgba(accent, 0.12) },
      },
    },
  };
}

export function buildPdfRadarChartData(player: Player) {
  const accent = resolveFateSketchAccent(player);
  const result = player.analysisResult;
  const normalized = result ? normalizePersonaScores(result.scores) : null;

  return {
    labels: [...PERSONA_PDF_RADAR_LABELS],
    datasets: [
      {
        label: "决策五维",
        data: normalized ? personaPdfRadarValues(normalized) : [0, 0, 0, 0, 0],
        backgroundColor: hexToRgba(accent, 0.12),
        borderColor: accent,
        borderWidth: 2,
        pointBackgroundColor: accent,
        pointRadius: 4,
      },
    ],
  };
}

export function buildPdfLineChartData(player: Player) {
  const accent = resolveFateSketchAccent(player);
  const wealthHistory = player.wealthHistory?.length ? player.wealthHistory : [player.wealth ?? 0];

  return {
    labels: wealthHistory.map((_, i) => `R${i}`),
    datasets: [
      {
        label: "财富曲线",
        data: wealthHistory,
        borderColor: accent,
        backgroundColor: hexToRgba(accent, 0.1),
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.4,
        fill: true,
      },
    ],
  };
}

export function buildPdfProjectBarChartData(chart: PdfProjectParticipationChart) {
  const barColors = buildPdfProjectBarChartColors();
  return {
    labels: [...PDF_PROJECT_BAR_AXIS_LABELS],
    datasets: [
      {
        label: "参与项目",
        data: [
          chart.unfinished.length,
          chart.completed.length,
          chart.exploded.length,
        ],
        backgroundColor: barColors,
        hoverBackgroundColor: barColors,
        borderColor: barColors,
        borderWidth: 0,
        borderRadius: { topLeft: 4, topRight: 4, bottomLeft: 0, bottomRight: 0 },
        barPercentage: 0.55,
        categoryPercentage: 0.72,
      },
    ],
  };
}

export function buildPdfProjectBarChartOptions(chart: PdfProjectParticipationChart) {
  const maxCount = pdfProjectBarMaxCount(chart);
  const stepSize = pdfProjectBarYStep(maxCount);
  const layoutPadding = pdfProjectBarChartLayoutPaddingPx(PDF_PROJECT_BAR_CAPTURE.width);

  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: false as const,
    layout: { padding: layoutPadding },
    plugins: { legend: { display: false } },
    scales: {
      x: {
        ticks: { color: "#111827", font: { size: 34 } },
        grid: { display: false },
      },
      y: {
        beginAtZero: true,
        max: maxCount,
        ticks: {
          stepSize,
          color: "#374151",
          font: { size: 30 },
          precision: 0,
          maxTicksLimit: 6,
        },
        grid: { color: "rgba(0, 0, 0, 0.08)" },
      },
    },
  };
}
