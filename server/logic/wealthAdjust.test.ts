import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  claimWealthAdjustResponse,
  proposeWealthAdjust,
  revokeWealthAdjustOffer,
} from "./wealthAdjust.js";
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

describe("wealthAdjust propose/accept/decline/revoke", () => {
  it("accepts and credits wealth", () => {
    const game = createInitialGame("room", []);
    const p = player("p1", { wealth: 100 });
    game.players = [p];
    const proposed = proposeWealthAdjust(game, "p1", 50);
    assert.equal(proposed.ok, true);
    if (!proposed.ok) throw new Error("expected ok");
    assert.equal(p.wealth, 100);

    const claimed = claimWealthAdjustResponse(game, "p1", proposed.offer.offerId, true);
    assert.equal(claimed.ok, true);
    if (!claimed.ok) throw new Error("expected ok");
    assert.equal(claimed.delta, 50);
    assert.equal(p.wealth, 150);
    assert.equal(game.pendingWealthAdjustments?.length ?? 0, 0);
  });

  it("decline leaves wealth unchanged", () => {
    const game = createInitialGame("room", []);
    const p = player("p1", { wealth: 100 });
    game.players = [p];
    const proposed = proposeWealthAdjust(game, "p1", -30);
    assert.equal(proposed.ok, true);
    if (!proposed.ok) throw new Error("expected ok");

    const claimed = claimWealthAdjustResponse(game, "p1", proposed.offer.offerId, false);
    assert.equal(claimed.ok, true);
    assert.equal(p.wealth, 100);
    assert.equal(game.pendingWealthAdjustments?.length ?? 0, 0);
  });

  it("revoke prevents later accept", () => {
    const game = createInitialGame("room", []);
    const p = player("p1", { wealth: 100 });
    game.players = [p];
    const proposed = proposeWealthAdjust(game, "p1", 20);
    assert.equal(proposed.ok, true);
    if (!proposed.ok) throw new Error("expected ok");
    const offerId = proposed.offer.offerId;

    const revoked = revokeWealthAdjustOffer(game, "p1");
    assert.equal(revoked.ok, true);

    const claimed = claimWealthAdjustResponse(game, "p1", offerId, true);
    assert.equal(claimed.ok, false);
    assert.equal(p.wealth, 100);
  });

  it("rejects zero and non-integer delta", () => {
    const game = createInitialGame("room", []);
    game.players = [player("p1")];
    assert.equal(proposeWealthAdjust(game, "p1", 0).ok, false);
    assert.equal(proposeWealthAdjust(game, "p1", 1.5).ok, false);
    assert.equal(proposeWealthAdjust(game, "p1", "10").ok, false);
  });

  it("rejects AI targets", () => {
    const game = createInitialGame("room", []);
    game.players = [player("ai_bot", { isAI: true }), player("ai_name", { name: "🤖bot" })];
    assert.equal(proposeWealthAdjust(game, "ai_bot", 10).ok, false);
    assert.equal(proposeWealthAdjust(game, "ai_name", 10).ok, false);
  });
});
