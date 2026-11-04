import { describe, expect, it } from "vitest";
import { isTxUnreadForViewer } from "./chatSeenStorage";
import type { Transaction } from "../../types";

function tx(partial: Partial<Transaction> & Pick<Transaction, "id" | "fromId" | "toId" | "status">): Transaction {
  return {
    fromName: "A",
    toName: "B",
    amount: 10,
    note: "",
    timestamp: 1,
    ...partial,
  };
}

describe("isTxUnreadForViewer", () => {
  const me = "me";

  it("incoming DM already seen does not bump", () => {
    const t = tx({ id: "1", fromId: "other", toId: me, status: "accepted", amount: 0 });
    expect(isTxUnreadForViewer(t, me, { "1": "accepted" })).toBe(false);
  });

  it("incoming new message bumps", () => {
    const t = tx({ id: "1", fromId: "other", toId: me, status: "accepted", amount: 0 });
    expect(isTxUnreadForViewer(t, me, {})).toBe(true);
  });

  it("outgoing pending on remount without snapshot does not bump", () => {
    const t = tx({ id: "1", fromId: me, toId: "other", status: "pending" });
    expect(isTxUnreadForViewer(t, me, {})).toBe(false);
  });

  it("outgoing receipt after era intro bumps when snapshot missing", () => {
    const t = tx({ id: "1", fromId: me, toId: "other", status: "accepted" });
    expect(isTxUnreadForViewer(t, me, {})).toBe(true);
  });

  it("outgoing receipt after viewing pending bumps", () => {
    const t = tx({ id: "1", fromId: me, toId: "other", status: "accepted" });
    expect(isTxUnreadForViewer(t, me, { "1": "pending" })).toBe(true);
  });
});
