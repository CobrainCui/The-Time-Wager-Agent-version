import assert from "node:assert";
import { describe, it } from "node:test";
import { createInitialGame } from "./gameState.js";
import { appendSettlementRound, enrichSettlementResultsForHistory } from "./sessionTelemetry.js";
import type { SettlementProjectResult } from "./gameState.js";

describe("settlement history enrichment", () => {
  it("stores cumulative long invest in settlementHistory", () => {
    const game = createInitialGame("room", []);
    const projectId = 101;
    game.completedProjects = [];
    game.uncompletedProjects = [];
    game.activeProjects = [
      {
        id: projectId,
        name: "长期测试",
        type: "long",
        maxEnergy: 90,
        accumulatedInvested: 15,
        currentInvested: 5,
        investorRecords: { p1: 15 },
        earningRecords: {},
        totalPayout: 0,
        roundsNoInvestment: 0,
        investedThisRound: true,
      },
    ];

    const results: SettlementProjectResult[] = [
      {
        projectId,
        name: "长期测试",
        type: "long",
        maxEnergy: 90,
        totalInvested: 15,
        isExploded: false,
        isCompleted: false,
        playerInvestments: { p1: 5 },
        playerGains: { p1: { total: 0, base: 0, rank: 0, era: 0 } },
      },
    ];

    const enriched = enrichSettlementResultsForHistory(game, results);
    assert.equal(enriched[0].playerInvestments.p1, 15);

    appendSettlementRound(game, results);
    assert.equal(game.sessionTelemetry!.settlementHistory[0].results[0].playerInvestments.p1, 15);
  });
});
