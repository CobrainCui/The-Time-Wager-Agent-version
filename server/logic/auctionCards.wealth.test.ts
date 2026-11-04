import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  beginAuctionSession,
  formatAuctionSoldMessage,
  getMinimumNextBid,
  hammerAuctionLot,
  passAuctionLot,
  placeAuctionBid,
  playerAuctionAvailableWealth,
  playerAvailableWealth,
  playerPendingTransferOutWealth,
} from "./auctionCards.js";
import { useForceBuyCard } from "./buffLogic.js";
import { serializeGameForClient } from "../network/broadcast.js";
import { createInitialGame, Player } from "../state/gameState.js";
import { resolvePendingTransfer } from "./transferResolve.js";

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

describe("公开加价与确认成交", () => {
  function startFocusedAuction(game: ReturnType<typeof createInitialGame>, focusId = "buff_insurance") {
    beginAuctionSession(game);
    game.auctionFocusCardId = focusId;
  }

  it("开场不默认正在拍，至少要出到 5（选定后）", () => {
    const game = createInitialGame("room", []);
    game.phase = "AUCTION";
    game.currentEra = 2;
    game.players = [player("p1")];
    beginAuctionSession(game);
    assert.equal(game.auctionFocusCardId, undefined);
    assert.equal(getMinimumNextBid(game), 5);
    game.auctionFocusCardId = "buff_insurance";
    assert.equal(getMinimumNextBid(game), 5);
  });

  it("加价链更新领先与已被超过", () => {
    const game = createInitialGame("room", []);
    game.phase = "AUCTION";
    game.currentEra = 2;
    game.players = [player("p1"), player("p2")];
    startFocusedAuction(game);

    const a = placeAuctionBid(game, "p1", 5);
    assert.equal(a.ok, true);
    const b = placeAuctionBid(game, "p2", 5);
    assert.equal(b.ok, false);
    if (!b.ok) assert.match(b.message, /至少要出到 10/);

    const c = placeAuctionBid(game, "p2", 10);
    assert.equal(c.ok, true);
    assert.equal(game.auctionBids?.[0]?.status, "outbid");
    assert.equal(game.auctionBids?.[1]?.status, "leading");
    assert.equal(getMinimumNextBid(game), 15);
  });

  it("自己继续加价时会被拒绝（你已暂时领先）", () => {
    const game = createInitialGame("room", []);
    game.phase = "AUCTION";
    game.currentEra = 2;
    const p = player("p1", { wealth: 50 });
    game.players = [p];
    startFocusedAuction(game);
    assert.equal(placeAuctionBid(game, "p1", 40).ok, true);
    assert.equal(playerAuctionAvailableWealth(game, p), 10);
    const again = placeAuctionBid(game, "p1", 45);
    assert.equal(again.ok, false);
    if (!again.ok) assert.match(again.message, /暂时领先/);
  });

  it("跳过最后一张会绕回前面未拍的卡", () => {
    const game = createInitialGame("room", []);
    game.phase = "AUCTION";
    game.currentEra = 2;
    game.players = [player("p1")];
    startFocusedAuction(game);
    assert.equal(game.auctionFocusCardId, "buff_insurance");
    passAuctionLot(game);
    assert.equal(game.auctionFocusCardId, "buff_gold");
    passAuctionLot(game);
    assert.equal(game.auctionFocusCardId, "buff_slack");
    passAuctionLot(game);
    assert.equal(game.auctionFocusCardId, "buff_work_rest");
    passAuctionLot(game);
    // 四张都跳过但仍可拍 → 绕回第一张
    assert.equal(game.auctionFocusCardId, "buff_insurance");
  });

  it("只剩一张时跳过会清掉出价并停在这张", () => {
    const game = createInitialGame("room", []);
    game.phase = "AUCTION";
    game.currentEra = 2;
    game.players = [player("p1", { wealth: 40 })];
    beginAuctionSession(game);
    game.auctionDistributedCardIds = ["buff_gold", "buff_slack", "buff_work_rest"];
    game.auctionFocusCardId = "buff_insurance";
    assert.equal(placeAuctionBid(game, "p1", 5).ok, true);
    const passed = passAuctionLot(game);
    assert.equal(passed.ok, true);
    if (passed.ok) assert.equal(passed.nextFocusId, "buff_insurance");
    assert.equal(game.auctionFocusCardId, "buff_insurance");
    assert.equal(getMinimumNextBid(game), 5);
    assert.equal(game.auctionBids?.some((b) => b.status === "leading"), false);
  });

  it("领先者账面不够时，收下转入后再落槌可以成交", () => {
    const game = createInitialGame("room", []);
    game.phase = "AUCTION";
    game.currentEra = 2;
    const bidder = player("bidder", { wealth: 40 });
    const donor = player("donor", { wealth: 100 });
    game.players = [bidder, donor];
    startFocusedAuction(game);

    assert.equal(placeAuctionBid(game, "bidder", 40).ok, true);
    // 出价之后账面被花掉，落槌时付不起
    bidder.wealth = 10;
    const broke = hammerAuctionLot(game);
    assert.equal(broke.ok, false);

    game.transactions = [
      {
        id: "in",
        fromId: "donor",
        fromName: "donor",
        toId: "bidder",
        toName: "bidder",
        amount: 35,
        note: "",
        status: "pending",
        timestamp: Date.now(),
      },
    ];
    // 转账还没点接收，不能拿去付拍卖
    const pending = hammerAuctionLot(game);
    assert.equal(pending.ok, false);
    assert.equal(bidder.wealth, 10);

    const accepted = resolvePendingTransfer(game, "in", "bidder", true);
    assert.equal(accepted.ok, true);
    if (accepted.ok) assert.equal(accepted.status, "accepted");
    assert.equal(bidder.wealth, 45);
    assert.equal(donor.wealth, 65);

    const sold = hammerAuctionLot(game);
    assert.equal(sold.ok, true);
    if (sold.ok) {
      assert.equal(sold.playerId, "bidder");
      assert.equal(sold.cost, 40);
    }
    assert.equal(bidder.wealth, 5);
    assert.ok(bidder.inventory.includes("buff_insurance"));
  });

  it("确认成交时若领先者可用财富不足则失败", () => {
    const game = createInitialGame("room", []);
    game.phase = "AUCTION";
    game.currentEra = 2;
    const p = player("p1", { wealth: 100 });
    game.players = [p, player("p2")];
    startFocusedAuction(game);
    placeAuctionBid(game, "p1", 50);
    game.transactions = [
      {
        id: "tx1",
        fromId: "p1",
        fromName: "p1",
        toId: "p2",
        toName: "p2",
        amount: 60,
        note: "",
        status: "pending",
        timestamp: Date.now(),
      },
    ];
    // 账面仍 100，但未完成转出 60 → 可用 40 < 50
    const sold = hammerAuctionLot(game);
    assert.equal(sold.ok, false);
    if (!sold.ok) assert.match(sold.message, /付不起/);
  });

  it("确认成交带 expectedBidId 防过期", () => {
    const game = createInitialGame("room", []);
    game.phase = "AUCTION";
    game.currentEra = 2;
    game.players = [player("p1"), player("p2")];
    startFocusedAuction(game);
    placeAuctionBid(game, "p1", 10);
    const staleId = game.auctionBids?.[0]?.bidId;
    placeAuctionBid(game, "p2", 20);
    const fail = hammerAuctionLot(game, { expectedBidId: staleId });
    assert.equal(fail.ok, false);
    if (!fail.ok) assert.match(fail.message, /已变化/);
    const ok = hammerAuctionLot(game, {
      expectedBidId: game.auctionBids?.[1]?.bidId,
      expectedAmount: 20,
      expectedPlayerId: "p2",
    });
    assert.equal(ok.ok, true);
  });

  it("别人出得更高后原来占用放开", () => {
    const game = createInitialGame("room", []);
    game.phase = "AUCTION";
    game.currentEra = 2;
    const p1 = player("p1", { wealth: 100 });
    const p2 = player("p2", { wealth: 100 });
    game.players = [p1, p2];
    startFocusedAuction(game);
    placeAuctionBid(game, "p1", 30);
    assert.equal(playerAuctionAvailableWealth(game, p1), 70);
    placeAuctionBid(game, "p2", 40);
    assert.equal(playerAuctionAvailableWealth(game, p1), 100);
    assert.equal(playerAuctionAvailableWealth(game, p2), 60);
  });

  it("确认成交扣现在最高价并换成下一张", () => {
    const game = createInitialGame("room", []);
    game.phase = "AUCTION";
    game.currentEra = 2;
    const p = player("p1", { wealth: 100 });
    game.players = [p];
    startFocusedAuction(game);
    placeAuctionBid(game, "p1", 12);
    const sold = hammerAuctionLot(game);
    assert.equal(sold.ok, true);
    if (sold.ok) {
      assert.equal(sold.cost, 12);
      assert.equal(sold.cardId, "buff_insurance");
    }
    assert.equal(p.wealth, 88);
    assert.ok(p.inventory.includes("buff_insurance"));
    assert.equal(game.auctionFocusCardId, "buff_gold");
  });

  it("还没人出价不能确认成交，可以跳过", () => {
    const game = createInitialGame("room", []);
    game.phase = "AUCTION";
    game.currentEra = 2;
    game.players = [player("p1")];
    startFocusedAuction(game);
    const fail = hammerAuctionLot(game);
    assert.equal(fail.ok, false);
    const passed = passAuctionLot(game);
    assert.equal(passed.ok, true);
    assert.equal(game.auctionFocusCardId, "buff_gold");
    assert.equal((game.auctionDistributedCardIds ?? []).length, 0);
  });

  it("未完成转出降低可用，出价比例用出价当时的可用", () => {
    const game = createInitialGame("room", []);
    game.phase = "AUCTION";
    game.currentEra = 2;
    const p = player("p1", { wealth: 100 });
    game.players = [p, player("p2")];
    startFocusedAuction(game);
    game.transactions = [
      {
        id: "tx1",
        fromId: "p1",
        fromName: "p1",
        toId: "p2",
        toName: "p2",
        amount: 40,
        note: "",
        status: "pending",
        timestamp: Date.now(),
      },
    ];
    assert.equal(playerPendingTransferOutWealth(game, "p1"), 40);
    assert.equal(playerAvailableWealth(game, p), 60);
    const bid = placeAuctionBid(game, "p1", 50);
    assert.equal(bid.ok, true);
    if (bid.ok) {
      assert.equal(bid.bid.availableWealthAtBid, 60);
      assert.equal(bid.bid.bidToAvailableRatio, Math.round((50 / 60) * 10000) / 10000);
    }
  });

  it("强买之后换成下一张", () => {
    const game = createInitialGame("room", []);
    game.phase = "AUCTION";
    game.currentEra = 3;
    const p = player("p1", { inventory: ["buff_force_buy"] });
    game.players = [p];
    beginAuctionSession(game);
    assert.equal(game.auctionFocusCardId, undefined);
    // 强买不能买自己：先改到下一张
    game.auctionFocusCardId = "buff_short";
    const res = useForceBuyCard(game, "p1");
    assert.equal(res.success, true);
    assert.ok(p.inventory.includes("buff_short"));
    assert.equal(game.auctionFocusCardId, "buff_force_buy");
  });

  it("强买成交在玩家序列化中带 force_buy source", () => {
    const game = createInitialGame("room", []);
    game.phase = "AUCTION";
    game.currentEra = 3;
    const p = player("p1", { inventory: ["buff_force_buy"] });
    game.players = [p];
    beginAuctionSession(game);
    game.auctionFocusCardId = "buff_short";
    const res = useForceBuyCard(game, "p1");
    assert.equal(res.success, true);
    const view = serializeGameForClient(game, {}, "p1") as {
      auctionSoldLots?: { cardId: string; source?: string; cost: number }[];
    };
    assert.equal(view.auctionSoldLots?.[0]?.cardId, "buff_short");
    assert.equal(view.auctionSoldLots?.[0]?.source, "force_buy");
    assert.equal(view.auctionSoldLots?.[0]?.cost, 0);
    assert.match(
      formatAuctionSoldMessage(game, {
        cardId: "buff_short",
        playerId: "p1",
        cost: 0,
        source: "force_buy",
      }),
      /强买强卖/
    );
  });

  it("玩家端序列化含公开出价、不含私有比例", () => {
    const game = createInitialGame("room", []);
    game.phase = "AUCTION";
    game.currentEra = 2;
    game.players = [player("me"), player("them")];
    startFocusedAuction(game);
    placeAuctionBid(game, "me", 8);

    const mine = serializeGameForClient(game, {}, "me") as {
      auctionCurrentBid?: number;
      auctionBidHistory?: { amount: number }[];
      auctionBids?: unknown;
      auctionMinimumNextBid?: number;
      auctionSoldLots?: { playerName: string; cost: number }[];
    };
    assert.equal(mine.auctionCurrentBid, 8);
    assert.equal(mine.auctionMinimumNextBid, 13);
    assert.equal(mine.auctionBidHistory?.[0]?.amount, 8);
    assert.equal("auctionBids" in mine, false);

    const sold = hammerAuctionLot(game);
    assert.equal(sold.ok, true);
    const after = serializeGameForClient(game, {}, "me") as {
      auctionSoldLots?: { playerName: string; cost: number; cardId: string; source?: string }[];
      auctionSessionWins?: { playerId: string; cardId: string }[];
      auctionBids?: unknown;
    };
    assert.equal(after.auctionSoldLots?.[0]?.playerName, "me");
    assert.equal(after.auctionSoldLots?.[0]?.cost, 8);
    assert.equal(after.auctionSoldLots?.[0]?.source, "hammer");
    assert.equal(after.auctionSessionWins?.length, 1);
    assert.equal(after.auctionSessionWins?.[0]?.playerId, "me");
    assert.equal("auctionBids" in after, false);

    const god = serializeGameForClient(game, { isGodView: true }, null) as {
      auctionBids?: { bidToAvailableRatio: number | null }[];
    };
    assert.equal(god.auctionBids?.length, 1);
    assert.ok(god.auctionBids?.[0]?.bidToAvailableRatio != null);
  });

  it("负账面：可用财富为 0，待确认转账接受时不得再扣成更负", () => {
    const game = createInitialGame("room", []);
    const sender = player("sender", { wealth: -70 });
    const receiver = player("receiver", { wealth: 10 });
    game.players = [sender, receiver];
    game.transactions = [
      {
        id: "tx1",
        fromId: "sender",
        fromName: "sender",
        toId: "receiver",
        toName: "receiver",
        amount: 20,
        note: "",
        status: "pending",
        timestamp: Date.now(),
      },
    ];

    assert.equal(playerAvailableWealth(game, sender), 0);
    const resolved = resolvePendingTransfer(game, "tx1", "receiver", true);
    assert.equal(resolved.ok, true);
    if (resolved.ok) assert.equal(resolved.status, "rejected");
    assert.equal(sender.wealth, -70);
    assert.equal(receiver.wealth, 10);
  });
});
