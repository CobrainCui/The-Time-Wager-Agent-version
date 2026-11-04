import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  LONG_CONTINUE_MIN_ENERGY,
  needsLongContinueWarn,
  refundOnAbandon,
  sanitizeLongContribution,
  shouldTreatAsAbandon,
  syncActiveLongTermRecords,
  syncLongTermRecordsFromHistory,
} from "./longTermLogic.js";
import { sanitizeInvestments } from "./investmentLogic.js";
import { settleOneProject, settlePhase } from "./projectSettlement.js";
import { ActiveProject, GameState, Player } from "../state/gameState.js";
import { emptySessionTelemetry } from "../state/sessionTelemetry.js";

function makePlayer(id: string, overrides: Partial<Player> = {}): Player {
  return {
    id,
    name: id,
    energy: 15,
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
    totalEnergyConsumed: 0,
    wealthHistory: [0],
    investedRiskEnergy: 0,
    investedLongEnergy: 0,
    investedShortEnergy: 0,
    socialRank: null,
    ...overrides,
  };
}

function makeLongProject(id: number): ActiveProject {
  return {
    id,
    name: "测试长期",
    type: "long",
    era: "气候",
    maxEnergy: 90,
    accumulatedInvested: 0,
    currentInvested: 0,
    roundsNoInvestment: 0,
    investedThisRound: false,
    investorRecords: {},
    earningRecords: {},
    totalPayout: 0,
  };
}

function settleLongRound(game: GameState, project: ActiveProject) {
  const logs: string[] = [];
  return settleOneProject(game, project, logs);
}

describe("longTermLogic", () => {
  it("shouldTreatAsAbandon only when active and below minimum", () => {
    const rec = { totalInvested: 5, status: "active" as const };
    assert.equal(shouldTreatAsAbandon(rec, 0), true);
    assert.equal(shouldTreatAsAbandon(rec, 2), true);
    assert.equal(shouldTreatAsAbandon(rec, LONG_CONTINUE_MIN_ENERGY), false);
    assert.equal(shouldTreatAsAbandon(undefined, 0), false);
    assert.equal(shouldTreatAsAbandon({ totalInvested: 1, status: "abandoned" }, 0), false);
  });

  it("refundOnAbandon sums history and current round", () => {
    assert.equal(refundOnAbandon({ totalInvested: 7, status: "active" }, 0), 7);
    assert.equal(refundOnAbandon({ totalInvested: 7, status: "active" }, 2), 9);
  });

  it("sanitizeLongContribution clears 1-2 for active", () => {
    assert.equal(sanitizeLongContribution("active", 2), 0);
    assert.equal(sanitizeLongContribution("active", 3), 3);
    assert.equal(sanitizeLongContribution(undefined, 2), 2);
  });

  it("needsLongContinueWarn uses investorRecords when longTerm missing", () => {
    const project = makeLongProject(101);
    project.investorRecords = { p1: 5 };
    const p = makePlayer("p1", { longTerm: {} });
    assert.equal(needsLongContinueWarn(project, p), true);

    const stranger = makePlayer("p2");
    assert.equal(needsLongContinueWarn(project, stranger), false);

    const abandoned = makePlayer("p1", {
      longTerm: { 101: { totalInvested: 5, status: "abandoned" } },
    });
    assert.equal(needsLongContinueWarn(project, abandoned), false);

    const active = makePlayer("p1", {
      longTerm: { 101: { totalInvested: 5, status: "active" } },
    });
    assert.equal(needsLongContinueWarn(project, active), true);
  });

  it("syncActiveLongTermRecords heals missing longTerm before investment", () => {
    const p = makePlayer("p1", { longTerm: {} });
    const project = makeLongProject(101);
    project.investorRecords = { p1: 8 };
    const short = makeLongProject(102);
    short.type = "short";
    short.investorRecords = { p1: 3 };
    syncActiveLongTermRecords({ activeProjects: [project, short], players: [p] });
    assert.equal(p.longTerm[101]?.status, "active");
    assert.equal(p.longTerm[101]?.totalInvested, 8);
    assert.equal(p.longTerm[102], undefined);
  });
});

