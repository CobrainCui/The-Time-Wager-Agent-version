import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { adminAdjustPlayerCard } from "./adminPlayerCard.js";
import { createInitialGame, Player } from "../state/gameState.js";

function player(id: string, overrides: Partial<Player> = {}): Player {
  return {
    id,
    name: id,
    socketId: "sock",
    energy: 10,
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

describe("adminAdjustPlayerCard", () => {
  it("adds card to inventory without touching wealth or auction", () => {
    const game = createInitialGame("room", []);
    const p = player("p1", { wealth: 200, inventory: [] });
    game.players = [p];
    game.phase = "AUCTION";
    game.auctionFocusCardId = "buff_gold";
    game.auctionDistributedCardIds = ["buff_insurance"];

    const result = adminAdjustPlayerCard(game, "p1", "buff_insurance", "add");
    assert.equal(result.ok, true);
    if (!result.ok) throw new Error("expected ok");
    assert.deepEqual(p.inventory, ["buff_insurance"]);
    assert.equal(p.wealth, 200);
    assert.equal(game.auctionFocusCardId, "buff_gold");
    assert.deepEqual(game.auctionDistributedCardIds, ["buff_insurance"]);
  });

  it("allows duplicate adds and remove one leaves another", () => {
    const game = createInitialGame("room", []);
    const p = player("p1", { inventory: ["buff_gold"] });
    game.players = [p];

    assert.equal(adminAdjustPlayerCard(game, "p1", "buff_gold", "add").ok, true);
    assert.deepEqual(p.inventory, ["buff_gold", "buff_gold"]);

    const removed = adminAdjustPlayerCard(game, "p1", "buff_gold", "remove");
    assert.equal(removed.ok, true);
    assert.deepEqual(p.inventory, ["buff_gold"]);
  });

  it("remove by inventory index removes the chosen duplicate", () => {
    const game = createInitialGame("room", []);
    const p = player("p1", { inventory: ["buff_gold", "buff_gold", "buff_slack"] });
    game.players = [p];

    const removed = adminAdjustPlayerCard(game, "p1", "buff_gold", "remove", 1);
    assert.equal(removed.ok, true);
    assert.deepEqual(p.inventory, ["buff_gold", "buff_slack"]);

    const removedFromStringIndex = adminAdjustPlayerCard(game, "p1", "buff_gold", "remove", "0");
    assert.equal(removedFromStringIndex.ok, true);
    assert.deepEqual(p.inventory, ["buff_slack"]);
  });

  it("can remove legacy card id not in grant list", () => {
    const game = createInitialGame("room", []);
    const p = player("p1", { inventory: ["buff_spirit"] });
    game.players = [p];
    const removed = adminAdjustPlayerCard(game, "p1", "buff_spirit", "remove", 0);
    assert.equal(removed.ok, true);
    assert.deepEqual(p.inventory, []);
  });

  it("remove by inventory index rejects stale cardId at index", () => {
    const game = createInitialGame("room", []);
    const p = player("p1", { inventory: ["buff_gold", "buff_slack"] });
    game.players = [p];

    const result = adminAdjustPlayerCard(game, "p1", "buff_gold", "remove", 1);
    assert.equal(result.ok, false);
    if (result.ok) throw new Error("expected fail");
    assert.match(result.message, /手牌已变化/);
    assert.deepEqual(p.inventory, ["buff_gold", "buff_slack"]);
  });

  it("remove fails when card not in hand", () => {
    const game = createInitialGame("room", []);
    game.players = [player("p1", { inventory: [] })];
    const result = adminAdjustPlayerCard(game, "p1", "buff_slack", "remove");
    assert.equal(result.ok, false);
    if (result.ok) throw new Error("expected fail");
    assert.match(result.message, /手牌/);
  });

  it("rejects invalid card and AI targets", () => {
    const game = createInitialGame("room", []);
    game.players = [player("p1"), player("ai1", { isAI: true })];
    assert.equal(adminAdjustPlayerCard(game, "p1", "buff_spirit", "add").ok, false);
    assert.equal(adminAdjustPlayerCard(game, "p1", "", "add").ok, false);
    assert.equal(adminAdjustPlayerCard(game, "ai1", "buff_gold", "add").ok, false);
    assert.equal(adminAdjustPlayerCard(game, "p1", "buff_gold", "grant").ok, false);
  });
});
