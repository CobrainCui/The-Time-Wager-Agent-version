import {
  AdminProjectAdjustEntry,
  ActiveProject,
  GameState,
  Player,
  Phase,
} from "../state/gameState.js";
import { appendSessionEvent } from "../state/sessionTelemetry.js";
import { isAiPlayer } from "../util/isAiPlayer.js";
import {
  sanitizeInvestments,
  spendableEnergy,
} from "./investmentLogic.js";
import { sanitizeLongContribution } from "./longTermLogic.js";
import {
  restoreSettlementBaseline,
  SettlementBaseline,
} from "./settlementBaseline.js";
import { settlePhase } from "./projectSettlement.js";

export type ProjectAdjustAction =
  | { kind: "stake"; projectId: number; playerId: string; delta: number }
  | { kind: "withdraw"; projectId: number };

export type ProjectAdjustPreview = {
  ok: boolean;
  message?: string;
  projectName?: string;
  playerName?: string;
  energyBefore?: number;
  energyAfter?: number;
  stakeBefore?: number;
  stakeAfter?: number;
  wealthDeltas?: Record<string, number>;
  refundsEnergy?: Record<string, number>;
};

const ALLOWED: Phase[] = ["INVESTMENT", "SETTLEMENT"];

function phaseLabel(phase: Phase): "INVESTMENT" | "SETTLEMENT" {
  return phase === "SETTLEMENT" ? "SETTLEMENT" : "INVESTMENT";
}

function findProjectOnTable(game: GameState, projectId: number) {
  return game.activeProjects.find((p) => p.id === projectId);
}

function findProjectForAdmin(game: GameState, projectId: number): ActiveProject | undefined {
  const onTable = findProjectOnTable(game, projectId);
  if (onTable) return onTable;
  return listAdminBoardProjects(game).find((p) => p.id === projectId);
}

/** 结算阶段或已锁定：改 player.investment；否则改草稿 */
function usesSubmittedInvestment(game: GameState, player: Player): boolean {
  if (game.phase === "SETTLEMENT") return true;
  return player.ready === true;
}

function getPlayerStake(game: GameState, player: Player, projectId: number): number {
  if (usesSubmittedInvestment(game, player)) {
    return Math.max(0, Math.floor(Number(player.investment?.[projectId] ?? 0)));
  }
  const draft = player.investmentDraft ?? {};
  return Math.max(0, Math.floor(Number(draft[projectId] ?? 0)));
}

function projectTypeEnergyField(
  type: "short" | "long" | "risk"
): "investedShortEnergy" | "investedLongEnergy" | "investedRiskEnergy" {
  if (type === "risk") return "investedRiskEnergy";
  if (type === "long") return "investedLongEnergy";
  return "investedShortEnergy";
}

function bumpDraftRevision(player: Player): void {
  player.investmentDraftAdminRevision = (player.investmentDraftAdminRevision ?? 0) + 1;
}

function totalDraftSpend(draft: Record<number, number>): number {
  let s = 0;
  for (const v of Object.values(draft)) s += Math.max(0, Math.floor(Number(v) || 0));
  return s;
}

export function assertAdminProjectPhase(game: GameState): string | null {
  if (!ALLOWED.includes(game.phase)) {
    return "仅投资或结算阶段可调整项目";
  }
  if (game.phase === "SETTLEMENT" && !game.settlementBaseline) {
    return "本轮尚无结算快照，请重新进入结算后再试";
  }
  return null;
}

function applyStakeLive(
  game: GameState,
  projectId: number,
  playerId: string,
  delta: number
): ProjectAdjustPreview {
  const project = findProjectOnTable(game, projectId);
  const player = game.players.find((p) => p.id === playerId);
  if (!project) return { ok: false, message: "项目不在牌面" };
  if (!player || isAiPlayer(player)) return { ok: false, message: "玩家无效" };
  if (!Number.isSafeInteger(delta) || delta === 0) {
    return { ok: false, message: "调整量须为非零整数" };
  }

  const committed = usesSubmittedInvestment(game, player);
  const before = getPlayerStake(game, player, projectId);
  const after = before + delta;
  if (after < 0) return { ok: false, message: "本轮投入不能为负" };

  if (project.type === "long") {
    const status = player.longTerm[projectId]?.status;
    const capped = sanitizeLongContribution(status, after);
    if (capped !== after) {
      return { ok: false, message: "长期项目投入不符合规则" };
    }
  }

  if (delta > 0) {
    if (committed) {
      if (delta > spendableEnergy(player)) {
        return { ok: false, message: "可用精力不足" };
      }
    } else {
      const draft = { ...(player.investmentDraft ?? {}) };
      draft[projectId] = after;
      const sanitized = sanitizeInvestments(game, player, draft);
      const total = totalDraftSpend(sanitized);
      if (total > spendableEnergy(player)) {
        return { ok: false, message: "预填总投入超过可用精力" };
      }
    }
  }

  const energyBefore = player.energy;
  if (committed) {
    const inv = { ...(player.investment ?? {}) };
    if (after === 0) delete inv[projectId];
    else inv[projectId] = after;
    player.investment = inv;
    player.energy = energyBefore - delta;
    player.totalEnergyConsumed += delta;
    const field = projectTypeEnergyField(project.type);
    player[field] = Math.max(0, player[field] + delta);
  } else {
    const draft = { ...(player.investmentDraft ?? {}) };
    if (after === 0) delete draft[projectId];
    else draft[projectId] = after;
    player.investmentDraft = sanitizeInvestments(game, player, draft);
    bumpDraftRevision(player);
  }

  return {
    ok: true,
    projectName: project.name,
    playerName: player.name,
    energyBefore,
    energyAfter: player.energy,
    stakeBefore: before,
    stakeAfter: after,
  };
}

