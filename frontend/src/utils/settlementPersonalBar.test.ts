/**
 * 运行：cd frontend && npx tsx --test src/utils/settlementPersonalBar.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatPersonalBarCaption,
  normalizePersonalSlices,
  repairPersonalRoundSlices,
} from "./settlementPersonalBar";

describe("formatPersonalBarCaption", () => {
  it("multi-round with cap", () => {
    assert.equal(
      formatPersonalBarCaption("个人", [5, 6], 11, 30, false),
      "个人 5 + 6 / 30"
    );
  });

  it("single round with cap", () => {
    assert.equal(
      formatPersonalBarCaption("个人", [11], 11, 30, false),
      "个人 11 / 30"
    );
  });

  it("hideCapRatio omits denominator", () => {
    assert.equal(formatPersonalBarCaption("个人", [3, 8], 11, 30, true), "个人 3 + 8");
  });

  it("embed player name label", () => {
    assert.equal(
      formatPersonalBarCaption("张三", [5, 6], 11, 30, false),
      "张三 5 + 6 / 30"
    );
  });

  it("zero total with cap shows 0 / max", () => {
    assert.equal(formatPersonalBarCaption("个人", [], 0, 30, false), "个人 0 / 30");
  });

  it("zero total hideCapRatio shows 0 without max", () => {
    assert.equal(formatPersonalBarCaption("个人", [], 0, 30, true), "个人 0");
  });
});

describe("normalizePersonalSlices", () => {
  it("empty repaired falls back to single total", () => {
    assert.deepEqual(normalizePersonalSlices([], 11), [11]);
  });

  it("keeps repaired when sum matches total", () => {
    assert.deepEqual(normalizePersonalSlices([5, 6], 11), [5, 6]);
  });

  it("repairs when sum below total", () => {
    assert.deepEqual(normalizePersonalSlices([5, 3], 11), [5, 3, 3]);
  });
});

describe("repairPersonalRoundSlices", () => {
  it("returns positive slices when sum matches total", () => {
    assert.deepEqual(repairPersonalRoundSlices([5, 3], 8, 0), [5, 3]);
  });

  it("pads missing amount when sum below total", () => {
    assert.deepEqual(repairPersonalRoundSlices([5], 8, 0), [5, 3]);
  });
});
