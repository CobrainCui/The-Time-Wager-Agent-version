import { describe, expect, it } from "vitest";
import {
  buildDisplayOrder,
  bumpCollapsedRecency,
  promoteExpandedStack,
  removeFromExpandedStack,
} from "./chatDockOrder";

describe("chatDockOrder", () => {
  it("C message only bumps collapsed recency, not expanded stack", () => {
    const peerIds = ["a", "b", "c"];
    const expandedStack = ["b", "a"];
    const collapsedRecency = ["a", "b", "c"];
    const isExpanded = (id: string) => id === "a" || id === "b";

    const afterCollapsedBump = bumpCollapsedRecency(collapsedRecency, "c");
    expect(afterCollapsedBump[0]).toBe("c");
    expect(expandedStack).toEqual(["b", "a"]);

    const orderBefore = buildDisplayOrder(peerIds, expandedStack, collapsedRecency, isExpanded);
    const orderAfter = buildDisplayOrder(peerIds, expandedStack, afterCollapsedBump, isExpanded);
    const expandedSliceBefore = orderBefore.slice(0, 2);
    const expandedSliceAfter = orderAfter.slice(0, 2);
    expect(expandedSliceAfter).toEqual(expandedSliceBefore);
  });

  it("activate promotes expanded stack top", () => {
    expect(promoteExpandedStack(["b", "a"], "c")).toEqual(["c", "b", "a"]);
    expect(removeFromExpandedStack(["c", "b", "a"], "b")).toEqual(["c", "a"]);
  });

  it("buildDisplayOrder keeps expanded stack order reversed in dock", () => {
    const order = buildDisplayOrder(
      ["a", "b", "c"],
      ["b", "a"],
      ["c", "b", "a"],
      (id) => id === "a" || id === "b"
    );
    expect(order[0]).toBe("a");
    expect(order[1]).toBe("b");
    expect(order[2]).toBe("c");
  });
});
