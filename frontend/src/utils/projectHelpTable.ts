import { ActiveProject, GameState, Player, SettlementProjectResult } from "../types";
import {
  PROJECT_CATALOG_BY_ID,
  TYPE_LABEL,
  CatalogProjectType,
  ProjectCatalogEntry,
} from "../config/projectCatalog";

export type ProjectHelpStatusId =
  | "exploded"
  | "completed"
  | "long_exact_complete"
  | "long_over_complete"
  | "withdrawn"
  | "abandoned"
  | "committed_long"
  | "investable"
  | "next_round"
  | "unpaid_long"
  | "in_progress"
  | "participated"
  | "none";

export const LONG_COMPLETE_CHIP_COLOR = "#34d399";

export interface ProjectHelpStatus {
  id: ProjectHelpStatusId;
  chip: string;
  tooltip: string;
  chipColor?: string;
}

const STATUS_META: Record<
  ProjectHelpStatusId,
  { chip: string; tooltip: string; chipColor?: string }
> = {
  exploded: { chip: "💥 爆", tooltip: "投资超过上限，项目爆掉并离场（短期没有时代加成）" },
  completed: { chip: "🎉 已完成", tooltip: "已正常完成并离场（短期为恰好满额；可含时代加成）" },
  long_exact_complete: {
    chip: "恰好完成",
    tooltip: "长期项目已满额完成并离场",
    chipColor: LONG_COMPLETE_CHIP_COLOR,
  },
  long_over_complete: {
    chip: "超额完成",
    tooltip: "长期项目超过上限仍正常结算（不是短期那种超额投资惩罚）",
    chipColor: LONG_COMPLETE_CHIP_COLOR,
  },
  withdrawn: {
    chip: "🗑️ 已撤场",
    tooltip: "累计投入仍为 0 且连续 2 轮无人投资，项目离场",
  },
  abandoned: {
    chip: "🚫 已放弃",
    tooltip: "已放弃结算：累计投入的每 1 点精力返还 1 点财富，并退出该项目完成时的排名与时代加成",
  },
  committed_long: {
    chip: "📌 已参与投资",
    tooltip: "参与投资后，每轮至少投入 3 点精力；不足则放弃结算：每 1 点精力返还 1 点财富，并退出完成排名",
  },
  investable: { chip: "✅ 可投", tooltip: "当前阶段可对本项目分配精力" },
  next_round: {
    chip: "⏭ 下轮可投",
    tooltip: "本页暂不可分配精力，下一轮投资阶段仍可投",
  },
  unpaid_long: { chip: "🔒 已锁定", tooltip: "本轮投资已提交，等待结算" },
  in_progress: { chip: "⏳ 进行中", tooltip: "项目仍在牌桌，暂不可投或未跟投" },
  participated: { chip: "🙋 已参与", tooltip: "你曾参与，当前无更高优先级状态" },
  none: { chip: "—", tooltip: "你未参与该项目" },
};

function findActive(game: GameState, projectId: number): ActiveProject | undefined {
  return game.activeProjects.find((p) => p.id === projectId);
}

function findCompleted(game: GameState, projectId: number): ActiveProject | undefined {
  return game.completedProjects?.find((p) => p.id === projectId);
}

function findUncompleted(game: GameState, projectId: number): ActiveProject | undefined {
  return game.uncompletedProjects?.find((p) => p.id === projectId);
}

function lastResult(game: GameState, projectId: number) {
  return game.lastSettlement?.results.find((r) => r.projectId === projectId);
}

function isLongTypeAtProject(game: GameState, projectId: number): boolean {
  const r = lastResult(game, projectId);
  if (r?.type === "long") return true;
  const off = findCompleted(game, projectId) ?? findUncompleted(game, projectId);
  if (off?.type === "long") return true;
  return PROJECT_CATALOG_BY_ID[projectId]?.type === "long";
}

function offTableShortOrRiskBurst(proj: ActiveProject | undefined): boolean {
  if (!proj || proj.type === "long") return false;
  const total = proj.accumulatedInvested ?? 0;
  const max = proj.maxEnergy;
  return total > max;
}

function isOffTableExploded(game: GameState, projectId: number): boolean {
  const off =
    findCompleted(game, projectId) ?? findUncompleted(game, projectId);
  if (off) {
    if (off.type === "long") return false;
    return offTableShortOrRiskBurst(off);
  }
  if (isLongTypeAtProject(game, projectId)) return false;
  const r = lastResult(game, projectId);
  return r?.isExploded === true;
}

