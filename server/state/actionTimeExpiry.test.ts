import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ACTION_DEADLINE_MS } from "./actionDeadline.js";
import { handleActionTimeExpired } from "./actionTimeExpiry.js";
import { createInitialGame, Player } from "./gameState.js";

function makePlayer(id: string): Player {
  return {
    id,
    name: id,
    energy: 10,
    wealth: 100,
    connected: true,
    ready: false,
    rank: 0,
    investment: {},
    investmentDraft: { 1: 2 },
    longTerm: {},
    riskGains: {},
    inventory: [],
    usedCards: [],
    activeBuffs: [],
    slackedBy: [],
    coffeePurchasesThisRound: 0,
    totalEnergyConsumed: 10,
    wealthHistory: [0],
    investedRiskEnergy: 0,
    investedLongEnergy: 0,
    investedShortEnergy: 0,
    socialRank: null,
    reconnectToken: "tok",
  };
}

describe("handleActionTimeExpired", () => {
  it("clears stale investmentEndsAt during BUFF_USAGE", () => {
    const game = createInitialGame("room", []);
    game.phase = "BUFF_USAGE";
    game.investmentEndsAt = Date.now() + 60_000;
    assert.equal(handleActionTimeExpired(game), true);
    assert.equal(game.investmentEndsAt, undefined);
  });

  it("auto-submits and leaves INVESTMENT when deadline passed", () => {
    const game = createInitialGame("room", []);
    game.phase = "INVESTMENT";
    game.activeProjects = [
      {
        id: 1,
        name: "P1",
        type: "short",
        maxEnergy: 20,
        accumulatedInvested: 0,
        currentInvested: 0,
        roundsNoInvestment: 0,
        investedThisRound: false,
        investorRecords: {},
        earningRecords: {},
        totalPayout: 0,
      },
    ];
    const p = makePlayer("p1");
    game.players = [p];
    game.investmentEndsAt = Date.now() - 1;

    const changed = handleActionTimeExpired(game);
    assert.equal(changed, true);
    assert.equal(game.investmentEndsAt, undefined);
    assert.equal(game.phase, "SETTLEMENT");
  });

  it("does nothing while paused even if endsAt is in the past", () => {
    const game = createInitialGame("room", []);
    game.phase = "INVESTMENT";
    game.players = [makePlayer("p1")];
    game.investmentEndsAt = Date.now() - 1;
    game.investmentTimerPausedAt = Date.now() - 60_000;
    assert.equal(handleActionTimeExpired(game), false);
    assert.equal(game.phase, "INVESTMENT");
    assert.ok(game.investmentEndsAt);
  });
});
