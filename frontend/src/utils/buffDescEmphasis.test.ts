import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseBuffDescSegments, stripBuffDescEmphasis } from "./buffDescEmphasis";

describe("buffDescEmphasis", () => {
  it("parseBuffDescSegments splits bold markers", () => {
    assert.deepEqual(parseBuffDescSegments("a**b**c"), [
      { type: "text", value: "a" },
      { type: "bold", value: "b" },
      { type: "text", value: "c" },
    ]);
  });

  it("stripBuffDescEmphasis removes markers", () => {
    assert.equal(stripBuffDescEmphasis("**全员**清零"), "全员清零");
  });
});
