import type { CatalogProjectType } from "../config/projectCatalog";
import { PROJECT_CATALOG_BY_ID } from "../config/projectCatalog";
import type { ActiveProject, GameState, Player, SettlementHistoryEntry, SettlementProjectResult } from "../types";
import { buildProjectHelpRows } from "./projectHelpTable";
import { getSettlementHistoryForPlayer } from "./settlementDisplay";

export interface ProjectInvestQuickRow {
  projectId: number;
  name: string;
  type: CatalogProjectType;
  cumulativeEnergy: number;
  investable: boolean;
}

export interface ProjectInvestQuickRef {
  investable: ProjectInvestQuickRow[];
  other: ProjectInvestQuickRow[];
}

type AccRow = {
  name: string;
  type: CatalogProjectType;
  cumulativeEnergy: number;
};

function longTermProgress(me: Player, projectId: number) {
  return me.longTerm[projectId] ?? me.longTerm[String(projectId) as unknown as number];
}

function longTermTotal(me: Player, projectId: number): number {
  const lt = longTermProgress(me, projectId);
  if (lt?.status === "abandoned") return 0;
  return lt?.totalInvested ?? 0;
}

function findProjectOnBoard(game: GameState, projectId: number): ActiveProject | undefined {
  for (const list of [game.activeProjects, game.completedProjects, game.uncompletedProjects]) {
    const found = list.find((p) => p.id === projectId);
    if (found) return found;
  }
  return undefined;
}

function boardInvest(game: GameState, playerId: string, projectId: number): number {
  return findProjectOnBoard(game, projectId)?.investorRecords?.[playerId] ?? 0;
}

function resolveTypeAndName(
  projectId: number,
  res?: SettlementProjectResult,
  project?: ActiveProject
): { name: string; type: CatalogProjectType } {
  const catalog = PROJECT_CATALOG_BY_ID[projectId];
  const name = res?.name ?? project?.name ?? catalog?.name ?? `项目 ${projectId}`;
  const type = (res?.type ?? project?.type ?? catalog?.type ?? "short") as CatalogProjectType;
  return { name, type };
}

function applyHistory(
  history: SettlementHistoryEntry[],
  playerId: string,
  map: Map<number, AccRow>
): void {
  const chronological = [...history].sort((a, b) => a.round - b.round);
  for (const entry of chronological) {
    for (const res of entry.results) {
      const inv = res.playerInvestments[playerId] ?? 0;
      const hasActivity = inv > 0 || (res.playerGains[playerId]?.total ?? 0) !== 0;
      if (!hasActivity) continue;

      const prev = map.get(res.projectId);
      let cumulative: number;
      if (res.type === "long" || res.endGradient) {
        cumulative = Math.max(prev?.cumulativeEnergy ?? 0, inv);
      } else {
        cumulative = (prev?.cumulativeEnergy ?? 0) + inv;
      }
      const { name, type } = resolveTypeAndName(res.projectId, res);
      map.set(res.projectId, {
        name,
        type,
        cumulativeEnergy: cumulative,
      });
    }
  }
}

function alignBoard(game: GameState, me: Player, map: Map<number, AccRow>): void {
  const playerId = me.id;
  const seen = new Set<number>();
  for (const list of [game.activeProjects, game.completedProjects, game.uncompletedProjects]) {
    for (const p of list) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      let cumulative = boardInvest(game, playerId, p.id);
      if (p.type === "long") {
        cumulative = Math.max(cumulative, longTermTotal(me, p.id));
      }
      const prev = map.get(p.id);
      cumulative = Math.max(prev?.cumulativeEnergy ?? 0, cumulative);
      if (cumulative <= 0 && !prev) continue;
      const { name, type } = resolveTypeAndName(p.id, undefined, p);
      map.set(p.id, {
        name: prev?.name ?? name,
        type: prev?.type ?? type,
        cumulativeEnergy: cumulative,
      });
    }
  }
}

function cumulativeForId(
  map: Map<number, AccRow>,
  game: GameState,
  me: Player,
  projectId: number,
  type?: CatalogProjectType
): number {
  const fromMap = map.get(projectId)?.cumulativeEnergy ?? 0;
  let fromBoard = boardInvest(game, me.id, projectId);
  const pType = type ?? map.get(projectId)?.type ?? findProjectOnBoard(game, projectId)?.type;
  if (pType === "long") {
    fromBoard = Math.max(fromBoard, longTermTotal(me, projectId));
  }
  return Math.max(fromMap, fromBoard);
}

export function buildMyProjectInvestQuickRef(game: GameState, me: Player): ProjectInvestQuickRef {
  const map = new Map<number, AccRow>();
  applyHistory(getSettlementHistoryForPlayer(game), me.id, map);
  alignBoard(game, me, map);

  const helpRows = buildProjectHelpRows(game, me);
  const investableIds = new Set(helpRows.map((r) => r.projectId!));

  const investable: ProjectInvestQuickRow[] = helpRows.map((row) => {
    const projectId = row.projectId!;
    const type = (row.projectType ?? "short") as CatalogProjectType;
    return {
      projectId,
      name: row.name ?? resolveTypeAndName(projectId, undefined, findProjectOnBoard(game, projectId)).name,
      type,
      cumulativeEnergy: cumulativeForId(map, game, me, projectId, type),
      investable: true,
    };
  });

  const other: ProjectInvestQuickRow[] = [];
  for (const [projectId, acc] of map) {
    if (investableIds.has(projectId)) continue;
    if (acc.cumulativeEnergy <= 0) continue;
    other.push({
      projectId,
      name: acc.name,
      type: acc.type,
      cumulativeEnergy: acc.cumulativeEnergy,
      investable: false,
    });
  }
  other.sort(
    (a, b) =>
      b.cumulativeEnergy - a.cumulativeEnergy || a.name.localeCompare(b.name, "zh")
  );

  return { investable, other };
}

export function hasAnyInvestQuickRef(ref: ProjectInvestQuickRef): boolean {
  return ref.investable.length > 0 || ref.other.length > 0;
}
