import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { scaleRankRewardsForPlayerCount } from "./rankRewardSchedule.js";
import { sharedPoolAmount } from "./projectSettlement.js";

describe("scaleRankRewardsForPlayerCount", () => {
  const base = [45, 30, 20, 15, 10, 5];

  it("six players returns copy of base", () => {
    const out = scaleRankRewardsForPlayerCount(base, 6)!;
    assert.deepEqual(out, base);
    assert.notEqual(out, base);
  });

  it("four players preserves total and decreases", () => {
    const out = scaleRankRewardsForPlayerCount(base, 4)!;
    assert.equal(out.length, 4);
    assert.equal(out.reduce((a, b) => a + b, 0), 125);
    for (let i = 0; i < out.length - 1; i++) {
      assert.ok(out[i] >= out[i + 1]);
    }
  });

  it("five players preserves total", () => {
    const out = scaleRankRewardsForPlayerCount(base, 5)!;
    assert.equal(out.length, 5);
    assert.equal(out.reduce((a, b) => a + b, 0), 125);
  });

  it("one to three players use five-player tiers", () => {
    const five = scaleRankRewardsForPlayerCount(base, 5)!;
    for (const n of [1, 2, 3]) {
      const out = scaleRankRewardsForPlayerCount(base, n)!;
      assert.deepEqual(out, five);
    }
  });

  it("scaled array works with sharedPoolAmount for ties", () => {
    const scaled = scaleRankRewardsForPlayerCount(base, 4)!;
    assert.equal(sharedPoolAmount(scaled, 0, 2), Math.trunc((scaled[0] + scaled[1]) / 2));
    assert.equal(sharedPoolAmount(scaled, 2, 1), scaled[2]);
  });
});
