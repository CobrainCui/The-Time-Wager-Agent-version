import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  COFFEE_ENERGY_GAIN,
  COFFEE_WEALTH_COST,
  purchaseCoffee,
  refundCoffee,
} from "./coffeeLogic.js";
import { serializeGameForClient } from "../network/broadcast.js";
import { STARTING_WEALTH } from "../config/startingWealth.js";
import { createInitialGame, Player } from "../state/gameState.js";

function makePlayer(id: string, overrides: Partial<Player> = {}): Player {
  return {
    id,
    name: id,
    energy: 15,
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
    coffeePurchasesThisRound: 0,
    totalEnergyConsumed: 15,
    wealthHistory: [STARTING_WEALTH],
    investedRiskEnergy: 0,
    investedLongEnergy: 0,
    investedShortEnergy: 0,
    socialRank: null,
    reconnectToken: "tok",
    ...overrides,
  };
}

describe("coffee purchase and refund", () => {
  it("purchaseCoffee updates wealth, energy, and coffeePurchasesThisRound", () => {
    const game = createInitialGame("room", []);
    game.phase = "INVESTMENT";
    const player = makePlayer("p1");
    game.players = [player];

    const result = purchaseCoffee(game, player);
    assert.equal(result.ok, true);
    assert.equal(player.wealth, 100 - COFFEE_WEALTH_COST);
    assert.equal(player.energy, 15 + COFFEE_ENERGY_GAIN);
    assert.equal(player.coffeePurchasesThisRound, 1);
  });

  it("refundCoffee restores resources when draft fits", () => {
    const game = createInitialGame("room", []);
    game.phase = "BUFF_USAGE";
    const player = makePlayer("p1", {
      wealth: 85,
      energy: 16,
      coffeePurchasesThisRound: 1,
      investmentDraft: { 1: 5 },
    });
    game.players = [player];
    game.activeProjects = [];

    const result = refundCoffee(game, player, 1);
    assert.equal(result.ok, true);
    assert.equal(player.wealth, 85 + COFFEE_WEALTH_COST);
    assert.equal(player.energy, 16 - COFFEE_ENERGY_GAIN);
    assert.equal(player.coffeePurchasesThisRound, 0);
  });

  it("purchaseCoffee rejects when wealth is below cost and does not go negative", () => {
    const game = createInitialGame("room", []);
    game.phase = "INVESTMENT";
    const player = makePlayer("p1", { wealth: COFFEE_WEALTH_COST - 1 });
    game.players = [player];

    const result = purchaseCoffee(game, player);
    assert.equal(result.ok, false);
    assert.equal(player.wealth, COFFEE_WEALTH_COST - 1);
    assert.equal(player.coffeePurchasesThisRound, 0);
  });

  it("purchaseCoffee rejects when wealth is already negative", () => {
    const game = createInitialGame("room", []);
    game.phase = "INVESTMENT";
    const player = makePlayer("p1", { wealth: -70 });
    game.players = [player];

    const result = purchaseCoffee(game, player);
    assert.equal(result.ok, false);
    assert.equal(player.wealth, -70);
  });

  it("refundCoffee from negative book can go lower but not from zero", () => {
    const game = createInitialGame("room", []);
    game.phase = "BUFF_USAGE";
    const neg = makePlayer("neg", {
      wealth: 85,
      energy: -5,
      coffeePurchasesThisRound: 1,
      investmentDraft: {},
    });
    game.players = [neg];
    game.activeProjects = [];
    const ok = refundCoffee(game, neg, 1);
    assert.equal(ok.ok, true);
    assert.equal(neg.energy, -6);

    const zero = makePlayer("zero", {
      wealth: 85,
      energy: 0,
      coffeePurchasesThisRound: 1,
      investmentDraft: {},
    });
    game.players = [zero];
    const blocked = refundCoffee(game, zero, 1);
    assert.equal(blocked.ok, false);
    assert.equal(zero.energy, 0);
  });

  it("refundCoffee floors energy at 0", () => {
    const game = createInitialGame("room", []);
    game.phase = "BUFF_USAGE";
    const player = makePlayer("p1", {
      wealth: 85,
      energy: 0,
      coffeePurchasesThisRound: 1,
      investmentDraft: {},
    });
    game.players = [player];
    game.activeProjects = [];

    // draftSum=0, energyAfter=-1 < 0 → 应拒绝；若绕过则封底仍为 0
    const result = refundCoffee(game, player, 1);
    assert.equal(result.ok, false);
    assert.equal(player.energy, 0);
  });
});

describe("coffee in gameUpdate payload", () => {
  it("serializeGameForClient includes coffeePurchasesThisRound for viewer", () => {
    const game = createInitialGame("room", []);
    game.phase = "INVESTMENT";
    const me = makePlayer("me", { coffeePurchasesThisRound: 2 });
    game.players = [me, makePlayer("other", { coffeePurchasesThisRound: 0 })];

    const payload = serializeGameForClient(game, {}, "me");
    const self = payload.players.find((p) => p.id === "me");
    assert.ok(self);
    assert.equal(self!.coffeePurchasesThisRound, 2);
  });
});