describe("settleOneProject long-term", () => {
  it("first round invest 2 creates active without abandon", () => {
    const p = makePlayer("p1", { investment: { 101: 2 }, investedLongEnergy: 2 });
    const project = makeLongProject(101);
    const game = { players: [p] } as GameState;

    const result = settleLongRound(game, project);

    assert.equal(p.longTerm[101]?.status, "active");
    assert.equal(p.longTerm[101]?.totalInvested, 2);
    assert.deepEqual(p.longTerm[101]?.roundSlices, [2]);
    assert.equal(project.investorRecords.p1, 2);
    assert.equal(result.playerGains.p1?.total ?? 0, 0);
  });

  it("second round invest 5 continues active", () => {
    const p = makePlayer("p1", {
      longTerm: { 101: { totalInvested: 2, status: "active", roundSlices: [2] } },
      investment: { 101: 5 },
      investedLongEnergy: 7,
    });
    const project = makeLongProject(101);
    project.investorRecords = { p1: 2 };
    project.accumulatedInvested = 2;

    settleLongRound({ players: [p] } as GameState, project);

    assert.equal(p.longTerm[101]?.status, "active");
    assert.equal(p.longTerm[101]?.totalInvested, 7);
    assert.deepEqual(p.longTerm[101]?.roundSlices, [2, 5]);
    assert.equal(project.investorRecords.p1, 7);
  });

  it("heals missing roundSlices from prior total before new round", () => {
    const p = makePlayer("p1", {
      longTerm: { 101: { totalInvested: 7, status: "active" } },
      investment: { 101: 3 },
      investedLongEnergy: 10,
    });
    const project = makeLongProject(101);
    project.investorRecords = { p1: 7 };
    project.accumulatedInvested = 7;

    settleLongRound({ players: [p] } as GameState, project);

    assert.equal(p.longTerm[101]?.totalInvested, 10);
    assert.deepEqual(p.longTerm[101]?.roundSlices, [7, 3]);
  });

  it("second round invest 0 abandons and refunds", () => {
    const p = makePlayer("p1", {
      longTerm: { 101: { totalInvested: 7, status: "active" } },
      investment: { 101: 0 },
      wealth: 10,
      investedLongEnergy: 7,
    });
    const project = makeLongProject(101);
    project.investorRecords = { p1: 7 };
    project.accumulatedInvested = 7;

    const result = settleLongRound({ players: [p] } as GameState, project);

    assert.equal(p.longTerm[101]?.status, "abandoned");
    assert.equal(p.longTerm[101]?.totalInvested, 0);
    assert.deepEqual(p.longTerm[101]?.roundSlices, [7]);
    assert.equal(p.wealth, 17);
    assert.equal(result.playerGains.p1?.total, 7);
    assert.equal(result.playerInvestments.p1, 7);
    assert.equal(p.investedLongEnergy, 0);
    assert.equal(project.investorRecords.p1, 7);
    assert.equal(project.accumulatedInvested, 7);
  });

  it("abandon preserves per-round slices", () => {
    const p = makePlayer("p1", {
      longTerm: { 101: { totalInvested: 7, status: "active", roundSlices: [5, 2] } },
      investment: { 101: 0 },
      wealth: 10,
      investedLongEnergy: 7,
    });
    const project = makeLongProject(101);
    project.investorRecords = { p1: 7 };
    project.accumulatedInvested = 7;

    const result = settleLongRound({ players: [p] } as GameState, project);

    assert.equal(p.longTerm[101]?.status, "abandoned");
    assert.deepEqual(p.longTerm[101]?.roundSlices, [5, 2]);
    assert.equal(result.playerInvestments.p1, 7);
  });

  it("abandon keeps board total and adds current round to accumulated", () => {
    const p = makePlayer("p1", {
      longTerm: { 101: { totalInvested: 7, status: "active" } },
      investment: { 101: 2 },
      wealth: 10,
      investedLongEnergy: 7,
    });
    const other = makePlayer("p2", {
      longTerm: { 101: { totalInvested: 5, status: "active" } },
      investment: { 101: 3 },
    });
    const project = makeLongProject(101);
    project.investorRecords = { p1: 7, p2: 5 };
    project.accumulatedInvested = 12;

    const result = settleLongRound({ players: [p, other] } as GameState, project);

    assert.equal(p.longTerm[101]?.status, "abandoned");
    assert.equal(p.wealth, 10 + 7 + 2);
    assert.deepEqual(p.longTerm[101]?.roundSlices, [7, 2]);
    assert.equal(result.playerInvestments.p1, 9);
    assert.equal(result.playerGains.p1?.total, 9);
    assert.equal(project.investorRecords.p1, 9);
    assert.equal(project.investorRecords.p2, 5 + 3);
    assert.equal(project.accumulatedInvested, 17);
    assert.equal(result.totalInvested, 17);
  });

  it("syncLongTermRecordsFromHistory enables abandon on legacy data", () => {
    const p = makePlayer("p1", { investment: { 101: 0 }, wealth: 0 });
    const project = makeLongProject(101);
    project.investorRecords = { p1: 4 };
    project.accumulatedInvested = 4;

    syncLongTermRecordsFromHistory(project, [p]);
    settleLongRound({ players: [p] } as GameState, project);

    assert.equal(p.longTerm[101]?.status, "abandoned");
    assert.equal(p.longTerm[101]?.totalInvested, 0);
    assert.equal(p.wealth, 4);
    assert.equal(project.investorRecords.p1, 4);
    assert.equal(project.accumulatedInvested, 4);
  });

  it("sanitizeInvestments zeros active 1-2 before settle path", () => {
    const p = makePlayer("p1", {
      longTerm: { 101: { totalInvested: 5, status: "active" } },
      energy: 10,
    });
    const project = makeLongProject(101);
    const game = {
      activeProjects: [project],
      players: [p],
    } as GameState;

    const sanitized = sanitizeInvestments(game, p, { 101: 2 });
    assert.deepEqual(sanitized, {});
  });
});