/** 长期项目已离场完成：满额 vs 超填（依据最近结算或 completedProjects 累计） */
export function longOffTableCompletion(
  game: GameState,
  projectId: number
): "exact" | "over" | null {
  const r = lastResult(game, projectId);
  if (r?.type === "long" && r.isCompleted) {
    return r.isExploded ? "over" : "exact";
  }
  const off = findCompleted(game, projectId);
  if (off?.type === "long") {
    const total = off.accumulatedInvested ?? 0;
    const max = off.maxEnergy;
    if (total < max) return null;
    return total > max ? "over" : "exact";
  }
  return null;
}

function longFinishedStatusId(game: GameState, projectId: number): ProjectHelpStatusId | null {
  const kind = longOffTableCompletion(game, projectId);
  if (!kind) return null;
  return kind === "over" ? "long_over_complete" : "long_exact_complete";
}

/** 结算页个人条：短期/风险投爆时不显示个人 / 上限分母（全场行仍显示 x/上限） */
export function settlementHidesInvestedRatio(result: SettlementProjectResult): boolean {
  return result.isExploded && result.type !== "long";
}

/** 结算页长期完成态文案（满额 / 超填 / 梯度收官） */
export function longSettlementStatusLabel(
  result: SettlementProjectResult
): { text: string; color: string } | null {
  if (result.type !== "long") return null;
  if (result.endGradient) return { text: "按进度返还", color: "#a78bfa" };
  if (!result.isCompleted) return null;
  if (result.isExploded) return { text: "超额完成", color: LONG_COMPLETE_CHIP_COLOR };
  return { text: "恰好完成", color: LONG_COMPLETE_CHIP_COLOR };
}

/** 短期恰好满额（非投爆） */
export function shortExactSettlementStatusLabel(
  result: SettlementProjectResult
): { text: string; color: string } | null {
  if (result.type !== "short" || !result.isCompleted || result.isExploded) return null;
  return { text: "恰好完成", color: LONG_COMPLETE_CHIP_COLOR };
}

/** PDF / 终局统计：计入「已完成」桶（非投爆） */
export function isSuccessfulProjectParticipationOutcome(id: ProjectHelpStatusId): boolean {
  return id === "completed" || id === "long_exact_complete" || id === "long_over_complete";
}

function isOffTableCompleted(game: GameState, projectId: number): boolean {
  if (findCompleted(game, projectId)) return true;
  return lastResult(game, projectId)?.isCompleted === true;
}

function isOffTableWithdrawn(game: GameState, projectId: number): boolean {
  if (!findUncompleted(game, projectId)) return false;
  if (isOffTableExploded(game, projectId)) return false;
  const u = findUncompleted(game, projectId)!;
  if ((u.accumulatedInvested ?? 0) > 0) return false;
  return (u.roundsNoInvestment ?? 0) >= 2;
}

/** 本轮结算刚撤场：仍在结算轮次内，且该项目出现在最近一次结算快照中 */
export function isFreshWithdrawnProject(game: GameState, projectId: number): boolean {
  const ls = game.lastSettlement;
  if (!ls || game.globalRound !== ls.round) return false;
  return ls.results.some((r) => r.projectId === projectId);
}

export function canInvestNow(game: GameState, me: Player, project: ActiveProject): boolean {
  if (!game.activeProjects.some((p) => p.id === project.id)) return false;
  if (game.phase !== "BUFF_USAGE" && game.phase !== "INVESTMENT") return false;
  if (game.phase === "INVESTMENT" && me.ready) return false;

  if (project.type === "long") {
    const lt = me.longTerm[project.id];
    if (lt?.status === "abandoned" || lt?.status === "completed") return false;
  }
  return true;
}

/** 之后是否还会进入可分配精力的投资阶段（第4时代第2轮结算后不再有） */
export function hasFutureInvestmentRound(game: GameState): boolean {
  if (game.phase === "GAME_OVER" || game.phase === "COMMUNITY_NAMING") return false;
  // 本轮结算结束后会进社区命名/终局，牌面项目不应再标「下轮可投」
  if (game.phase === "SETTLEMENT" && game.currentEra >= 4 && game.roundInEra >= 2) {
    return false;
  }
  return true;
}

