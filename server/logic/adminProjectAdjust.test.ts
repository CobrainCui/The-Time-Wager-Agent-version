import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createInitialGame, Player } from "../state/gameState.js";
import {
  commitAdminProjectAdjust,
  previewAdminProjectAdjust,
} from "./adminProjectAdjust.js";
import { settlePhase } from "./projectSettlement.js";
import { applyInvestments } from "./investmentLogic.js";

function player(id: string, overrides: Partial<Player> = {}): Player {
  return {
    id,
    name: id,
    socketId: "s",
    energy: 20,
    wealth: 100,
    connected: true,
    ready: false,
    rank: 1,
    investment: {},
    longTerm: {},
    riskGains: {},
    inventory: [],
    usedCards: [],
    activeBuffs: [],
    slackedBy: [],
    totalEnergyConsumed: 0,
    wealthHistory: [100],
    investedRiskEnergy: 0,
    investedLongEnergy: 0,
    investedShortEnergy: 0,
    socialRank: null,
    ...overrides,
  };
}

function shortProject(id: number) {
  return {
    id,
    name: `P${id}`,
    type: "short" as const,
    maxEnergy: 10,
    accumulatedInvested: 0,
    currentInvested: 0,
    roundsNoInvestment: 0,
    investedThisRound: false,
    investorRecords: {},
    earningRecords: {},
    totalPayout: 0,
    rankRewards: [30, 20, 10],
  };
}

describe("admin project adjust", () => {
  it("increases draft stake during investment without spending energy yet", () => {
    const game = createInitialGame("room", []);
    game.phase = "INVESTMENT";
    game.players = [player("p1")];
    game.activeProjects = [shortProject(1)];
    game.hostRevision = 0;

    const preview = previewAdminProjectAdjust(game, {
      kind: "stake",
      projectId: 1,
      playerId: "p1",
      delta: 3,
    });
    assert.equal(preview.ok, true);
    assert.equal(preview.stakeAfter, 3);

    const commit = commitAdminProjectAdjust(
      game,
      { kind: "stake", projectId: 1, playerId: "p1", delta: 3 },
      0
    );
    assert.equal(commit.ok, true);
    assert.equal(game.players[0]!.investmentDraft?.[1], 3);
    assert.equal(game.players[0]!.energy, 20);
  });

  it("force withdraw refunds committed round energy", () => {
    const game = createInitialGame("room", []);
    game.phase = "INVESTMENT";
    game.players = [player("p1", { ready: true })];
    game.activeProjects = [shortProject(1)];
    game.hostRevision = 0;
    applyInvestments(game, "p1", { 1: 5 });

    const commit = commitAdminProjectAdjust(game, { kind: "withdraw", projectId: 1 }, 0);
    assert.equal(commit.ok, true);
    assert.equal(game.activeProjects.length, 0);
    assert.equal(game.players[0]!.energy, 20);
    assert.equal(game.players[0]!.investment[1] ?? 0, 0);
  });

  it("settlement restake changes wealth without double-counting baseline", () => {
    const game = createInitialGame("room", []);
    game.phase = "INVESTMENT";
    game.currentEra = 1;
    game.roundInEra = 1;
    game.globalRound = 1;
    game.players = [player("p1", { ready: true })];
    game.activeProjects = [shortProject(1)];
    applyInvestments(game, "p1", { 1: 5 });
    game.phase = "INVESTMENT";
    settlePhase(game);
    game.phase = "SETTLEMENT";
    const wealthAfterFirst = game.players[0]!.wealth;
    game.hostRevision = 0;

    const commit = commitAdminProjectAdjust(
      game,
      { kind: "stake", projectId: 1, playerId: "p1", delta: 5 },
      0
    );
    assert.equal(commit.ok, true);
    assert.ok(game.lastSettlement?.hostAdjusted);
    assert.notEqual(game.players[0]!.wealth, wealthAfterFirst);
  });

  it("settlement preview uses submitted investment when players are not ready", () => {
    const game = createInitialGame("room", []);
    game.phase = "INVESTMENT";
    game.players = [player("p1", { ready: true })];
    game.activeProjects = [shortProject(1)];
    applyInvestments(game, "p1", { 1: 4 });
    settlePhase(game);
    game.phase = "SETTLEMENT";
    game.players[0]!.ready = false;

    const preview = previewAdminProjectAdjust(game, {
      kind: "stake",
      projectId: 1,
      playerId: "p1",
      delta: 1,
    });
    assert.equal(preview.ok, true);
    assert.equal(preview.stakeBefore, 4);
    assert.equal(preview.stakeAfter, 5);
  });

  it("rejects stale revision", () => {
    const game = createInitialGame("room", []);
    game.phase = "INVESTMENT";
    game.players = [player("p1")];
    game.activeProjects = [shortProject(1)];
    game.hostRevision = 2;
    const res = commitAdminProjectAdjust(
      game,
      { kind: "stake", projectId: 1, playerId: "p1", delta: 1 },
      0
    );
    assert.equal(res.ok, false);
  });
});
