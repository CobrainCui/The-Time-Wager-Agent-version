import crypto from "crypto";
import { ActiveProject, GameState, SettlementProjectResult } from "./gameState.js";

export type SessionEventType =
  | "phase_changed"
  | "investment_submitted"
  | "admin_investment_reverted"
  | "investment_timer"
  | "player_ready"
  | "presence"
  | "buff_used"
  | "coffee_purchased"
  | "coffee_refunded"
  | "transaction_created"
  | "transaction_resolved"
  | "chat_group_created"
  | "group_message"
  | "direct_message"
  | "agent_prediction"
  | "agent_decision"
  | "auction_offered"
  | "auction_resolved"
  | "auction_revoked"
  | "auction_offer_cancelled"
  | "auction_bid_placed"
  | "auction_lot_sold"
  | "auction_lot_passed"
  | "auction_lot_changed"
  | "lottery_offered"
  | "lottery_drawn"
  | "lottery_settled"
  | "lottery_offer_cancelled"
  | "lottery_revoked"
  | "admin_wealth_offered"
  | "admin_wealth_adjust"
  | "admin_wealth_offer_cancelled"
  | "admin_card_adjust"
  | "social_rated"
  | "settlement_round"
  | "settlement_round_replaced"
  | "admin_project_stake"
  | "admin_project_withdrawn"
  | "community_named";

/** 投资提交来源：点击提交 / 倒计时到点 / 主持强制结算 */
export type InvestmentSubmitSource = "player" | "deadline" | "admin_force";

export interface SessionEvent {
  id: string;
  type: SessionEventType;
  timestamp: number;
  playerId?: string;
  payload: Record<string, unknown>;
}

export interface SettlementHistoryEntry {
  round: number;
  currentEra: number;
  roundInEra: number;
  results: SettlementProjectResult[];
}

export interface SessionTelemetry {
  events: SessionEvent[];
  settlementHistory: SettlementHistoryEntry[];
}

export function emptySessionTelemetry(): SessionTelemetry {
  return { events: [], settlementHistory: [] };
}

function ensureTelemetry(game: GameState): SessionTelemetry {
  if (!game.sessionTelemetry) {
    game.sessionTelemetry = emptySessionTelemetry();
  }
  return game.sessionTelemetry;
}

export function ensureSessionStarted(game: GameState): void {
  if (!game.sessionStartedAt) {
    game.sessionStartedAt = Date.now();
    game.sessionId = crypto.randomUUID();
  }
}

export function appendSessionEvent(
  game: GameState,
  type: SessionEventType,
  payload: Record<string, unknown>,
  playerId?: string
): void {
  const tel = ensureTelemetry(game);
  tel.events.push({
    id: crypto.randomUUID(),
    type,
    timestamp: Date.now(),
    playerId,
    payload,
  });
}

export function recordPhaseChange(
  game: GameState,
  from: string,
  to: string,
  reason?: string
): void {
  if (from === to) return;
  appendSessionEvent(game, "phase_changed", {
    from,
    to,
    currentEra: game.currentEra,
    roundInEra: game.roundInEra,
    globalRound: game.globalRound,
    reason: reason ?? null,
  });
}

function findProjectOnTable(game: GameState, projectId: number): ActiveProject | undefined {
  for (const list of [game.activeProjects, game.completedProjects, game.uncompletedProjects]) {
    const found = list.find((p) => p.id === projectId);
    if (found) return found;
  }
  return undefined;
}

/** 历史战报「投入」列：长期非梯度行写入结算时刻的累计投入（与当场结算单一致） */
export function enrichSettlementResultsForHistory(
  game: GameState,
  results: SettlementProjectResult[]
): SettlementProjectResult[] {
  return results.map((r) => {
    if (r.type !== "long" || r.endGradient || r.shortSold) return r;
    const proj = findProjectOnTable(game, r.projectId);
    if (!proj?.investorRecords) return r;
    const playerInvestments = { ...r.playerInvestments };
    let changed = false;
    const playerIds = new Set([
      ...Object.keys(playerInvestments),
      ...Object.keys(r.playerGains),
    ]);
    for (const pid of playerIds) {
      const cumulative = proj.investorRecords[pid];
      if (typeof cumulative !== "number" || cumulative <= 0) continue;
      if (playerInvestments[pid] !== cumulative) {
        playerInvestments[pid] = cumulative;
        changed = true;
      }
    }
    return changed ? { ...r, playerInvestments } : r;
  });
}

export function replaceSettlementRound(
  game: GameState,
  results: SettlementProjectResult[]
): void {
  const tel = ensureTelemetry(game);
  const storedResults = enrichSettlementResultsForHistory(game, results);
  const entry: SettlementHistoryEntry = {
    round: game.globalRound,
    currentEra: game.currentEra,
    roundInEra: game.roundInEra,
    results: JSON.parse(JSON.stringify(storedResults)) as SettlementProjectResult[],
  };
  const idx = tel.settlementHistory.findIndex((h) => h.round === game.globalRound);
  if (idx >= 0) {
    tel.settlementHistory[idx] = entry;
  } else {
    tel.settlementHistory.push(entry);
  }
  appendSessionEvent(game, "settlement_round_replaced", {
    round: entry.round,
    currentEra: entry.currentEra,
    roundInEra: entry.roundInEra,
    projectCount: results.length,
  });
}

export function appendSettlementRound(game: GameState, results: SettlementProjectResult[]): void {
  const tel = ensureTelemetry(game);
  const storedResults = enrichSettlementResultsForHistory(game, results);
  const entry: SettlementHistoryEntry = {
    round: game.globalRound,
    currentEra: game.currentEra,
    roundInEra: game.roundInEra,
    results: JSON.parse(JSON.stringify(storedResults)) as SettlementProjectResult[],
  };
  tel.settlementHistory.push(entry);
  appendSessionEvent(game, "settlement_round", {
    round: entry.round,
    currentEra: entry.currentEra,
    roundInEra: entry.roundInEra,
    projectCount: results.length,
  });
}
