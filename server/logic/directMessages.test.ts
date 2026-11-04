import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createInitialGame, type Player } from "../state/gameState.js";
import { directMessagesForViewer, sendDirectMessage } from "./directMessages.js";

function player(id: string, name: string): Player {
  return {
    id,
    name,
    socketId: id,
    connected: true,
    ready: false,
    energy: 10,
    wealth: 100,
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
    isAgent: true,
  };
}

describe("direct messages", () => {
  it("stores a message visible only to sender/recipient/god", () => {
    const game = createInitialGame("r", [], { seedBase: 1 });
    game.phase = "INVESTMENT";
    game.players = [player("a", "甲"), player("b", "乙"), player("c", "丙")];
    const result = sendDirectMessage(game, "a", "b", "只给你看");
    assert.equal(result.ok, true);
    assert.equal(game.directMessages!.length, 1);
    assert.equal(directMessagesForViewer(game, "a", false).length, 1);
    assert.equal(directMessagesForViewer(game, "b", false).length, 1);
    assert.equal(directMessagesForViewer(game, "c", false).length, 0);
    assert.equal(directMessagesForViewer(game, null, true).length, 1);
  });

  it("rejects empty and self messages", () => {
    const game = createInitialGame("r", [], { seedBase: 1 });
    game.phase = "INVESTMENT";
    game.players = [player("a", "甲"), player("b", "乙")];
    assert.equal(sendDirectMessage(game, "a", "b", "   ").ok, false);
    assert.equal(sendDirectMessage(game, "a", "a", "hi").ok, false);
  });

  it("enforces the per-round private chat quota", () => {
    const game = createInitialGame("r", [], { seedBase: 1 });
    game.phase = "INVESTMENT";
    game.players = [player("a", "甲"), player("b", "乙")];
    const max = Number(process.env.CHAT_MAX_PRIVATE_PER_ROUND ?? 6);
    for (let i = 0; i < max; i++) {
      assert.equal(sendDirectMessage(game, "a", "b", `m${i}`).ok, true);
    }
    const blocked = sendDirectMessage(game, "a", "b", "over");
    assert.equal(blocked.ok, false);
  });
});