function refundProjectRoundEnergy(
  game: GameState,
  projectId: number,
  projectType: "short" | "long" | "risk"
): Record<string, number> {
  const refunds: Record<string, number> = {};
  const field = projectTypeEnergyField(projectType);
  for (const p of game.players) {
    if (isAiPlayer(p)) continue;
    const amt = Math.max(0, Math.floor(Number(p.investment?.[projectId] ?? 0)));
    const draftAmt = Math.max(0, Math.floor(Number(p.investmentDraft?.[projectId] ?? 0)));
    const refund = usesSubmittedInvestment(game, p) ? amt : 0;
    if (refund > 0) {
      p.energy += refund;
      p.totalEnergyConsumed = Math.max(0, p.totalEnergyConsumed - refund);
      p[field] = Math.max(0, p[field] - refund);
      const inv = { ...(p.investment ?? {}) };
      delete inv[projectId];
      p.investment = inv;
      refunds[p.id] = refund;
    }
    if (draftAmt > 0 || p.investmentDraft?.[projectId] !== undefined) {
      const draft = { ...(p.investmentDraft ?? {}) };
      delete draft[projectId];
      p.investmentDraft = Object.keys(draft).length ? draft : undefined;
      bumpDraftRevision(p);
    }
    const lt = p.longTerm[projectId];
    if (lt && lt.status === "active") {
      p.longTerm[projectId] = { ...lt, status: "abandoned" };
    }
  }
  return refunds;
}

function applyWithdrawLive(game: GameState, projectId: number): ProjectAdjustPreview {
  const idx = game.activeProjects.findIndex((p) => p.id === projectId);
  if (idx === -1) return { ok: false, message: "项目不在牌面" };
  const project = game.activeProjects[idx]!;
  const refunds = refundProjectRoundEnergy(game, projectId, project.type);
  const withdrawn = { ...project, adminForceWithdrawn: true };
  game.activeProjects.splice(idx, 1);
  if (!game.uncompletedProjects.some((p) => p.id === projectId)) {
    game.uncompletedProjects.push(withdrawn);
  }
  return {
    ok: true,
    projectName: project.name,
    refundsEnergy: refunds,
  };
}

function applyEntryLive(game: GameState, entry: AdminProjectAdjustEntry): ProjectAdjustPreview {
  if (entry.kind === "stake") {
    return applyStakeLive(game, entry.projectId, entry.playerId, entry.delta);
  }
  return applyWithdrawLive(game, entry.projectId);
}

function inverseStakeEntry(entry: AdminProjectAdjustEntry): AdminProjectAdjustEntry | null {
  if (entry.kind !== "stake") return null;
  return { ...entry, delta: -entry.delta };
}

function cloneGameForSim(game: GameState): GameState {
  return JSON.parse(JSON.stringify(game)) as GameState;
}

function resettleAfterAdminAdjustments(
  game: GameState,
  opts?: { hostAdjusted?: boolean; hostRevision?: number }
): void {
  const baseline = game.settlementBaseline as SettlementBaseline | undefined;
  if (!baseline) throw new Error("missing baseline");
  restoreSettlementBaseline(game, baseline);
  const list = game.adminProjectAdjustments ?? [];
  for (const entry of list) {
    if (entry.phase !== "SETTLEMENT") continue;
    const res = applyEntryLive(game, entry);
    if (!res.ok) throw new Error(res.message ?? "重放调整失败");
  }
  const hostAdjusted =
    opts?.hostAdjusted ??
    list.some((e) => e.phase === "SETTLEMENT");
  settlePhase(game, {
    replacePrevious: true,
    hostAdjusted,
    hostRevision: opts?.hostRevision,
  });
}

