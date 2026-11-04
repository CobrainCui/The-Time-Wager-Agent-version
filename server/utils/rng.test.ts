import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Rng, deriveSeed, nextRandomValue } from "./rng.js";

describe("seeded rng", () => {
  it("produces the same stream for the same seed", () => {
    const a = new Rng(12345);
    const b = new Rng(12345);
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    assert.deepEqual(seqA, seqB);
  });

  it("shuffles deterministically and differently across seeds", () => {
    const base = [1, 2, 3, 4, 5, 6, 7, 8];
    const a1 = new Rng(7).shuffle(base);
    const a2 = new Rng(7).shuffle(base);
    const b = new Rng(8).shuffle(base);
    assert.deepEqual(a1, a2);
    assert.notDeepEqual(a1, b);
    assert.deepEqual([...a1].sort((x, y) => x - y), base);
  });

  it("derives distinct game seeds from one base seed", () => {
    const seeds = new Set([0, 1, 2, 3, 4].map((n) => deriveSeed(20261104, n)));
    assert.equal(seeds.size, 5);
  });

  it("nextRandomValue returns state in uint32 range", () => {
    const [, state] = nextRandomValue(1);
    assert.ok(state >= 0 && state <= 0xffffffff);
  });
});