/**
 * ？栏「可投项目」归属：牌面上且之后投资阶段仍能投。
 * 结算/拍卖/时代介绍等阶段本页不能投，但仍归可投表；投资阶段已提交或终局结算则进不可再投。
 */
export function isHelpInvestableCandidate(
  game: GameState,
  me: Player,
  project: ActiveProject
): boolean {
  if (!game.activeProjects.some((p) => p.id === project.id)) return false;
  if (!hasFutureInvestmentRound(game)) return false;
  // 本轮已提交锁定：本轮不可再改，进「不可再投」
  if (game.phase === "INVESTMENT" && me.ready) return false;

  if (project.type === "long") {
    const lt = me.longTerm[project.id];
    if (lt?.status === "abandoned" || lt?.status === "completed") return false;
  }
  return true;
}

export function playerParticipated(game: GameState, me: Player, projectId: number): boolean {
  const lt = me.longTerm[projectId];
  if (lt && lt.status !== undefined) return true;
  if ((me.investment?.[projectId] ?? 0) > 0) return true;
  if ((me.investmentDraft?.[projectId] ?? 0) > 0) return true;
  const r = lastResult(game, projectId);
  if (r) {
    if ((r.playerInvestments[me.id] ?? 0) > 0) return true;
    if ((r.playerGains[me.id]?.total ?? 0) !== 0) return true;
  }
  const active = findActive(game, projectId) ?? findCompleted(game, projectId) ?? findUncompleted(game, projectId);
  if (active?.investorRecords?.[me.id]) return true;
  return false;
}

export function resolveProjectStatus(game: GameState, me: Player, projectId: number): ProjectHelpStatus {
  const meta = (id: ProjectHelpStatusId): ProjectHelpStatus => {
    const m = STATUS_META[id];
    return { id, chip: m.chip, tooltip: m.tooltip, chipColor: m.chipColor };
  };

  const onTable = findActive(game, projectId);
  const offCompleted = findCompleted(game, projectId);
  const offUncompleted = findUncompleted(game, projectId);
  const catalog = PROJECT_CATALOG_BY_ID[projectId];
  const type =
    onTable?.type ??
    catalog?.type ??
    offCompleted?.type ??
    offUncompleted?.type ??
    lastResult(game, projectId)?.type;

  if (type === "long" && me.longTerm[projectId]?.status === "abandoned") {
    return meta("abandoned");
  }
  if (type === "long" && me.longTerm[projectId]?.status === "completed") {
    const longId = longFinishedStatusId(game, projectId);
    if (longId) return meta(longId);
    const r = lastResult(game, projectId);
    if (r?.isExploded) return meta("long_over_complete");
    return meta("long_exact_complete");
  }

  if (offCompleted || offUncompleted) {
    if (type === "long" && isOffTableCompleted(game, projectId)) {
      const longId = longFinishedStatusId(game, projectId);
      if (longId) return meta(longId);
    }
    if (isOffTableExploded(game, projectId)) return meta("exploded");
    if (isOffTableCompleted(game, projectId)) return meta("completed");
    if (isOffTableWithdrawn(game, projectId)) return meta("withdrawn");
  } else if (!onTable) {
    const r = lastResult(game, projectId);
    if (r?.type === "long" && r.isCompleted) {
      return meta(r.isExploded ? "long_over_complete" : "long_exact_complete");
    }
    if (r?.isExploded) return meta("exploded");
    if (r?.isCompleted) return meta("completed");
  }

  // 投资阶段已提交：所有牌面项目统一「已锁定」（含短/风险，不只长期）
  if (onTable && game.phase === "INVESTMENT" && me.ready) {
    return meta("unpaid_long");
  }

  if (
    type === "long" &&
    onTable &&
    me.longTerm[projectId]?.status === "active" &&
    (onTable.accumulatedInvested ?? 0) < onTable.maxEnergy
  ) {
    if (canInvestNow(game, me, onTable)) {
      return meta("committed_long");
    }
    if (isHelpInvestableCandidate(game, me, onTable)) {
      return meta("next_round");
    }
    // 终局结算等：不再有下轮投资，仍提示已参投义务已结束于本局
    return meta("committed_long");
  }

  if (onTable && canInvestNow(game, me, onTable)) {
    return meta("investable");
  }

  if (onTable && isHelpInvestableCandidate(game, me, onTable)) {
    return meta("next_round");
  }

  if (onTable) return meta("in_progress");

  if (playerParticipated(game, me, projectId)) return meta("participated");

  return meta("none");
}

