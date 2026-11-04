import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createInitialGame } from "../state/gameState.js";
import type { Transaction } from "../state/gameState.js";
import { serializeGameForClient } from "../network/broadcast.js";
import {
  buildTransactionHotTail,
  fetchTransactionHistoryPage,
  transactionLogMeta,
  transactionsForViewerPayload,
  visibleTransactionsForViewer,
} from "../util/transactionHistory.js";
import { pruneSettledTransactions, MAX_SETTLED_ABUSE_CAP } from "../util/pruneTransactions.js";

function dm(i: number, overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: `tx-${i}`,
    fromId: "a",
    fromName: "A",
    toId: "b",
    toName: "B",
    amount: 0,
    note: `msg-${i}`,
    status: "accepted",
    timestamp: 1_000_000 + i,
    ...overrides,
  };
}

describe("transaction history hot tail", () => {
  it("god view hot tail keeps all pending plus last 80 settled", () => {
    const settled = Array.from({ length: 200 }, (_, i) => dm(i));
    const pending = [
      dm(999, { id: "pending-1", status: "pending", amount: 5, timestamp: 9_000_000 }),
    ];
    const all = [...settled, ...pending];
    const payload = transactionsForViewerPayload(all, null, true);
    assert.equal(payload.transactionLog.total, 201);
    assert.equal(payload.transactionLog.hasMore, true);
    assert.equal(payload.transactions.length, 81);
    assert.ok(payload.transactions.some((t) => t.id === "pending-1"));
    assert.ok(!payload.transactions.some((t) => t.id === "tx-0"));
    assert.ok(payload.transactions.some((t) => t.id === "tx-199"));
  });

  it("player view excludes other players messages", () => {
    const txs = [
      dm(1),
      dm(2, { fromId: "c", toId: "d", fromName: "C", toName: "D" }),
    ];
    const visible = visibleTransactionsForViewer(txs, "a", false);
    assert.equal(visible.length, 1);
    const payload = transactionsForViewerPayload(txs, "a", false);
    assert.equal(payload.transactionLog.total, 1);
    assert.equal(payload.transactions.length, 1);
  });

  it("fetchTransactionHistoryPage returns older slice before cursor", () => {
    const txs = Array.from({ length: 10 }, (_, i) => dm(i));
    const visible = txs;
    const cursor = { timestamp: txs[5].timestamp, id: txs[5].id };
    const page = fetchTransactionHistoryPage(visible, cursor, 3);
    assert.equal(page.transactions.length, 3);
    assert.deepEqual(
      page.transactions.map((t) => t.id),
      ["tx-2", "tx-3", "tx-4"]
    );
    assert.equal(page.hasMore, true);
  });
});

describe("pruneSettledTransactions retention", () => {
  it("keeps 200 settled records under abuse cap", () => {
    const game = createInitialGame("room", []);
    game.transactions = Array.from({ length: 200 }, (_, i) => dm(i));
    pruneSettledTransactions(game);
    assert.equal(game.transactions.length, 200);
  });

  it("serialize includes transactionLog with hasMore when tail truncated", () => {
    const game = createInitialGame("room", []);
    game.transactions = Array.from({ length: 200 }, (_, i) => dm(i));
    const god = serializeGameForClient(game, { isGodView: true }, null) as {
      transactions: Transaction[];
      transactionLog?: { total: number; hasMore: boolean };
    };
    assert.equal(god.transactionLog?.total, 200);
    assert.equal(god.transactionLog?.hasMore, true);
    assert.equal(god.transactions.length, 80);
  });

  it("documents abuse cap constant", () => {
    assert.ok(MAX_SETTLED_ABUSE_CAP >= 5000);
  });
});

describe("transactionLogMeta", () => {
  it("hasMore when visible exceeds hot tail", () => {
    const visible = Array.from({ length: 5 }, (_, i) => dm(i));
    const hot = buildTransactionHotTail(visible, 2);
    const meta = transactionLogMeta(visible, hot);
    assert.equal(meta.total, 5);
    assert.equal(meta.hasMore, true);
  });
});
