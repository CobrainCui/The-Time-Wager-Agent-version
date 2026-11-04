/**
 * 运行：npx tsx --test src/utils/projectInvestQuickRef.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildMyProjectInvestQuickRef } from "./projectInvestQuickRef";
import type { ActiveProject, GameState, Player, SettlementHistoryEntry } from "../types";

function baseGame(overrides: Partial<GameState> = {}): GameState {
  return {
    roomId: "t",
    players: [],
    phase: "SETTLEMENT",
    phaseFinished: [],
    readyPlayers: [],
    transactions: [],
    currentEra: 1,
    roundInEra: 1,
    globalRound: 1,
    eraSequence: [0, 1, 2, 3, 4],
    activeProjects: [],
    completedProjects: [],
    uncompletedProjects: [],
    drawnProjects: [],
    totalRiskEnergyAvailable: 400,
    logs: [],
    settlementHistory: [],
    ...overrides,
  } as GameState;
}

function player(overrides: Partial<Player> = {}): Player {
  return {
    id: "p1",
    name: "p1",
    energy: 10,
    wealth: 0,
    connected: true,
    ready: false,
    rank: 0,
    investment: {},
    longTerm: {},
    inventory: [],
    usedCards: [],
    activeBuffs: [],
    slackedBy: [],
    totalEnergyConsumed: 0,
    wealthHistory: [0],
    investedRiskEnergy: 0,
    investedLongEnergy: 0,
    socialRank: null,
    ...overrides,
  };
}

function shortActive(id: number, name: string): ActiveProject {
  return {
    id,
    name,
    type: "short",
    maxEnergy: 50,
    accumulatedInvested: 0,
    currentInvested: 0,
    investorRecords: {},
    earningRecords: {},
    totalPayout: 0,
    roundsNoInvestment: 0,
    investedThisRound: false,
  };
}

describe("buildMyProjectInvestQuickRef", () => {
  it("sums short/risk per round in history", () => {
    const history: SettlementHistoryEntry[] = [
      {
        round: 1,
        currentEra: 1,
        roundInEra: 1,
        results: [
          {
            projectId: 1,
            name: "短A",
            type: "short",
            maxEnergy: 50,
            totalInvested: 10,
            isExploded: false,
            isCompleted: false,
            playerInvestments: { p1: 5 },
            playerGains: { p1: { total: 0, base: 0, rank: 0, era: 0 } },
          },
        ],
      },
      {
        round: 2,
        currentEra: 1,
        roundInEra: 2,
        results: [
          {
            projectId: 1,
            name: "短A",
            type: "short",
            maxEnergy: 50,
            totalInvested: 8,
            isExploded: false,
            isCompleted: false,
            playerInvestments: { p1: 3 },
            playerGains: { p1: { total: 0, base: 0, rank: 0, era: 0 } },
          },
        ],
      },
    ];
    const game = baseGame({
      settlementHistory: history,
      activeProjects: [shortActive(1, "短A")],
      drawnProjects: [1],
    });
    const me = player();
    const ref = buildMyProjectInvestQuickRef(game, me);
    const row = ref.investable.find((r) => r.projectId === 1);
    assert.equal(row?.cumulativeEnergy, 8);
  });

  it("uses max not sum for long in history", () => {
    const history: SettlementHistoryEntry[] = [
      {
        round: 1,
        currentEra: 1,
        roundInEra: 1,
        results: [
          {
            projectId: 101,
            name: "长A",
            type: "long",
            maxEnergy: 90,
            totalInvested: 10,
            isExploded: false,
            isCompleted: false,
            playerInvestments: { p1: 10 },
            playerGains: { p1: { total: 0, base: 0, rank: 0, era: 0 } },
          },
        ],
      },
      {
        round: 2,
        currentEra: 1,
        roundInEra: 2,
        results: [
          {
            projectId: 101,
            name: "长A",
            type: "long",
            maxEnergy: 90,
            totalInvested: 18,
            isExploded: false,
            isCompleted: false,
            playerInvestments: { p1: 18 },
            playerGains: { p1: { total: 0, base: 0, rank: 0, era: 0 } },
          },
        ],
      },
    ];
    const long = shortActive(101, "长A");
    long.type = "long";
    long.maxEnergy = 90;
    long.investorRecords = { p1: 18 };
    const game = baseGame({
      settlementHistory: history,
      activeProjects: [long],
      drawnProjects: [101],
    });
    const me = player({
      longTerm: { 101: { projectId: 101, totalInvested: 18, status: "active" } },
    });
    const ref = buildMyProjectInvestQuickRef(game, me);
    const row = ref.investable.find((r) => r.projectId === 101);
    assert.equal(row?.cumulativeEnergy, 18);
  });

  it("lists investable with zero cumulative", () => {
    const game = baseGame({
      activeProjects: [shortActive(2, "短B"), shortActive(3, "短C")],
      drawnProjects: [2, 3],
    });
    const me = player();
    const ref = buildMyProjectInvestQuickRef(game, me);
    assert.equal(ref.investable.length, 2);
    assert.ok(ref.investable.every((r) => r.cumulativeEnergy === 0));
    assert.equal(ref.other.length, 0);
  });

  it("puts off-table history-only project in other", () => {
    const history: SettlementHistoryEntry[] = [
      {
        round: 1,
        currentEra: 1,
        roundInEra: 1,
        results: [
          {
            projectId: 9,
            name: "已离场",
            type: "short",
            maxEnergy: 40,
            totalInvested: 40,
            isExploded: true,
            isCompleted: false,
            playerInvestments: { p1: 12 },
            playerGains: { p1: { total: -5, base: -5, rank: 0, era: 0 } },
          },
        ],
      },
    ];
    const game = baseGame({
      settlementHistory: history,
      activeProjects: [shortActive(2, "仍可投")],
      uncompletedProjects: [],
      drawnProjects: [2, 9],
    });
    const me = player();
    const ref = buildMyProjectInvestQuickRef(game, me);
    assert.equal(ref.investable.length, 1);
    assert.equal(ref.investable[0].projectId, 2);
    assert.equal(ref.other.length, 1);
    assert.equal(ref.other[0].projectId, 9);
    assert.equal(ref.other[0].cumulativeEnergy, 12);
  });

  it("falls back to lastSettlement when round missing from settlementHistory", () => {
    const game = baseGame({
      settlementHistory: [],
      lastSettlement: {
        round: 1,
        results: [
          {
            projectId: 5,
            name: "短补",
            type: "short",
            maxEnergy: 40,
            totalInvested: 10,
            isExploded: false,
            isCompleted: false,
            playerInvestments: { p1: 6 },
            playerGains: { p1: { total: 0, base: 0, rank: 0, era: 0 } },
          },
        ],
      },
      activeProjects: [shortActive(5, "短补")],
      drawnProjects: [5],
    });
    const me = player();
    const ref = buildMyProjectInvestQuickRef(game, me);
    assert.equal(ref.investable[0]?.cumulativeEnergy, 6);
  });

  it("uses board investorRecords without settlement history", () => {
    const p = shortActive(4, "仅牌面");
    p.investorRecords = { p1: 7 };
    const game = baseGame({
      activeProjects: [p],
      drawnProjects: [4],
    });
    const me = player();
    const ref = buildMyProjectInvestQuickRef(game, me);
    assert.equal(ref.investable[0]?.cumulativeEnergy, 7);
  });
});
