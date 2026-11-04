import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isInvestmentComplete,
  togglePlayerReady,
  unlockSubmittedInvestment,
} from "./gameActions.js";
import { createInitialGame, Player } from "./gameState.js";

function player(id: string, overrides: Partial<Player> = {}): Player {
  return {
    id,
    name: id,
    energy: 20,
    wealth: 100,
    connected: true,
    ready: false,
    rank: 0,
    investment: {},
    longTerm: {},
    riskGains: {},
    inventory: [],
    usedCards: [],
    activeBuffs: [],
    slackedBy: [],
    coffeePurchasesThisRound: 0,
    totalEnergyConsumed: 0,
    wealthHistory: [100],
    investedRiskEnergy: 0,
    investedLongEnergy: 0,
    investedShortEnergy: 0,
    socialRank: null,
    ...overrides,
  };
}

describe("gameActions investment unlock", () => {
  it("unlockSubmittedInvestment clears ready while timer running", () => {
    const game = createInitialGame("r", []);
    game.phase = "INVESTMENT";
    game.investmentEndsAt = Date.now() + 60_000;
    const p = player("p", { ready: true, investment: { 1: 3 }, investmentDraft: { 1: 3 } });
    game.players = [p];
    game.readyPlayers.add("p");

    const res = unlockSubmittedInvestment(game, "p");
    assert.equal(res.ok, true);
    assert.equal(p.ready, false);
    assert.equal(game.readyPlayers.has("p"), false);
  });

  it("unlockSubmittedInvestment rejects when timer ended", () => {
    const game = createInitialGame("r", []);
    game.phase = "INVESTMENT";
    game.investmentEndsAt = Date.now() - 1;
    const p = player("p", { ready: true });
    game.players = [p];

    const res = unlockSubmittedInvestment(game, "p");
    assert.equal(res.ok, false);
    if (!res.ok) assert.equal(res.reason, "timer_closed");
    assert.equal(p.ready, true);
  });

  it("isInvestmentComplete only counts connected players", () => {
    const game = createInitialGame("r", []);
    game.phase = "INVESTMENT";
    const online = player("a", { ready: true, connected: true });
    const offline = player("b", { ready: false, connected: false });
    game.players = [online, offline];

    assert.equal(isInvestmentComplete(game), true);
    const waiting = player("c", { ready: false, connected: true });
    game.players = [online, waiting];
    assert.equal(isInvestmentComplete(game), false);
    togglePlayerReady(game, "c");
    assert.equal(isInvestmentComplete(game), true);
  });
});
