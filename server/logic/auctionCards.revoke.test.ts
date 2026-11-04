import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createAuctionOffer,
  isAuctionCardAvailable,
  markAuctionCardDistributed,
  recordAuctionCompletedDeal,
  revokeAuctionGrant,
  beginAuctionSession,
  publicSessionAuctionWins,
} from "./auctionCards.js";
import { useForceBuyCard, FORCE_BUY_CARD_ID } from "./buffLogic.js";
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

describe("revokeAuctionGrant", () => {
  it("refunds wealth, removes card, and reopens pool when completed", () => {
    const game = createInitialGame("room", []);
    game.phase = "AUCTION";
    game.currentEra = 2;
    const p = player("p1", { wealth: 80, inventory: ["buff_gold"] });
    game.players = [p];
    markAuctionCardDistributed(game, "buff_gold");
    recordAuctionCompletedDeal(game, "buff_gold", "p1", 20);

    const result = revokeAuctionGrant(game, "buff_gold");
    assert.equal(result.ok, true);
    if (!result.ok || result.kind !== "completed") throw new Error("expected completed revoke");
    assert.equal(p.wealth, 100);
    assert.deepEqual(p.inventory, []);
    assert.equal(isAuctionCardAvailable(game, "buff_gold"), true);
    assert.equal(game.auctionCompletedDeals?.length, 0);
  });

  it("cancels pending offer and keeps card available", () => {
    const game = createInitialGame("room", []);
    game.phase = "AUCTION";
    game.currentEra = 2;
    game.players = [player("p1")];
    createAuctionOffer(game, "p1", "buff_gold", 15);
    assert.equal(game.pendingAuctionOffers?.length, 1);

    const result = revokeAuctionGrant(game, "buff_gold");
    assert.equal(result.ok, true);
    if (!result.ok || result.kind !== "pending") throw new Error("expected pending revoke");
    assert.equal(game.pendingAuctionOffers?.length, 0);
    assert.equal(isAuctionCardAvailable(game, "buff_gold"), true);

    createAuctionOffer(game, "p1", "buff_gold", 20);
    assert.equal(game.pendingAuctionOffers?.[0]?.cost, 20);
  });

  it("revokes completed deal without deal record by reclaiming from inventory", () => {
    const game = createInitialGame("room", []);
    game.phase = "AUCTION";
    game.currentEra = 2;
    const p = player("p1", { wealth: 80, inventory: ["buff_gold"] });
    game.players = [p];
    markAuctionCardDistributed(game, "buff_gold");
    // 故意不写 auctionCompletedDeals（旧局数据）

    const result = revokeAuctionGrant(game, "buff_gold");
    assert.equal(result.ok, true);
    if (!result.ok || result.kind !== "completed") throw new Error("expected completed revoke");
    assert.equal(result.cost, 0);
    assert.deepEqual(p.inventory, []);
    assert.equal(p.wealth, 80);
    assert.equal(isAuctionCardAvailable(game, "buff_gold"), true);
  });

  it("clears distributed flag when no holder and no deal", () => {
    const game = createInitialGame("room", []);
    game.phase = "AUCTION";
    game.currentEra = 2;
    game.players = [player("p1")];
    markAuctionCardDistributed(game, "buff_gold");

    const result = revokeAuctionGrant(game, "buff_gold");
    assert.equal(result.ok, true);
    if (!result.ok || result.kind !== "completed") throw new Error("expected completed revoke");
    assert.equal(isAuctionCardAvailable(game, "buff_gold"), true);
  });

  it("refunds deal cost and clears when deal player no longer holds card", () => {
    const game = createInitialGame("room", []);
    game.phase = "AUCTION";
    game.currentEra = 2;
    const p = player("p1", { wealth: 80, inventory: [] });
    game.players = [p];
    markAuctionCardDistributed(game, "buff_gold");
    recordAuctionCompletedDeal(game, "buff_gold", "p1", 20);

    const result = revokeAuctionGrant(game, "buff_gold");
    assert.equal(result.ok, true);
    if (!result.ok || result.kind !== "completed") throw new Error("expected completed revoke");
    assert.equal(result.cost, 20);
    assert.equal(p.wealth, 100);
    assert.equal(isAuctionCardAvailable(game, "buff_gold"), true);
  });

  it("reclaims from inventory holder but refunds deal player", () => {
    const game = createInitialGame("room", []);
    game.phase = "AUCTION";
    game.currentEra = 2;
    const payer = player("p1", { wealth: 80, inventory: [] });
    const holder = player("p2", { wealth: 50, inventory: ["buff_gold"] });
    game.players = [payer, holder];
    markAuctionCardDistributed(game, "buff_gold");
    recordAuctionCompletedDeal(game, "buff_gold", "p1", 20);

    const result = revokeAuctionGrant(game, "buff_gold");
    assert.equal(result.ok, true);
    if (!result.ok || result.kind !== "completed") throw new Error("expected completed revoke");
    assert.equal(payer.wealth, 100);
    assert.deepEqual(holder.inventory, []);
    assert.equal(holder.wealth, 50);
    assert.equal(isAuctionCardAvailable(game, "buff_gold"), true);
  });

  it("rejects outside auction phase", () => {
    const game = createInitialGame("room", []);
    game.phase = "INVESTMENT";
    game.currentEra = 2;
    markAuctionCardDistributed(game, "buff_gold");
    recordAuctionCompletedDeal(game, "buff_gold", "p1", 10);
    const result = revokeAuctionGrant(game, "buff_gold");
    assert.equal(result.ok, false);
  });

  it("revoking a force-buy deal restores the force-buy card for reuse", () => {
    const game = createInitialGame("room", []);
    game.phase = "AUCTION";
    game.currentEra = 3;
    const p = player("p1", {
      inventory: [FORCE_BUY_CARD_ID],
      usedCards: [],
      buffRoundNotes: [],
    });
    game.players = [p];
    beginAuctionSession(game);
    game.auctionFocusCardId = "buff_short";

    const used = useForceBuyCard(game, "p1");
    assert.equal(used.success, true);
    assert.ok(p.inventory.includes("buff_short"));
    assert.ok(!p.inventory.includes(FORCE_BUY_CARD_ID));
    assert.ok((game.forceBuyUsedPlayerIds ?? []).includes("p1"));

    const revoked = revokeAuctionGrant(game, "buff_short");
    assert.equal(revoked.ok, true);
    if (!revoked.ok || revoked.kind !== "completed") throw new Error("expected completed revoke");
    assert.equal(revoked.cost, 0);
    assert.deepEqual(p.inventory, [FORCE_BUY_CARD_ID]);
    assert.equal((game.forceBuyUsedPlayerIds ?? []).includes("p1"), false);
    assert.equal(p.usedCards.includes(FORCE_BUY_CARD_ID), false);
    assert.equal(
      (p.buffRoundNotes ?? []).some((n) => n.cardId === FORCE_BUY_CARD_ID),
      false
    );
    assert.equal(isAuctionCardAvailable(game, "buff_short"), true);

    game.auctionFocusCardId = "buff_work_rest";
    const reuse = useForceBuyCard(game, "p1");
    assert.equal(reuse.success, true);
    assert.ok(p.inventory.includes("buff_work_rest"));
    assert.ok(!p.inventory.includes(FORCE_BUY_CARD_ID));
  });

  it("keeps slack deals per auction round; revoke only current session copy", () => {
    const game = createInitialGame("room", []);
    game.phase = "AUCTION";
    game.currentEra = 2;
    const p = player("p1", { wealth: 90, inventory: ["buff_slack"] });
    game.players = [p];
    markAuctionCardDistributed(game, "buff_slack");
    recordAuctionCompletedDeal(game, "buff_slack", "p1", 10);
    assert.equal(game.auctionCompletedDeals?.length, 1);
    assert.equal(game.auctionCompletedDeals?.[0]?.auctionRound, 1);

    beginAuctionSession(game);
    game.currentEra = 3;
    const p2 = player("p2", { wealth: 80, inventory: ["buff_slack", "buff_slack"] });
    game.players = [p, p2];
    markAuctionCardDistributed(game, "buff_slack");
    recordAuctionCompletedDeal(game, "buff_slack", "p2", 15);
    assert.equal(game.auctionCompletedDeals?.length, 2);

    const revoked = revokeAuctionGrant(game, "buff_slack");
    assert.equal(revoked.ok, true);
    if (!revoked.ok || revoked.kind !== "completed") throw new Error("expected completed revoke");
    assert.equal(game.auctionCompletedDeals?.length, 1);
    assert.equal(game.auctionCompletedDeals?.[0]?.auctionRound, 1);
    assert.equal(game.auctionCompletedDeals?.[0]?.playerId, "p1");
    assert.deepEqual(p2.inventory, ["buff_slack"]);
    assert.equal(p2.wealth, 95);
    assert.deepEqual(p.inventory, ["buff_slack"]);
  });
});

describe("publicSessionAuctionWins", () => {
  it("lists all completed deals across auction rounds; revoke shrinks list", () => {
    const game = createInitialGame("room", []);
    game.phase = "AUCTION";
    game.currentEra = 3;
    game.players = [player("p1"), player("p2", { wealth: 70, inventory: ["buff_short"] })];
    game.auctionCompletedDeals = [
      { cardId: "buff_gold", playerId: "p1", cost: 20, auctionRound: 1 },
      { cardId: "buff_short", playerId: "p2", cost: 30, auctionRound: 2 },
    ];
    markAuctionCardDistributed(game, "buff_short");

    let wins = publicSessionAuctionWins(game);
    assert.equal(wins.length, 2);
    assert.equal(wins[0].cardId, "buff_gold");
    assert.equal(wins[1].cardId, "buff_short");

    const revoked = revokeAuctionGrant(game, "buff_short");
    assert.equal(revoked.ok, true);
    wins = publicSessionAuctionWins(game);
    assert.equal(wins.length, 1);
    assert.equal(wins[0].playerId, "p1");
    assert.equal(wins[0].cardId, "buff_gold");
  });
});
