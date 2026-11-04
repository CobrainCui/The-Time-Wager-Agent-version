import { Chart } from "chart.js";
import { GameState, Player } from "../types";
import { PROJECT_CATALOG_BY_ID } from "../config/projectCatalog";
import {
  isSuccessfulProjectParticipationOutcome,
  playerParticipated,
  resolveProjectStatus,
} from "./projectHelpTable";

function collectParticipationProjectIds(game: GameState): number[] {
  const ids = new Set<number>();
  for (const p of game.activeProjects) ids.add(p.id);
  for (const p of game.completedProjects ?? []) ids.add(p.id);
  for (const p of game.uncompletedProjects ?? []) ids.add(p.id);
  for (const r of game.lastSettlement?.results ?? []) ids.add(r.projectId);
  return [...ids];
}

function projectDisplayName(game: GameState, projectId: number): string {
  const active = game.activeProjects.find((p) => p.id === projectId);
  const catalog = PROJECT_CATALOG_BY_ID[projectId];
  const completed = game.completedProjects?.find((p) => p.id === projectId);
  const uncompleted = game.uncompletedProjects?.find((p) => p.id === projectId);
  return (
    active?.name ??
    catalog?.name ??
    completed?.name ??
    uncompleted?.name ??
    `#${projectId}`
  );
}

export interface PdfProjectParticipationChart {
  unfinished: string[];
  completed: string[];
  exploded: string[];
}

/** 遗憾遗产页柱形图：玩家参与项目的三种结局 */
export function buildPdfProjectParticipationChart(
  game: GameState,
  me: Player
): PdfProjectParticipationChart {
  const unfinished: string[] = [];
  const completed: string[] = [];
  const exploded: string[] = [];

  for (const projectId of collectParticipationProjectIds(game)) {
    if (!playerParticipated(game, me, projectId)) continue;
    const status = resolveProjectStatus(game, me, projectId);
    const name = projectDisplayName(game, projectId);
    if (status.id === "exploded") exploded.push(name);
    else if (isSuccessfulProjectParticipationOutcome(status.id)) completed.push(name);
    else unfinished.push(name);
  }

  const sortZh = (a: string, b: string) => a.localeCompare(b, "zh");
  unfinished.sort(sortZh);
  completed.sort(sortZh);
  exploded.sort(sortZh);

  return { unfinished, completed, exploded };
}

function communityLongProjectProgress(
  game: GameState,
  projectId: number,
  maxEnergy: number
): number {
  let communityProgress = 0;
  game.players.forEach((p) => {
    const lt = p.longTerm[projectId];
    if (!lt || lt.status === "abandoned") return;
    communityProgress += lt.totalInvested || 0;
  });
  if (maxEnergy <= 0) return 0;
  return Math.min(100, (communityProgress / maxEnergy) * 100);
}

/** 遗憾遗产页：未完成长期项目 + 已放弃的长期项目 */
export function buildPdfUnfinishedProjects(
  game: GameState,
  me: Player
): { name: string; progress: number }[] {
  const projectsById = new Map(
    [...game.activeProjects, ...game.uncompletedProjects, ...game.completedProjects].map((p) => [
      p.id,
      p,
    ])
  );
  const completedProjectIds = new Set(game.completedProjects.map((p) => p.id));

  const rows: { name: string; progress: number }[] = [];

  for (const [projectIdStr, lt] of Object.entries(me.longTerm || {})) {
    const projectId = Number(projectIdStr);
    if (!Number.isFinite(projectId)) continue;

    if (lt.status === "completed") continue;
    if (lt.status === "active") {
      if (lt.totalInvested <= 0) continue;
      if (completedProjectIds.has(projectId)) continue;
    } else if (lt.status !== "abandoned") {
      continue;
    }

    const proj = projectsById.get(projectId);
    if (!proj || proj.type !== "long") continue;

    const progress = communityLongProjectProgress(game, projectId, proj.maxEnergy);
    const name =
      lt.status === "abandoned" ? `${proj.name}（已放弃）` : proj.name;

    rows.push({ name, progress });
  }

  rows.sort((a, b) => b.progress - a.progress);
  return rows;
}

/** 等待 Chart.js 完成布局与绘制，避免 html2canvas 截到空白图 */
export async function waitForChartPaint(): Promise<void> {
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
  await new Promise((resolve) => setTimeout(resolve, 32));
}

const DEFAULT_PDF_CHART_WAIT_MS = 20_000;

/** 等待离屏 Chart.js 挂载 canvas（玩家端与管理端导出共用） */
export async function waitForPdfChartCanvases(
  chartElementIds: string[],
  options?: { timeoutMs?: number; onProgress?: (message: string) => void }
): Promise<boolean> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_PDF_CHART_WAIT_MS;
  const started = Date.now();
  options?.onProgress?.("正在等待图表渲染…");
  while (Date.now() - started < timeoutMs) {
    const allReady = chartElementIds.every((id) =>
      document.getElementById(id)?.querySelector("canvas")
    );
    if (allReady) {
      await waitForChartPaint();
      return true;
    }
    await waitForChartPaint();
  }
  return false;
}

/** 导出前强制 Chart.js 按离屏容器尺寸重绘 */
export function prepareChartsForPdfCapture(elementIds: string[]): void {
  for (const id of elementIds) {
    const canvas = document.getElementById(id)?.querySelector("canvas");
    if (!canvas) continue;
    const chart = Chart.getChart(canvas);
    chart?.resize();
    chart?.update("none");
  }
}

export function assertPdfChartElementsReady(...chartElementIds: string[]): string | null {
  const labels: Record<string, string> = {
    "pdf-radar-chart": "雷达图",
    "pdf-line-chart": "财富曲线",
    "pdf-project-bar-chart": "项目柱形图",
    "admin-pdf-radar-chart": "雷达图",
    "admin-pdf-line-chart": "财富曲线",
    "admin-pdf-project-bar-chart": "项目柱形图",
  };
  const missing: string[] = [];
  for (const id of chartElementIds) {
    if (!document.getElementById(id)) {
      missing.push(labels[id] ?? id);
    }
  }
  if (missing.length === 0) return null;
  return `图表尚未就绪（${missing.join("、")}），请稍候再试`;
}

export const PDF_RADAR_CHART_ID = "pdf-radar-chart";
export const PDF_LINE_CHART_ID = "pdf-line-chart";
export const PDF_PROJECT_BAR_CHART_ID = "pdf-project-bar-chart";
