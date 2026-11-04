import { describe, expect, it } from "vitest";
import {
  clearComposerDraft,
  readComposerDraft,
  isFocusMovingWithin,
  shouldHydrateComposerFromDraft,
  writeComposerDraft,
} from "./chatComposerDraft";

describe("chatComposerDraft", () => {
  it("isolates drafts per peer and clears on send", () => {
    let store = writeComposerDraft({}, "b", { amount: "", note: "你好" });
    store = writeComposerDraft(store, "c", { amount: 5, note: "转账" });
    expect(readComposerDraft(store, "b").note).toBe("你好");
    expect(readComposerDraft(store, "c").amount).toBe(5);

    store = clearComposerDraft(store, "b");
    expect(readComposerDraft(store, "b").note).toBe("");
    expect(readComposerDraft(store, "c").amount).toBe(5);
  });

  it("shouldHydrateComposerFromDraft blocks while focused or composing", () => {
    expect(shouldHydrateComposerFromDraft(false, false)).toBe(true);
    expect(shouldHydrateComposerFromDraft(true, false)).toBe(false);
    expect(shouldHydrateComposerFromDraft(false, true)).toBe(false);
    expect(shouldHydrateComposerFromDraft(true, true)).toBe(false);
  });

  it("isFocusMovingWithin delegates to container.contains", () => {
    const inner = { tag: "input" };
    const container = {
      contains(node: unknown) {
        return node === inner;
      },
    } as HTMLElement;
    expect(isFocusMovingWithin(container, inner as EventTarget)).toBe(true);
    expect(isFocusMovingWithin(container, {} as EventTarget)).toBe(false);
    expect(isFocusMovingWithin(container, null)).toBe(false);
  });
});
