import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyLotteryAccept,
  claimLotteryResponse,
  createLotteryOffer,
  playerHasLotteryBuff,
  proposeLotterySettle,
  revokeLotteryGrant,
} from "./lotterySettle.js";
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
    usedCards: ["buff_lottery"],
    activeBuffs: [{ cardId: "buff_lottery" }],
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

describe("lottery settle propose/confirm/revoke", () => {
  it("replaces a pending offer for the same player", () => {
    const game = createInitialGame("room", []);
    const p = player("p1");
    game.players = [p];
    const first = proposeLotterySettle(game, "p1", 30);
    assert.equal(first.ok, true);
    const second = proposeLotterySettle(game, "p1", -10);
    assert.equal(second.ok, true);
    if (!second.ok) throw new Error("expected propose");
    assert.equal(second.replaced?.amount, 30);
    assert.equal(game.pendingLotteryOffers?.length, 1);
    assert.equal(game.pendingLotteryOffers?.[0]?.amount, -10);
  });

  it("credits wealth and removes lottery buff on accept", () => {
    const game = createInitialGame("room", []);
    const p = player("p1");
    game.players = [p];
    const { offer } = createLotteryOffer(game, "p1", 40);
    const claimed = claimLotteryResponse(game, "p1", offer.offerId, true);
    assert.equal(claimed.ok, true);
    if (!claimed.ok) throw new Error("expected claim");
    const settled = applyLotteryAccept(game, p, claimed.amount);
    assert.equal(settled.enteredAmount, 40);
    assert.equal(settled.creditedAmount, 40);
    assert.equal(settled.goldApplied, false);
    assert.equal(p.wealth, 140);
    assert.equal(playerHasLotteryBuff(p), false);
    assert.equal(game.lotteryCompletedDeals?.[0]?.amount, 40);
    assert.equal(game.lotteryCompletedDeals?.[0]?.enteredAmount, 40);
    assert.equal(game.pendingLotteryOffers?.length, 0);
  });

  it("applies gold multiplier to credited amount when buff_gold is active", () => {
    const game = createInitialGame("room", []);
    const p = player("p1", {
      activeBuffs: [{ cardId: "buff_lottery" }, { cardId: "buff_gold" }],
    });
    game.players = [p];
    const settled = applyLotteryAccept(game, p, 100);
    assert.equal(settled.enteredAmount, 100);
    assert.equal(settled.creditedAmount, 150);
    assert.equal(settled.goldApplied, true);
    assert.equal(p.wealth, 250);
    assert.equal(game.lotteryCompletedDeals?.[0]?.amount, 150);
    assert.equal(game.lotteryCompletedDeals?.[0]?.enteredAmount, 100);
    assert.equal(game.lotteryCompletedDeals?.[0]?.goldApplied, true);
  });

  it("leaves wealth unchanged on decline", () => {
    const game = createInitialGame("room", []);
    const p = player("p1");
    game.players = [p];
    const { offer } = createLotteryOffer(game, "p1", 40);
    const claimed = claimLotteryResponse(game, "p1", offer.offerId, false);
    assert.equal(claimed.ok, true);
    assert.equal(p.wealth, 100);
    assert.equal(playerHasLotteryBuff(p), true);
    assert.equal(game.pendingLotteryOffers?.length, 0);
  });

  it("cancels pending offer on revoke", () => {
    const game = createInitialGame("room", []);
    const p = player("p1");
    game.players = [p];
    proposeLotterySettle(game, "p1", 12);
    const result = revokeLotteryGrant(game, "p1");
    assert.equal(result.ok, true);
    if (!result.ok || result.kind !== "pending") throw new Error("expected pending revoke");
    assert.equal(game.pendingLotteryOffers?.length, 0);
    assert.equal(p.wealth, 100);
    assert.equal(playerHasLotteryBuff(p), true);
  });

  it("reverses wealth and restores buff when revoking completed lottery", () => {
    const game = createInitialGame("room", []);
    const p = player("p1", { wealth: 140, activeBuffs: [] });
    game.players = [p];
    applyLotteryAccept(game, p, 40);
    assert.equal(p.wealth, 180);
    const result = revokeLotteryGrant(game, "p1");
    assert.equal(result.ok, true);
    if (!result.ok || result.kind !== "completed") throw new Error("expected completed revoke");
    assert.equal(p.wealth, 140);
    assert.equal(playerHasLotteryBuff(p), true);
    assert.equal(game.lotteryCompletedDeals?.length, 0);
  });

  it("rejects propose when player has no lottery buff", () => {
    const game = createInitialGame("room", []);
    game.players = [player("p1", { activeBuffs: [] })];
    const result = proposeLotterySettle(game, "p1", 10);
    assert.equal(result.ok, false);
  });

  it("keeps the pending offer if accept fails because the buff is gone", () => {
    const game = createInitialGame("room", []);
    const p = player("p1", { activeBuffs: [] });
    game.players = [p];
    const { offer } = createLotteryOffer(game, "p1", 40);
    const claimed = claimLotteryResponse(game, "p1", offer.offerId, true);
    assert.equal(claimed.ok, false);
    assert.equal(game.pendingLotteryOffers?.length, 1);
    assert.equal(p.wealth, 100);
  });

  it("allows proposing while the player is offline", () => {
    const game = createInitialGame("room", []);
    game.players = [player("p1", { socketId: undefined, connected: false })];
    const result = proposeLotterySettle(game, "p1", 8);
    assert.equal(result.ok, true);
    assert.equal(game.pendingLotteryOffers?.[0]?.amount, 8);
  });
});
