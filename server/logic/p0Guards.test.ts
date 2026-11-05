import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { serializeGameForClient } from "../network/broadcast.js";
import { createInitialGame, getCommunityNamer, Player } from "../state/gameState.js";

function player(id: string, overrides: Partial<Player> = {}): Player {
  return {
    id,
    name: id,
    energy: 15,
    wealth: 100,
    connected: true,
    ready: false,
    rank: 0,
    investment: { 1: 3 },
    investmentDraft: { 1: 2 },
    longTerm: {},
    riskGains: {},
    inventory: [],
    usedCards: [],
    activeBuffs: [],
    slackedBy: [],
    totalEnergyConsumed: 15,
    wealthHistory: [0],
    investedRiskEnergy: 0,
    investedLongEnergy: 0,
    investedShortEnergy: 0,
    socialRank: null,
    reconnectToken: "secret",
    ...overrides,
  };
}

describe("investment visibility", () => {
  it("hides other players' drafts and submitted investments during the decision phases", () => {
    const game = createInitialGame("room", []);
    game.phase = "INVESTMENT";
    game.players = [player("me"), player("them")];

    const mine = serializeGameForClient(game, {}, "me");
    const meView = mine.players.find((p) => p.id === "them");
    const selfView = mine.players.find((p) => p.id === "me");
    assert.equal(meView?.investmentDraft, undefined);
    assert.deepEqual(meView?.investment, {});
    assert.equal("energy" in (meView ?? {}), false);
    assert.equal(typeof selfView?.energy, "number");
    assert.deepEqual(selfView?.investmentDraft, { 1: 2 });
    assert.deepEqual(selfView?.investment, { 1: 3 });
    assert.equal("reconnectToken" in (selfView ?? {}), false);
    assert.equal("pendingAuctionOffers" in mine, false);
    assert.equal("pendingLotteryOffers" in mine, false);
    assert.equal("lotteryCompletedDeals" in mine, false);
    assert.equal("pendingLotteryOffer" in mine, false);
    assert.equal("auctionCompletedDeals" in mine, false);
    assert.equal("auctionBids" in mine, false);
    assert.equal("sessionTelemetry" in mine, false);
    assert.equal(Array.isArray((mine as { settlementHistory?: unknown[] }).settlementHistory), true);

    game.auctionCompletedDeals = [
      { cardId: "buff_gold", playerId: "them", cost: 25, auctionRound: 1 },
    ];
    const withWins = serializeGameForClient(game, {}, "me") as {
      auctionSessionWins?: { cardId: string; playerId: string }[];
      auctionCompletedDeals?: unknown;
    };
    assert.equal("auctionCompletedDeals" in withWins, false);
    assert.equal(withWins.auctionSessionWins?.length, 1);
    assert.equal(withWins.auctionSessionWins?.[0]?.playerId, "them");

    game.pendingLotteryOffers = [{ offerId: "lot1", playerId: "me", amount: 7 }];
    const mineLottery = serializeGameForClient(game, {}, "me");
    const themLottery = serializeGameForClient(game, {}, "them");
    assert.equal((mineLottery as { pendingLotteryOffer?: { amount: number } }).pendingLotteryOffer?.amount, 7);
    assert.equal("pendingLotteryOffers" in mineLottery, false);
    assert.equal("pendingLotteryOffer" in themLottery, false);

    game.pendingWealthAdjustments = [{ offerId: "w1", playerId: "me", delta: 50 }];
    const mineWealth = serializeGameForClient(game, {}, "me");
    const themWealth = serializeGameForClient(game, {}, "them");
    assert.equal(
      (mineWealth as { pendingWealthAdjustment?: { delta: number } }).pendingWealthAdjustment?.delta,
      50
    );
    assert.equal("pendingWealthAdjustments" in mineWealth, false);
    assert.equal("pendingWealthAdjustment" in themWealth, false);

    const god = serializeGameForClient(game, { isGodView: true }, null);
    const godThem = god.players.find((p) => p.id === "them");
    assert.deepEqual(godThem?.investmentDraft, { 1: 2 });
    assert.deepEqual(godThem?.investment, { 1: 3 });
    assert.equal(Array.isArray((god as { pendingLotteryOffers?: unknown }).pendingLotteryOffers), true);
    assert.equal(Array.isArray((god as { lotteryCompletedDeals?: unknown }).lotteryCompletedDeals), true);
    assert.equal(Array.isArray((god as { pendingAuctionOffers?: unknown }).pendingAuctionOffers), true);
    assert.equal(Array.isArray((god as { auctionCompletedDeals?: unknown }).auctionCompletedDeals), true);
    assert.equal(Array.isArray((god as { pendingWealthAdjustments?: unknown }).pendingWealthAdjustments), true);
  });
});

describe("community namer", () => {
  it("skips offline players and server-hosted AI flags in the lab build", () => {
    const game = createInitialGame("room", []);
    game.players = [
      player("rich-offline", { wealth: 500, connected: false }),
      player("bot", { wealth: 400, isAI: true }),
      player("online", { wealth: 100 }),
      player("poorer", { wealth: 50 }),
    ];
    // 实验室版由外部 Agent 作为普通玩家入座；服务端 isAI 标记的座位不参与命名
    assert.equal(getCommunityNamer(game)?.id, "online");
  });
});