export interface ProjectHelpRow {
  kind: "data" | "separator";
  projectId?: number;
  name?: string;
  /** 时代主题简称（气候/科技/文化/健康/心理） */
  eraShort?: string;
  projectType?: CatalogProjectType;
  typeLabel?: string;
  progressHint?: string;
  status?: ProjectHelpStatus;
}

function collectProjectIds(game: GameState): number[] {
  const ids = new Set<number>();
  for (const p of game.activeProjects) ids.add(p.id);
  for (const p of game.completedProjects ?? []) ids.add(p.id);
  for (const p of game.uncompletedProjects ?? []) ids.add(p.id);
  for (const r of game.lastSettlement?.results ?? []) ids.add(r.projectId);
  return [...ids];
}

/** 本局已出现过的项目 id：优先 drawnProjects，并与牌面/结算并集兜底，避免广播缺字段时下方表空而上方有行 */
export function collectAppearedProjectIds(game: GameState): number[] {
  const ids = new Set<number>(game.drawnProjects ?? []);
  for (const id of collectProjectIds(game)) ids.add(id);
  return [...ids];
}

const CATALOG_TYPE_ORDER: Record<string, number> = { short: 0, long: 1, risk: 2 };

/** ？栏「不可再投项目」：本局已出卡，且当前玩家已不可再投（离场/放弃/本轮已提交锁定等） */
export function buildAppearedCatalogEntries(game: GameState, me: Player): ProjectCatalogEntry[] {
  const rows: ProjectCatalogEntry[] = [];
  for (const id of collectAppearedProjectIds(game)) {
    const entry = PROJECT_CATALOG_BY_ID[id];
    if (!entry) continue;
    const active = findActive(game, id);
    // 仍在牌面且下一轮还能投 → 只留在「可投项目」（含结算页）
    if (active && isHelpInvestableCandidate(game, me, active)) continue;
    rows.push(entry);
  }
  rows.sort((a, b) => {
    const ta = CATALOG_TYPE_ORDER[a.type] ?? 9;
    const tb = CATALOG_TYPE_ORDER[b.type] ?? 9;
    if (ta !== tb) return ta - tb;
    return a.name.localeCompare(b.name, "zh");
  });
  return rows;
}

function rowForProject(game: GameState, me: Player, projectId: number): ProjectHelpRow {
  const active = findActive(game, projectId);
  const catalog = PROJECT_CATALOG_BY_ID[projectId];
  const name = active?.name ?? catalog?.name ?? findCompleted(game, projectId)?.name ?? findUncompleted(game, projectId)?.name ?? `#${projectId}`;
  const type = active?.type ?? catalog?.type ?? "short";
  const typeLabel = TYPE_LABEL[type];
  const eraShort =
    active?.era ??
    catalog?.era ??
    findCompleted(game, projectId)?.era ??
    findUncompleted(game, projectId)?.era ??
    "—";
  const max = active?.maxEnergy ?? catalog?.maxEnergy;
  const acc = active?.accumulatedInvested;
  const progressHint =
    max != null && acc != null && active ? `${acc}/${max}` : max != null ? `上限 ${max}` : "—";
  return {
    kind: "data",
    projectId,
    name,
    eraShort,
    projectType: type,
    typeLabel,
    progressHint,
    status: resolveProjectStatus(game, me, projectId),
  };
}

/** ？栏「可投项目」：牌面上且下一轮仍可投（含结算页「下轮可投」）；真正离场/放弃/已锁定进「不可再投」 */
export function buildProjectHelpRows(game: GameState, me: Player): ProjectHelpRow[] {
  const ids = collectProjectIds(game);
  if (ids.length === 0) return [];

  const sortByTypeThenName = (a: ProjectHelpRow, b: ProjectHelpRow) => {
    const ta = CATALOG_TYPE_ORDER[a.projectType ?? ""] ?? 9;
    const tb = CATALOG_TYPE_ORDER[b.projectType ?? ""] ?? 9;
    if (ta !== tb) return ta - tb;
    return (a.name ?? "").localeCompare(b.name ?? "", "zh");
  };

  return ids
    .map((id) => {
      const active = findActive(game, id);
      if (!active || !isHelpInvestableCandidate(game, me, active)) return null;
      return rowForProject(game, me, id);
    })
    .filter((r): r is ProjectHelpRow => r != null)
    .sort(sortByTypeThenName);
}