describe("settlePhase unfinished long gradient (era 4 round 2)", () => {
  it("pays gradient into lastSettlement and moves project off the table", () => {
    const p = makePlayer("p1", {
      longTerm: { 101: { totalInvested: 30, status: "active" } },
      wealth: 100,
      investment: { 101: 3 },
      investedLongEnergy: 30,
    });
    const project = makeLongProject(101);
    project.maxEnergy = 90;
    project.investorRecords = { p1: 30 };
    project.accumulatedInvested = 30;

    const game = {
      currentEra: 4,
      roundInEra: 2,
      globalRound: 8,
      players: [p],
      activeProjects: [project],
      uncompletedProjects: [],
      completedProjects: [],
      logs: [],
      sessionTelemetry: emptySessionTelemetry(),
    } as unknown as GameState;

    settlePhase(game);

    // 本轮 +3 → 累计 33，达 1/3 上限 → 1:5
    assert.equal(p.longTerm[101]?.totalInvested, 33);
    assert.equal(p.wealth, 100 + 33 * 5);
    assert.equal(game.activeProjects.length, 0);
    assert.equal(game.uncompletedProjects.length, 1);
    const gains = game.lastSettlement!.results.find((r) => r.projectId === 101)!.playerGains.p1;
    assert.equal(gains.base, 33 * 5);
    assert.equal(gains.total, 33 * 5);
  });

  it("does not pay gradient before era 4 round 2", () => {
    const p = makePlayer("p1", {
      longTerm: { 101: { totalInvested: 30, status: "active" } },
      wealth: 100,
      investment: { 101: 3 },
    });
    const project = makeLongProject(101);
    project.maxEnergy = 90;
    project.investorRecords = { p1: 30 };
    project.accumulatedInvested = 30;

    const game = {
      currentEra: 3,
      roundInEra: 2,
      globalRound: 6,
      players: [p],
      activeProjects: [project],
      uncompletedProjects: [],
      completedProjects: [],
      logs: [],
      sessionTelemetry: emptySessionTelemetry(),
    } as unknown as GameState;

    settlePhase(game);

    assert.equal(p.wealth, 100);
    assert.equal(game.activeProjects.length, 1);
    assert.equal(game.uncompletedProjects.length, 0);
  });

  it("also pays gradient for longs already withdrawn mid-game", () => {
    const p = makePlayer("p1", {
      longTerm: { 101: { totalInvested: 30, status: "active" } },
      wealth: 50,
      investment: {},
    });
    const withdrawn = makeLongProject(101);
    withdrawn.maxEnergy = 90;
    withdrawn.investorRecords = { p1: 30 };
    withdrawn.accumulatedInvested = 30;
    withdrawn.roundsNoInvestment = 2;

    const game = {
      currentEra: 4,
      roundInEra: 2,
      globalRound: 8,
      players: [p],
      activeProjects: [],
      uncompletedProjects: [withdrawn],
      completedProjects: [],
      logs: [],
      sessionTelemetry: emptySessionTelemetry(),
    } as unknown as GameState;

    settlePhase(game);

    assert.equal(p.wealth, 50 + 30 * 5);
    assert.equal(withdrawn.endGradientPaid, true);
    assert.equal(game.uncompletedProjects.length, 1);
    const res = game.lastSettlement!.results.find((r) => r.projectId === 101)!;
    assert.equal(res.endGradient, true);
    assert.equal(res.playerInvestments.p1, 30);
    assert.equal(res.playerGains.p1.total, 30 * 5);
  });
});
