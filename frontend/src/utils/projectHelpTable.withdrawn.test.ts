/**
 * 撤场状态与 server projectSettlement 一致：曾累计投入 > 0 不应标为已撤场。
 * 运行：npx tsx --test src/utils/projectHelpTable.withdrawn.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveProjectStatus } from "./projectHelpTable";
import { ActiveProject, GameState, Player } from "../types";

function baseGame(overrides: Partial<GameState> = {}): GameState {
  return {
    roomId: "t",
    players: [],
    phase: "SETTLEMENT",
    phaseFinished: new Set(),
    readyPlayers: new Set(),
    transactions: [],
    currentEra: 2,
    roundInEra: 1,
    globalRound: 3,
    eraSequence: [0, 1, 2, 3, 4],
    activeProjects: [],
    completedProjects: [],
    uncompletedProjects: [],
    drawnProjects: new Set([101]),
    totalRiskEnergyAvailable: 400,
    pendingEvents: {},
    eventCards: {},
    eventChoices: {},
    logs: [],
    playerLogs: {},
    lastSettlement: { round: 3, results: [] },
    ...overrides,
  };
}

function me(): Player {
  return {
    id: "p1",
    name: "p1",
    energy: 0,
    wealth: 0,
    connected: true,
    ready: false,
    rank: 0,
    investment: {},
    longTerm: { 101: { status: "active", rounds: [5] } },
    riskGains: {},
    inventory: [],
    usedCards: [],
    activeBuffs: [],
    slackedBy: [],
    totalEnergyConsumed: 0,
    wealthHistory: [0],
    investedRiskEnergy: 0,
    investedLongEnergy: 30,
    investedShortEnergy: 0,
    socialRank: null,
  };
}

function longUnfinished(id: number): ActiveProject {
  return {
    id,
    name: "长期试玩",
    type: "long",
    era: "科技",
    maxEnergy: 90,
    accumulatedInvested: 30,
    currentInvested: 0,
    rankRewards: [10],
    investorRecords: { p1: 30 },
    earningRecords: {},
    totalPayout: 0,
    roundsNoInvestment: 2,
    investedThisRound: false,
  };
}

describe("resolveProjectStatus withdrawn", () => {
  it("does not label long with prior investment as withdrawn when off table", () => {
    const game = baseGame({
      uncompletedProjects: [longUnfinished(101)],
      players: [me()],
    });
    const status = resolveProjectStatus(game, me(), 101);
    assert.notEqual(status.id, "withdrawn");
  });

  it("labels never-invested project as withdrawn after two empty rounds", () => {
    const ghost = longUnfinished(102);
    ghost.accumulatedInvested = 0;
    ghost.investorRecords = {};
    const game = baseGame({
      uncompletedProjects: [ghost],
      players: [me()],
      drawnProjects: new Set([102]),
    });
    const status = resolveProjectStatus(game, me(), 102);
    assert.equal(status.id, "withdrawn");
  });
});
