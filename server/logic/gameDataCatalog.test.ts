import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { ERA_BONUS_POOL_LONG, ERA_BONUS_POOL_SHORT } from "../config/eraBonus.js";
import { STARTING_WEALTH } from "../config/startingWealth.js";
import { longTermProjects, shortTermProjects } from "../data/game_data.js";

const LONG_MAX_ENERGY_BY_ID: Record<number, number> = {
  101: 90,
  102: 100,
  103: 90,
  104: 90,
  105: 100,
  106: 90,
  107: 110,
};

function catalogLineForId(src: string, id: number): string | undefined {
  const needle = `id: ${id},`;
  return src.split("\n").find((line) => line.includes(needle));
}

function parseIntArrayFromLine(line: string, key: string): number[] {
  const re = new RegExp(`${key}:\\s*\\[([^\\]]+)\\]`);
  const match = line.match(re);
  assert.ok(match, `missing ${key} on catalog line: ${line}`);
  return match[1]
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => !Number.isNaN(n));
}

describe("longTermProjects catalog maxEnergy", () => {
  it("matches 90 / 100 / 110 tiers in game_data", () => {
    assert.equal(longTermProjects.length, 7);
    for (const card of longTermProjects) {
      const expected = LONG_MAX_ENERGY_BY_ID[card.id];
      assert.equal(
        card.maxEnergy,
        expected,
        `game_data long id ${card.id} (${card.name}) maxEnergy`
      );
    }
  });

  it("frontend projectCatalog.ts stays in sync with game_data", () => {
    const catalogPath = join(
      dirname(fileURLToPath(import.meta.url)),
      "../../../frontend/src/config/projectCatalog.ts"
    );
    const src = readFileSync(catalogPath, "utf8");
    for (const card of longTermProjects) {
      const re = new RegExp(`id: ${card.id},[^\\n]*maxEnergy: (\\d+)`);
      const match = src.match(re);
      assert.ok(match, `projectCatalog missing long id ${card.id}`);
      assert.equal(
        Number(match[1]),
        card.maxEnergy,
        `projectCatalog id ${card.id} maxEnergy`
      );
    }
  });
});

describe("project catalog rankRewards sync", () => {
  const catalogPath = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../../frontend/src/config/projectCatalog.ts"
  );
  const catalogSrc = readFileSync(catalogPath, "utf8");

  for (const card of [...shortTermProjects, ...longTermProjects]) {
    it(`id ${card.id} rankRewards match projectCatalog.ts`, () => {
      const line = catalogLineForId(catalogSrc, card.id);
      assert.ok(line, `projectCatalog missing id ${card.id}`);
      const catalogRewards = parseIntArrayFromLine(line, "rankRewards");
      assert.deepEqual(
        catalogRewards,
        card.rankRewards,
        `rankRewards id ${card.id}`
      );
    });
  }

  for (const card of shortTermProjects) {
    it(`id ${card.id} overInvestPenalty match projectCatalog.ts`, () => {
      const line = catalogLineForId(catalogSrc, card.id);
      assert.ok(line, `projectCatalog missing id ${card.id}`);
      const catalogPenalty = parseIntArrayFromLine(line, "overInvestPenalty");
      assert.deepEqual(
        catalogPenalty,
        card.overInvestPenalty,
        `overInvestPenalty id ${card.id}`
      );
    });
  }
});

describe("era bonus pool constants", () => {
  it("frontend ERA_BONUS_* matches server config", () => {
    const catalogPath = join(
      dirname(fileURLToPath(import.meta.url)),
      "../../../frontend/src/config/projectCatalog.ts"
    );
    const src = readFileSync(catalogPath, "utf8");
    const shortMatch = src.match(/export const ERA_BONUS_SHORT = (\d+)/);
    const longMatch = src.match(/export const ERA_BONUS_LONG = (\d+)/);
    assert.ok(shortMatch && longMatch, "projectCatalog ERA_BONUS exports");
    assert.equal(Number(shortMatch[1]), ERA_BONUS_POOL_SHORT);
    assert.equal(Number(longMatch[1]), ERA_BONUS_POOL_LONG);
  });
});

describe("starting wealth constants", () => {
  it("frontend STARTING_WEALTH matches server config", () => {
    const path = join(
      dirname(fileURLToPath(import.meta.url)),
      "../../../frontend/src/config/startingWealth.ts"
    );
    const src = readFileSync(path, "utf8");
    const match = src.match(/export const STARTING_WEALTH = (\d+)/);
    assert.ok(match, "frontend startingWealth export");
    assert.equal(Number(match[1]), STARTING_WEALTH);
  });
});
