import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyInvestments, sanitizeInvestments, spendableEnergy } from "./investmentLogic.js";
import { ActiveProject, createInitialGame, Player } from "../state/gameState.js";

function makePlayer(id: string, overrides: Partial<Player> = {}): Player {
  return {
    id,
    name: id,
    energy: 10,
    wealth: 100,
    connected: true,
    ready: false,
    rank: 0,
    investment: {},
    investmentDraft: {},
    longTerm: {},
    riskGains: {},
    inventory: [],
    usedCards: [],
    activeBuffs: [],
    slackedBy: [],
    totalEnergyConsumed: 10,
    wealthHistory: [0],
    investedRiskEnergy: 0,
    investedLongEnergy: 0,
    investedShortEnergy: 0,
    socialRank: null,
    ...overrides,
  };
}

function shortProject(id: number): ActiveProject {
  return {
    id,
    name: `P${id}`,
    type: "short",
    maxEnergy: 50,
    accumulatedInvested: 0,
    currentInvested: 0,
    roundsNoInvestment: 0,
    investedThisRound: false,
    investorRecords: {},
    earningRecords: {},
    totalPayout: 0,
  };
}

describe("applyInvestments energy floor", () => {
  it("spendableEnergy floors negative and non-finite to 0", () => {
    assert.equal(spendableEnergy({ energy: -13 }), 0);
    assert.equal(spendableEnergy({ energy: Number.NaN }), 0);
    assert.equal(spendableEnergy({ energy: 7.9 }), 7);
  });

  it("overspend input is clipped by sanitize; energy ends at 0 not negative", () => {
    const game = createInitialGame("room", []);
    game.phase = "INVESTMENT";
    game.activeProjects = [shortProject(1)];
    const p = makePlayer("a", { energy: 5 });
    game.players = [p];

    assert.equal(applyInvestments(game, "a", { 1: 99 }, "player"), true);
    assert.equal(p.energy, 0);
    assert.equal(p.investment[1], 5);
  });

  it("legal full spend leaves energy at 0 not negative", () => {
    const game = createInitialGame("room", []);
    game.phase = "INVESTMENT";
    game.activeProjects = [shortProject(1), shortProject(2)];
    const p = makePlayer("a", { energy: 13 });
    game.players = [p];

    assert.equal(applyInvestments(game, "a", { 1: 8, 2: 5 }, "player"), true);
    assert.equal(p.energy, 0);
    assert.ok(p.energy >= 0);
    assert.equal(p.investment[1], 8);
    assert.equal(p.investment[2], 5);
  });

  it("unsanitized overspend input never drives energy negative", () => {
    const game = createInitialGame("room", []);
    game.phase = "INVESTMENT";
    game.activeProjects = [shortProject(1)];
    const p = makePlayer("a", { energy: 10 });
    game.players = [p];

    assert.equal(applyInvestments(game, "a", { 1: 10, 2: 999 } as Record<number, number>, "player"), true);
    assert.equal(p.energy, 0);
    assert.deepEqual(p.investment, { 1: 10 });
  });

  it("sanitizeInvestments uses spendable pool when book energy is already negative", () => {
    const game = createInitialGame("room", []);
    game.activeProjects = [shortProject(1)];
    const p = makePlayer("a", { energy: -13 });
    game.players = [p];

    const sanitized = sanitizeInvestments(game, p, { 1: 5 });
    assert.deepEqual(sanitized, {});
    assert.equal(applyInvestments(game, "a", { 1: 5 }, "player"), true);
    assert.equal(p.energy, -13);
    assert.deepEqual(p.investment, {});
  });
});
