import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createInitialGame, type Player } from "../state/gameState.js";
import {
  PUBLIC_GROUP_ID,
  createCustomChatGroup,
  ensurePublicChatGroup,
  leaveChatGroup,
  sendGroupChatMessage,
  syncChatGroupsOnRosterChange,
} from "./chatGroups.js";

function human(id: string, name: string): Player {
  return {
    id,
    name,
    socketId: id,
    connected: true,
    ready: false,
    energy: 15,
    wealth: 0,
    rank: 0,
    investment: {},
    longTerm: {},
    riskGains: {},
    inventory: [],
    usedCards: [],
    activeBuffs: [],
    slackedBy: [],
    coffeePurchasesThisRound: 0,
    totalEnergyConsumed: 15,
    wealthHistory: [0],
    investedRiskEnergy: 0,
    investedLongEnergy: 0,
    investedShortEnergy: 0,
    socialRank: null,
  };
}

describe("chatGroups", () => {
  it("auto-creates public group when at least two players can chat", () => {
    const game = createInitialGame("r1", []);
    game.phase = "INVESTMENT";
    game.players = [human("a", "甲"), human("b", "乙"), { ...human("ai", "Bot"), isAI: true }];
    syncChatGroupsOnRosterChange(game);
    const pub = game.chatGroups!.find((g) => g.id === PUBLIC_GROUP_ID);
    assert.ok(pub);
    assert.deepEqual(pub!.memberIds.sort(), ["a", "b"]);
  });

  it("syncs public group members when public channel exists", () => {
    const game = createInitialGame("r1", []);
    game.phase = "INVESTMENT";
    game.players = [human("a", "甲"), human("b", "乙")];
    ensurePublicChatGroup(game);
    game.players.push(human("c", "丙"));
    syncChatGroupsOnRosterChange(game);
    const pub = game.chatGroups!.find((g) => g.id === PUBLIC_GROUP_ID);
    assert.ok(pub);
    assert.deepEqual(pub!.memberIds.sort(), ["a", "b", "c"]);
  });

  it("creates custom group with at least 3 members", () => {
    const game = createInitialGame("r1", []);
    game.phase = "INVESTMENT";
    game.players = [human("a", "甲"), human("b", "乙"), human("c", "丙")];
    syncChatGroupsOnRosterChange(game);
    const created = createCustomChatGroup(game, "a", ["b", "c"], "小队");
    assert.equal(created.ok, true);
    if (created.ok) {
      assert.equal(created.group.memberIds.length, 3);
    }
  });

  it("sends masked group message", () => {
    const game = createInitialGame("r1", []);
    game.phase = "INVESTMENT";
    game.players = [human("a", "甲"), human("b", "乙")];
    ensurePublicChatGroup(game);
    const r = sendGroupChatMessage(game, "a", PUBLIC_GROUP_ID, "hello");
    assert.equal(r.ok, true);
    assert.equal(game.groupMessages!.length, 1);
    assert.equal(game.groupMessages![0]!.text, "hello");
  });

  it("dissolves custom group when one member remains", () => {
    const game = createInitialGame("r1", []);
    game.phase = "INVESTMENT";
    game.players = [human("a", "甲"), human("b", "乙"), human("c", "丙")];
    const created = createCustomChatGroup(game, "a", ["b", "c"], "");
    assert.equal(created.ok, true);
    const gid = created.ok ? created.group.id : "";
    leaveChatGroup(game, "b", gid);
    leaveChatGroup(game, "c", gid);
    assert.ok(!game.chatGroups!.some((g) => g.id === gid));
  });
});
