import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { STARTING_WEALTH } from "../config/startingWealth.js";
import { createInitialGame, Player, resetGameSession } from "./gameState.js";

function seatedPlayer(id: string, overrides: Partial<Player> = {}): Player {
  return {
    id,
    name: id,
    energy: 8,
    wealth: 999,
    connected: true,
    ready: true,
    rank: 2,
    investment: { 1: 5 },
    longTerm: {},
    riskGains: {},
    inventory: ["card-a"],
    usedCards: [],
    activeBuffs: [],
    slackedBy: [],
    coffeePurchasesThisRound: 2,
    totalEnergyConsumed: 20,
    wealthHistory: [STARTING_WEALTH, 200, 999],
    investedRiskEnergy: 3,
    investedLongEnergy: 0,
    investedShortEnergy: 5,
    socialRank: null,
    reconnectToken: "tok",
    ...overrides,
  };
}

describe("starting wealth on session reset", () => {
  it("resetGameSession gives each player STARTING_WEALTH and fresh history", () => {
    const game = createInitialGame("room-1", []);
    game.players = [seatedPlayer("p1"), seatedPlayer("p2", { name: "Bob", id: "p2" })];
    game.phase = "INVESTMENT";
    game.globalRound = 3;

    resetGameSession(game);

    for (const p of game.players) {
      assert.equal(p.wealth, STARTING_WEALTH);
      assert.deepEqual(p.wealthHistory, [STARTING_WEALTH]);
      assert.deepEqual(p.investment, {});
      assert.equal(p.ready, false);
    }
    assert.equal(game.phase, "ROOM_WAITING");
  });
});
