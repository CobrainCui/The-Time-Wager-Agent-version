import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createInitialGame, type Player } from "../state/gameState.js";
import { computeSessionMetrics, denseRankByWealth, kendallTau } from "./metrics.js";

function player(id: string, name: string, wealth: number): Player {
  return {
    id,
    name,
    socketId: id,
    connected: true,
    ready: true,
    energy: 10,
    wealth,
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
    wealthHistory: [wealth],
    investedRiskEnergy: 2,
    investedLongEnergy: 5,
    investedShortEnergy: 3,
    socialRank: null,
    isAgent: true,
    agentIndex: Number(id.slice(1)),
    agentModel: `model-${id}`,
    agentProvider: "test",
  };
}

function gameWithThree() {
  const game = createInitialGame("room", [], { seedBase: 42, sessionOrdinal: 0 });
  game.phase = "GAME_OVER";
  game.players = [player("p1", "A", 300), player("p2", "B", 200), player("p3", "C", 100)];
  game.transactions = [
    {
      id: "t1",
      fromId: "p1",
      fromName: "A",
      toId: "p2",
      toName: "B",
      amount: 10,
      note: "",
      status: "accepted",
      timestamp: 1000,
    },
    {
      id: "t2",
      fromId: "p2",
      fromName: "B",
      toId: "p1",
      toName: "A",
      amount: 5,
      note: "",
      status: "accepted",
      timestamp: 2000,
    },
  ];
  game.directMessages = [
    {
      id: "d1",
      fromId: "p1",
      fromName: "A",
      toId: "p2",
      toName: "B",
      text: "合作吗",
      timestamp: 1100,
      era: 1,
      roundInEra: 1,
      globalRound: 1,
    },
    {
      id: "d2",
      fromId: "p2",
      fromName: "B",
      toId: "p1",
      toName: "A",
      text: "可以",
      timestamp: 1200,
      era: 1,
      roundInEra: 1,
      globalRound: 1,
    },
  ];
  game.groupMessages = [
    { id: "g1", groupId: "__public__", fromId: "p3", fromName: "C", text: "大家好", timestamp: 900 },
  ];
  game.predictions = [
    {
      id: "pred1",
      playerId: "p1",
      playerName: "A",
      era: 1,
      globalRound: 1,
      ranking: ["p3", "p2", "p1"],
      reasoning: "反着排",
      timestamp: 800,
    },
  ];
  return game;
}

describe("session metrics", () => {
  it("dense ranks ties", () => {
    const ranks = denseRankByWealth([player("p1", "A", 100), player("p2", "B", 100), player("p3", "C", 50)]);
    assert.equal(ranks.get("p1"), 1);
    assert.equal(ranks.get("p2"), 1);
    assert.equal(ranks.get("p3"), 2);
  });

  it("scores a reversed prediction as tau -1", () => {
    const game = gameWithThree();
    const actual = denseRankByWealth(game.players);
    assert.equal(kendallTau(["p3", "p2", "p1"], actual), -1);
  });

  it("computes transfer reciprocity and prediction error", () => {
    const metrics = computeSessionMetrics(gameWithThree());
    assert.equal(metrics.game.transferCount, 2);
    assert.equal(metrics.game.transferReciprocity, 1);
    assert.equal(metrics.players[0]!.transferReturnRate, 1);
    assert.equal(metrics.players[1]!.transferReturnRate, 0);
    assert.equal(metrics.predictionScores[0]!.tau, -1);
    assert.equal(metrics.predictionScores[0]!.mae, 1.3333);
    assert.equal(metrics.game.publicMessageCount, 1);
    assert.equal(metrics.game.privateMessageCount, 2);
    assert.equal(metrics.players[0]!.privateMessages, 1);
    assert.ok(metrics.game.gini > 0);
  });
});
