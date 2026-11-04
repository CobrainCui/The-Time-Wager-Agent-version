import assert from "node:assert/strict";
import { describe, it } from "node:test";
import ExcelJS from "exceljs";
import { createInitialGame, Player } from "../state/gameState.js";
import { sanitizeCell, buildSessionExport, buildSessionWorkbook } from "../export/sessionExport.js";
import { allow, resetRateLimits } from "../util/rateLimit.js";
import {
  expireStalePendingTransactions,
  pendingCountFrom,
  PENDING_TTL_MS,
} from "../util/pruneTransactions.js";

function sheetToRecords(ws: ExcelJS.Worksheet | undefined): Record<string, string>[] {
  if (!ws) return [];
  const headerRow = ws.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell((cell, col) => {
    headers[col] = String(cell.value ?? "");
  });
  const records: Record<string, string>[] = [];
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const rec: Record<string, string> = {};
    row.eachCell((cell, col) => {
      const key = headers[col];
      if (key) rec[key] = String(cell.value ?? "");
    });
    records.push(rec);
  });
  return records;
}

function player(id: string, overrides: Partial<Player> = {}): Player {
  return {
    id,
    name: id,
    energy: 15,
    wealth: 10,
    connected: true,
    ready: false,
    rank: 0,
    investment: {},
    longTerm: {},
    riskGains: {},
    inventory: [],
    usedCards: [],
    activeBuffs: [],
    slackedBy: [],
    totalEnergyConsumed: 15,
    wealthHistory: [0],
    investedRiskEnergy: 0,
    investedLongEnergy: 0,
    investedShortEnergy: 0,
    socialRank: null,
    ...overrides,
  };
}

describe("xlsx formula sanitization", () => {
  it("prefixes formula-like strings", () => {
    assert.equal(sanitizeCell("=1+1"), "'=1+1");
    assert.equal(sanitizeCell("+cmd"), "'+cmd");
    assert.equal(sanitizeCell("-1"), "'-1");
    assert.equal(sanitizeCell("@SUM(A1)"), "'@SUM(A1)");
    assert.equal(sanitizeCell("普通昵称"), "普通昵称");
    assert.equal(sanitizeCell(12), 12);
  });

  it("writes sanitized nicknames and notes into the workbook", async () => {
    const game = createInitialGame("room", []);
    game.communityName = "=cmd";
    game.players = [player("p1", { name: "=1+1" })];
    game.transactions = [
      {
        id: "t1",
        fromId: "p1",
        fromName: "=1+1",
        toId: "p2",
        toName: "bob",
        amount: 1,
        note: "@SUM(A1)",
        status: "pending",
        timestamp: Date.now(),
      },
    ];
    const buf = await buildSessionWorkbook(buildSessionExport(game));
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as never);
    const players = sheetToRecords(wb.getWorksheet("玩家"));
    const txs = sheetToRecords(wb.getWorksheet("转账"));
    assert.equal(players[0]["昵称"], "'=1+1");
    assert.equal(txs[0]["备注"], "'@SUM(A1)");
    const meta = sheetToRecords(wb.getWorksheet("概览"));
    const nameRow = meta.find((r) => r["字段"] === "communityName");
    assert.equal(nameRow?.["值"], "'=cmd");
  });
});

describe("rate limit", () => {
  it("allows up to the window then rejects", () => {
    resetRateLimits();
    const now = 1_000_000;
    assert.equal(allow("k", 2, 1000, now), true);
    assert.equal(allow("k", 2, 1000, now + 1), true);
    assert.equal(allow("k", 2, 1000, now + 2), false);
    assert.equal(allow("k", 2, 1000, now + 1001), true);
  });
});

describe("pending transactions", () => {
  it("expires stale pending transfers", () => {
    const game = createInitialGame("room", []);
    game.transactions = [
      {
        id: "old",
        fromId: "p1",
        fromName: "a",
        toId: "p2",
        toName: "b",
        amount: 3,
        note: "",
        status: "pending",
        timestamp: 0,
      },
      {
        id: "fresh",
        fromId: "p1",
        fromName: "a",
        toId: "p2",
        toName: "b",
        amount: 1,
        note: "",
        status: "pending",
        timestamp: PENDING_TTL_MS + 10,
      },
    ];
    expireStalePendingTransactions(game, PENDING_TTL_MS + 20);
    assert.equal(game.transactions[0].status, "rejected");
    assert.equal(game.transactions[1].status, "pending");
    assert.equal(pendingCountFrom(game, "p1"), 1);
  });
});