function wealthSnapshot(game: GameState): Record<string, number> {
  const m: Record<string, number> = {};
  for (const p of game.players) m[p.id] = p.wealth;
  return m;
}

function diffWealth(before: Record<string, number>, after: Record<string, number>) {
  const deltas: Record<string, number> = {};
  for (const p of Object.keys(after)) {
    const d = (after[p] ?? 0) - (before[p] ?? 0);
    if (d !== 0) deltas[p] = d;
  }
  return deltas;
}

export function previewAdminProjectAdjust(
  game: GameState,
  action: ProjectAdjustAction
): ProjectAdjustPreview {
  const phaseErr = assertAdminProjectPhase(game);
  if (phaseErr) return { ok: false, message: phaseErr };

  if (game.phase === "INVESTMENT") {
    const sim = cloneGameForSim(game);
    if (action.kind === "stake") {
      return applyStakeLive(
        sim,
        action.projectId,
        action.playerId,
        action.delta
      );
    }
    return applyWithdrawLive(sim, action.projectId);
  }

  const before = wealthSnapshot(game);
  const sim = cloneGameForSim(game);
  const entry: AdminProjectAdjustEntry =
    action.kind === "stake"
      ? {
          kind: "stake",
          projectId: action.projectId,
          playerId: action.playerId,
          delta: action.delta,
          phase: "SETTLEMENT",
        }
      : { kind: "withdraw", projectId: action.projectId, phase: "SETTLEMENT" };

  const list = [...(sim.adminProjectAdjustments ?? []), entry];
  sim.adminProjectAdjustments = list;
  try {
    restoreSettlementBaseline(sim, sim.settlementBaseline as SettlementBaseline);
    for (const e of list) {
      if (e.phase !== "SETTLEMENT") continue;
      const r = applyEntryLive(sim, e);
      if (!r.ok) return r;
    }
    settlePhase(sim, { replacePrevious: true, hostAdjusted: true });
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "预览失败" };
  }
  const after = wealthSnapshot(sim);
  const player =
    action.kind === "stake"
      ? game.players.find((p) => p.id === action.playerId)
      : undefined;
  const stakeBefore =
    action.kind === "stake" && player
      ? getPlayerStake(game, player, action.projectId)
      : undefined;
  return {
    ok: true,
    projectName: findProjectForAdmin(game, action.projectId)?.name,
    playerName: player?.name,
    wealthDeltas: diffWealth(before, after),
    ...(action.kind === "stake" && stakeBefore !== undefined
      ? { stakeBefore, stakeAfter: stakeBefore + action.delta }
      : {}),
  };
}

export type CommitResult = {
  ok: boolean;
  message?: string;
  revision?: number;
  preview?: ProjectAdjustPreview;
};

export function commitAdminProjectAdjust(
  game: GameState,
  action: ProjectAdjustAction,
  expectedRevision: number
): CommitResult {
  const phaseErr = assertAdminProjectPhase(game);
  if (phaseErr) return { ok: false, message: phaseErr };
  const rev = game.hostRevision ?? 0;
  if (expectedRevision !== rev) {
    return { ok: false, message: "状态已变化，请重新预览" };
  }

  const preview = previewAdminProjectAdjust(game, action);
  if (!preview.ok) return { ok: false, message: preview.message };

  const ph = phaseLabel(game.phase);
  const entry: AdminProjectAdjustEntry =
    action.kind === "stake"
      ? {
          kind: "stake",
          projectId: action.projectId,
          playerId: action.playerId,
          delta: action.delta,
          phase: ph,
        }
      : { kind: "withdraw", projectId: action.projectId, phase: ph };

  if (!game.adminProjectAdjustments) game.adminProjectAdjustments = [];

  if (game.phase === "INVESTMENT") {
    const applied = applyEntryLive(game, entry);
    if (!applied.ok) return { ok: false, message: applied.message };
    game.adminProjectAdjustments.push(entry);
    game.hostRevision = rev + 1;
    logAdjust(game, entry, applied);
    return { ok: true, revision: game.hostRevision, preview: applied };
  }

  game.adminProjectAdjustments.push(entry);
  try {
    resettleAfterAdminAdjustments(game, {
      hostAdjusted: true,
      hostRevision: rev + 1,
    });
    game.hostRevision = rev + 1;
  } catch (e) {
    game.adminProjectAdjustments.pop();
    try {
      resettleAfterAdminAdjustments(game, {
        hostAdjusted: (game.adminProjectAdjustments ?? []).some(
          (x) => x.phase === "SETTLEMENT"
        ),
        hostRevision: game.hostRevision ?? rev,
      });
    } catch {
      /* 回滚失败时保持 pop 后的列表，避免重复入账 */
    }
    return {
      ok: false,
      message: e instanceof Error ? e.message : "重算结算失败",
    };
  }
  logAdjust(game, entry, preview);
  return { ok: true, revision: game.hostRevision, preview };
}

