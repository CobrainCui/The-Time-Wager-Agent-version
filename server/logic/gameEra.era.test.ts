import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createInitialGame } from "../state/gameState.js";
import {
  ensureProjectsDrawnForEra,
  stripExpiredRiskProjects,
  updateEraCard,
} from "../state/gameEra.js";

function expectedNewCount(era: number): { short: number; long: number; risk: number } {
  if (era === 1) return { short: 3, long: 2, risk: 1 };
  return { short: 2, long: 1, risk: 1 };
}

describe("ensureProjectsDrawnForEra", () => {
  it("four eras × two rounds: draw only on round 1, quotas match", () => {
    const game = createInitialGame("draw-test", []);
    game.players.push({
      id: "p1",
      name: "p1",
      energy: 15,
      wealth: 0,
      connected: true,
      ready: false,
      rank: 0,
      investment: {},
      longTerm: {},
      riskGains: {},
      inventory: [],
      usedCards: [],
      activeBuffs: [],
      slackedBy: [],
      totalEnergyConsumed: 0,
      wealthHistory: [0],
      investedRiskEnergy: 0,
      investedLongEnergy: 0,
      investedShortEnergy: 0,
      socialRank: null,
    });
    game.energyTableSize = 1;

    const seenIds = new Set<number>();

    for (let era = 1; era <= 4; era++) {
      game.currentEra = era;
      game.roundInEra = 1;
      updateEraCard(game);
      if (era > 1) stripExpiredRiskProjects(game);

      ensureProjectsDrawnForEra(game);

      const theme = game.currentEraCard?.era;
      const want = expectedNewCount(era);
      const newShort = game.activeProjects.filter(
        (p) => p.type === "short" && !seenIds.has(p.id)
      );
      const newLong = game.activeProjects.filter(
        (p) => p.type === "long" && !seenIds.has(p.id)
      );
      const newRisk = game.activeProjects.filter(
        (p) => p.type === "risk" && p.era === theme
      );

      assert.equal(newShort.length, want.short, `era ${era} short`);
      assert.equal(newLong.length, want.long, `era ${era} long`);
      assert.equal(newRisk.length, want.risk, `era ${era} risk`);
      assert.equal(game.projectDrawEra, era);

      for (const p of game.activeProjects) seenIds.add(p.id);

      const idsAfterDraw = game.activeProjects.map((p) => p.id).sort((a, b) => a - b);
      game.roundInEra = 2;
      ensureProjectsDrawnForEra(game);
      const idsAfterRound2 = game.activeProjects.map((p) => p.id).sort((a, b) => a - b);
      assert.deepEqual(idsAfterRound2, idsAfterDraw, `era ${era} round 2 must not add cards`);

      game.roundInEra = 1;
      const countBefore = game.activeProjects.length;
      ensureProjectsDrawnForEra(game);
      assert.equal(game.activeProjects.length, countBefore, `era ${era} idempotent`);
    }
  });

  it("skipping ERA_INTRO into investment still draws once for the new era", () => {
    const game = createInitialGame("skip-draw", []);
    game.energyTableSize = 6;
    game.currentEra = 1;
    game.roundInEra = 1;
    updateEraCard(game);
    ensureProjectsDrawnForEra(game);
    assert.equal(game.projectDrawEra, 1);
    assert.ok(game.activeProjects.length >= 6);
    assert.ok(game.activeProjects.some((p) => p.type === "risk"));

    game.currentEra = 2;
    game.roundInEra = 1;
    updateEraCard(game);
    assert.notEqual(game.projectDrawEra, 2);
    const before = game.activeProjects.map((p) => p.id);
    ensureProjectsDrawnForEra(game);
    assert.equal(game.projectDrawEra, 2);
    const after = game.activeProjects.map((p) => p.id);
    const added = after.filter((id) => !before.includes(id));
    assert.equal(added.length, 4, `expected 4 new cards, got ${added.length}`);
    assert.equal(
      game.activeProjects.filter((p) => p.type === "risk").length,
      1,
      "only current-era risk remains"
    );

    const again = game.activeProjects.length;
    ensureProjectsDrawnForEra(game);
    assert.equal(game.activeProjects.length, again);
  });

  it("stripExpiredRiskProjects clears prior risk at era boundary without touching long/short", () => {
    const game = createInitialGame("strip-risk", []);
    game.energyTableSize = 6;
    game.currentEra = 1;
    game.roundInEra = 1;
    updateEraCard(game);
    ensureProjectsDrawnForEra(game);
    const longIds = game.activeProjects.filter((p) => p.type === "long").map((p) => p.id);
    const shortIds = game.activeProjects.filter((p) => p.type === "short").map((p) => p.id);
    assert.ok(game.activeProjects.some((p) => p.type === "risk"));

    game.currentEra = 2;
    updateEraCard(game);
    stripExpiredRiskProjects(game);
    assert.equal(game.activeProjects.filter((p) => p.type === "risk").length, 0);
    assert.deepEqual(
      game.activeProjects.filter((p) => p.type === "long").map((p) => p.id),
      longIds
    );
    assert.deepEqual(
      game.activeProjects.filter((p) => p.type === "short").map((p) => p.id),
      shortIds
    );
    stripExpiredRiskProjects(game);
    assert.equal(
      game.logs.filter((l) => l.includes("旧时代的风险项目已移除")).length,
      1,
      "strip log once"
    );
  });
});
