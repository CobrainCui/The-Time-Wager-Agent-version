/**
 * PDF 投爆分桶回归：过期轮次投爆仍应识别（不依赖 lastSettlement）。
 * 运行：npx tsx --test src/utils/projectHelpTable.exploded.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildPdfProjectParticipationChart } from "./gameOverPdf";
import {
  isSuccessfulProjectParticipationOutcome,
  resolveProjectStatus,
} from "./projectHelpTable";
import { ActiveProject, GameState, Player } from "../types";

const FIXTURE_SHORT_BURST = 900_001;
const FIXTURE_SHORT_EXACT = 900_002;
const FIXTURE_LONG_OVER = 900_201;
const FIXTURE_RISK_BURST = 900_301;

function baseGame(overrides: Partial<GameState> = {}): GameState {
  return {
    roomId: "t",
    players: [],
    phase: "GAME_OVER",
    phaseFinished: new Set(),
    readyPlayers: new Set(),
    transactions: [],
    currentEra: 4,
    roundInEra: 2,
    globalRound: 10,
    eraSequence: [0, 1, 2, 3, 4],
    activeProjects: [],
    completedProjects: [],
    uncompletedProjects: [],
    drawnProjects: new Set(),
    totalRiskEnergyAvailable: 400,
    pendingEvents: {},
    eventCards: {},
    eventChoices: {},
    logs: [],
    playerLogs: {},
    lastSettlement: {
      round: 10,
      results: [],
    },
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
    ready: true,
    rank: 0,
    investment: {},
    longTerm: {},
    riskGains: {},
    inventory: [],
    usedCards: [],
    activeBuffs: [],
    slackedBy: [],
    totalEnergyConsumed: 50,
    wealthHistory: [0],
    investedRiskEnergy: 0,
    investedLongEnergy: 0,
    investedShortEnergy: 0,
    socialRank: null,
  };
}

function shortProject(
  id: number,
  accumulated: number,
  max: number
): ActiveProject {
  return {
    id,
    name: `短期${id}`,
    type: "short",
    era: "科技",
    maxEnergy: max,
    accumulatedInvested: accumulated,
    currentInvested: 0,
    roundsNoInvestment: 0,
    investedThisRound: false,
    investorRecords: { p1: accumulated },
    earningRecords: {},
    totalPayout: 0,
  };
}

describe("isOffTableExploded / PDF buckets", () => {
  it("短期投爆在 completedProjects 且 lastSettlement 无记录 → exploded", () => {
    const game = baseGame({
      completedProjects: [shortProject(FIXTURE_SHORT_BURST, 55, 50)],
      lastSettlement: { round: 10, results: [] },
    });
    const player = me();
    const status = resolveProjectStatus(game, player, FIXTURE_SHORT_BURST);
    assert.equal(status.id, "exploded");
    const chart = buildPdfProjectParticipationChart(game, player);
    assert.deepEqual(chart.exploded, ["短期900001"]);
    assert.equal(chart.completed.length, 0);
  });

  it("短期恰好满额 → completed，不进投爆", () => {
    const game = baseGame({
      completedProjects: [shortProject(FIXTURE_SHORT_EXACT, 50, 50)],
      lastSettlement: { round: 10, results: [] },
    });
    const player = me();
    assert.equal(resolveProjectStatus(game, player, FIXTURE_SHORT_EXACT).id, "completed");
    const chart = buildPdfProjectParticipationChart(game, player);
    assert.deepEqual(chart.completed, ["短期900002"]);
    assert.equal(chart.exploded.length, 0);
  });

  it("长期超填 → long_over_complete，进恰好完成桶", () => {
    const game = baseGame({
      completedProjects: [
        {
          ...shortProject(FIXTURE_LONG_OVER, 110, 100),
          name: "长期A",
          type: "long",
        },
      ],
      lastSettlement: { round: 10, results: [] },
    });
    const player = me();
    player.longTerm[FIXTURE_LONG_OVER] = {
      status: "completed",
      totalInvested: 20,
      currentRound: 1,
    };
    const status = resolveProjectStatus(game, player, FIXTURE_LONG_OVER);
    assert.equal(status.id, "long_over_complete");
    assert.ok(isSuccessfulProjectParticipationOutcome(status.id));
    const chart = buildPdfProjectParticipationChart(game, player);
    assert.deepEqual(chart.completed, ["长期A"]);
    assert.equal(chart.exploded.length, 0);
  });

  it("风险投爆在 uncompletedProjects → exploded", () => {
    const game = baseGame({
      uncompletedProjects: [
        {
          ...shortProject(FIXTURE_RISK_BURST, 60, 50),
          name: "风险B",
          type: "risk",
        },
      ],
      lastSettlement: { round: 10, results: [] },
    });
    const player = me();
    assert.equal(resolveProjectStatus(game, player, FIXTURE_RISK_BURST).id, "exploded");
    const chart = buildPdfProjectParticipationChart(game, player);
    assert.deepEqual(chart.exploded, ["风险B"]);
  });
});