export function undoAdminProjectAdjust(game: GameState, expectedRevision: number): CommitResult {
  const phaseErr = assertAdminProjectPhase(game);
  if (phaseErr) return { ok: false, message: phaseErr };
  const rev = game.hostRevision ?? 0;
  if (expectedRevision !== rev) {
    return { ok: false, message: "状态已变化，请重新操作" };
  }
  const list = game.adminProjectAdjustments ?? [];
  if (list.length === 0) return { ok: false, message: "没有可撤销的调整" };
  const removed = list.pop()!;

  if (game.phase === "INVESTMENT") {
    if (removed.kind === "withdraw") {
      return { ok: false, message: "撤场暂不支持在投资阶段撤销" };
    }
    const inv = inverseStakeEntry(removed);
    if (!inv) return { ok: false, message: "无法撤销" };
    const applied = applyEntryLive(game, inv);
    if (!applied.ok) {
      list.push(removed);
      return { ok: false, message: applied.message };
    }
    game.hostRevision = rev + 1;
    game.logs.push(`↩️ 主持撤销了项目精力调整（${removed.projectId}）`);
    return { ok: true, revision: game.hostRevision };
  }

  try {
    resettleAfterAdminAdjustments(game, {
      hostAdjusted: list.some((e) => e.phase === "SETTLEMENT"),
      hostRevision: rev + 1,
    });
    game.hostRevision = rev + 1;
  } catch (e) {
    list.push(removed);
    try {
      resettleAfterAdminAdjustments(game, {
        hostAdjusted: list.some((x) => x.phase === "SETTLEMENT"),
        hostRevision: rev,
      });
    } catch {
      /* ignore */
    }
    return {
      ok: false,
      message: e instanceof Error ? e.message : "撤销后重算失败",
    };
  }
  game.logs.push(`↩️ 主持撤销了项目调整`);
  return { ok: true, revision: game.hostRevision };
}

function logAdjust(
  game: GameState,
  entry: AdminProjectAdjustEntry,
  preview: ProjectAdjustPreview
): void {
  if (entry.kind === "stake") {
    const p = game.players.find((x) => x.id === entry.playerId);
    game.logs.push(
      `🎛️ 主持将 ${p?.name ?? entry.playerId} 在「${preview.projectName ?? entry.projectId}」的本轮投入调整 ${entry.delta > 0 ? "+" : ""}${entry.delta}`
    );
    appendSessionEvent(game, "admin_project_stake", {
      projectId: entry.projectId,
      playerId: entry.playerId,
      delta: entry.delta,
      phase: entry.phase,
      stakeBefore: preview.stakeBefore,
      stakeAfter: preview.stakeAfter,
    });
  } else {
    game.logs.push(`🎛️ 主持强制撤场「${preview.projectName ?? entry.projectId}」`);
    appendSessionEvent(game, "admin_project_withdrawn", {
      projectId: entry.projectId,
      phase: entry.phase,
      refundsEnergy: preview.refundsEnergy ?? {},
    });
  }
}

export function listAdminBoardProjects(game: GameState): ActiveProject[] {
  if (game.phase === "SETTLEMENT" && game.settlementBaseline) {
    return (game.settlementBaseline as SettlementBaseline).activeProjects;
  }
  return game.activeProjects;
}

export function clearAdminProjectAdjustState(game: GameState): void {
  game.settlementBaseline = undefined;
  game.adminProjectAdjustments = [];
  game.hostRevision = 0;
}

export function notifyMessageForAdjust(
  game: GameState,
  entry: AdminProjectAdjustEntry,
  preview: ProjectAdjustPreview
): string | null {
  if (entry.kind === "stake") {
    const proj = preview.projectName ?? String(entry.projectId);
    const before = preview.stakeBefore ?? 0;
    const after = preview.stakeAfter ?? before + entry.delta;
    return `主持将你本轮在「${proj}」的投入从 ${before} 调整为 ${after}`;
  }
  if (entry.kind === "withdraw") {
    const proj = preview.projectName ?? String(entry.projectId);
    return `主持已将「${proj}」撤场（本轮已扣精力已退回，历史长期财富不退）`;
  }
  return null;
}
