import { describe, expect, it } from "vitest";
import { peerTxSignature, threadMessagesSignature } from "./chatPeerActivity";
import type { Transaction } from "../../types";

describe("chatPeerActivity", () => {
  it("peerTxSignature ignores unrelated peers", () => {
    const txs: Transaction[] = [
      {
        id: "1",
        fromId: "c",
        toId: "me",
        fromName: "C",
        toName: "Me",
        amount: 0,
        note: "hi",
        status: "accepted",
        timestamp: 1,
      },
      {
        id: "2",
        fromId: "b",
        toId: "me",
        fromName: "B",
        toName: "Me",
        amount: 0,
        note: "yo",
        status: "accepted",
        timestamp: 2,
      },
    ];
    const sigB = peerTxSignature(txs, "b", "me");
    const sigBAfterCOnly = peerTxSignature(
      [
        ...txs,
        {
          id: "3",
          fromId: "c",
          toId: "me",
          fromName: "C",
          toName: "Me",
          amount: 0,
          note: "again",
          status: "accepted",
          timestamp: 3,
        },
      ],
      "b",
      "me"
    );
    expect(sigBAfterCOnly).toBe(sigB);
  });

  it("threadMessagesSignature changes when message status changes", () => {
    const a = threadMessagesSignature([
      {
        id: "x",
        direction: "in",
        amount: 0,
        note: "",
        status: "pending",
        timestamp: 1,
        txId: "t1",
      },
    ]);
    const b = threadMessagesSignature([
      {
        id: "x",
        direction: "in",
        amount: 0,
        note: "",
        status: "accepted",
        timestamp: 1,
        txId: "t1",
      },
    ]);
    expect(a).not.toBe(b);
  });
});
