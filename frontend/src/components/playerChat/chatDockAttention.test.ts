import { describe, expect, it } from "vitest";
import { Transaction } from "../../types";
import {
  peerDockAttention,
  pickLatestDockAction,
  summarizeDockAttention,
} from "./chatDockAttention";

const me = "me";
const alice = { id: "a", name: "小林" };

function tx(partial: Partial<Transaction> & Pick<Transaction, "id">): Transaction {
  return {
    id: partial.id,
    fromId: partial.fromId ?? "a",
    fromName: partial.fromName ?? "小林",
    toId: partial.toId ?? me,
    toName: partial.toName ?? "我",
    amount: partial.amount ?? 0,
    note: partial.note ?? "",
    status: partial.status ?? "accepted",
    timestamp: partial.timestamp ?? 1000,
  };
}

describe("chatDockAttention", () => {
  it("peerDockAttention counts pending transfer even when thread unread is 0", () => {
    const transactions = [
      tx({ id: "1", amount: 50, status: "pending", fromId: "a", toId: me }),
    ];
    const att = peerDockAttention("a", 0, transactions, me);
    expect(att.pendingTransfers).toBe(1);
    expect(att.total).toBe(1);
  });

  it("pickLatestDockAction prefers pending transfer over older unread dm", () => {
    const transactions = [
      tx({ id: "dm", amount: 0, note: "你好", timestamp: 2000, fromId: "a", toId: me }),
      tx({ id: "tr", amount: 30, status: "pending", timestamp: 1500, fromId: "a", toId: me }),
    ];
    const latest = pickLatestDockAction([alice], transactions, me, {});
    expect(latest?.kind).toBe("transfer");
    expect(latest?.peerId).toBe("a");
  });

  it("summarizeDockAttention aggregates pending across peers", () => {
    const transactions = [
      tx({ id: "1", amount: 10, status: "pending", fromId: "a", toId: me }),
      tx({ id: "2", amount: 20, status: "pending", fromId: "b", toId: me, fromName: "阿杰" }),
    ];
    const peers = [alice, { id: "b", name: "阿杰" }];
    const summary = summarizeDockAttention(peers, {}, transactions, me, {});
    expect(summary.totalPendingTransfers).toBe(2);
    expect(summary.totalAttention).toBe(2);
  });
});
