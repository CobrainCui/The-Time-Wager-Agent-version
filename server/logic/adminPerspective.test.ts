import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { serializeGameForClient } from "../network/broadcast.js";
import {
  isValidHumanPerspectiveTarget,
  resolveAdminSpectatorSerialization,
  serializationForMemberSocket,
} from "../network/adminPerspective.js";
import { createInitialGame, Player } from "../state/gameState.js";
import { visibleTransactionsForViewer } from "../util/transactionHistory.js";

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
    investment: { 1: 5 },
    investmentDraft: { 1: 3 },
    longTerm: {},
    riskGains: {},
    inventory: ["buff_gold"],
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

describe("admin perspective serialization", () => {
  it("god view includes others inventory and admin fields", () => {
    const game = createInitialGame("room", []);
    game.phase = "INVESTMENT";
    game.players = [player("me"), player("them", { inventory: ["buff_slack"] })];
    game.transactions = [
      {
        id: "t1",
        fromId: "them",
        fromName: "them",
        toId: "other",
        toName: "other",
        amount: 0,
        note: "secret",
        status: "accepted",
        timestamp: 1,
      },
    ];

    const god = serializeGameForClient(game, { isGodView: true }, null) as {
      isGodView?: boolean;
      pendingDeviceClaims?: unknown;
      players: Player[];
    };
    assert.equal(god.isGodView, true);
    assert.ok(Array.isArray(god.pendingDeviceClaims) || "pendingDeviceClaims" in god);
    const them = god.players.find((p) => p.id === "them");
    assert.deepEqual(them?.inventory, ["buff_slack"]);
  });

  it("player perspective hides others hand and unrelated DMs", () => {
    const game = createInitialGame("room", []);
    game.phase = "INVESTMENT";
    game.players = [player("me"), player("them", { inventory: ["buff_slack"] })];
    game.transactions = [
      {
        id: "mine",
        fromId: "me",
        fromName: "me",
        toId: "them",
        toName: "them",
        amount: 0,
        note: "hi",
        status: "accepted",
        timestamp: 1,
      },
      {
        id: "other",
        fromId: "them",
        fromName: "them",
        toId: "ghost",
        toName: "ghost",
        amount: 0,
        note: "secret",
        status: "accepted",
        timestamp: 2,
      },
    ];

    const view = serializeGameForClient(
      game,
      { adminPerspectivePlayerId: "me" },
      "me"
    ) as {
      adminPerspectivePlayerId?: string;
      transactions: { id: string }[];
      players: Player[];
    };
    assert.equal(view.adminPerspectivePlayerId, "me");
    assert.deepEqual(
      view.transactions.map((t) => t.id),
      ["mine"]
    );
    const them = view.players.find((p) => p.id === "them");
    assert.equal(them?.inventory, undefined);
    assert.equal(them?.investmentDraft, undefined);
    const meView = view.players.find((p) => p.id === "me");
    assert.deepEqual(meView?.investmentDraft, { 1: 3 });
  });

  it("rejects AI as perspective target", () => {
    const game = createInitialGame("room", []);
    game.players = [player("ai1", { isAI: true })];
    assert.equal(isValidHumanPerspectiveTarget(game, "ai1"), null);
  });

  it("serializationForMemberSocket uses player filter for admin perspective", () => {
    const game = createInitialGame("room", []);
    game.players = [player("me"), player("them")];
    const resolved = serializationForMemberSocket(game, true, "me", null);
    assert.equal(resolved.viewerPlayerId, "me");
    assert.equal(resolved.extra.adminPerspectivePlayerId, "me");
    assert.equal(resolved.extra.isGodView, undefined);
  });

  it("clears invalid perspective id", () => {
    const game = createInitialGame("room", []);
    game.players = [player("me")];
    const resolved = resolveAdminSpectatorSerialization(game, {
      adminPerspectivePlayerId: "missing",
    });
    assert.equal(resolved.perspectiveCleared, true);
    assert.equal(resolved.extra.isGodView, true);
  });

  it("transaction visibility matches player filter in perspective mode", () => {
    const txs = [
      {
        id: "a",
        fromId: "me",
        fromName: "me",
        toId: "x",
        toName: "x",
        amount: 0,
        note: "",
        status: "accepted" as const,
        timestamp: 1,
      },
      {
        id: "b",
        fromId: "y",
        fromName: "y",
        toId: "z",
        toName: "z",
        amount: 0,
        note: "",
        status: "accepted" as const,
        timestamp: 2,
      },
    ];
    const visible = visibleTransactionsForViewer(txs, "me", false);
    assert.equal(visible.length, 1);
    assert.equal(visible[0].id, "a");
  });
});
