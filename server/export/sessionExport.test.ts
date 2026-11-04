import assert from "node:assert/strict";
import { describe, it } from "node:test";
import ExcelJS from "exceljs";
import { createInitialGame, Player } from "../state/gameState.js";
import { buildSessionExport, buildSessionWorkbook } from "../export/sessionExport.js";
import { EXPORT_SCHEMA_VERSION } from "../export/constants.js";
import { applyInvestments } from "../logic/investmentLogic.js";
import { forceSubmitPendingInvestments } from "../state/gameActions.js";
import { applyLotteryAccept } from "../logic/lotterySettle.js";
import { appendSessionEvent } from "../state/sessionTelemetry.js";
import { useForceBuyCard } from "../logic/buffLogic.js";
import { beginAuctionSession, recordAuctionCompletedDeal } from "../logic/auctionCards.js";

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
    wealth: 100,
    connected: true,
    ready: false,
    rank: 2,
    investment: {},
    longTerm: {},
    riskGains: {},
    inventory: [],
    usedCards: [],
    activeBuffs: [],
    slackedBy: [],
    totalEnergyConsumed: 15,
    wealthHistory: [0, 10],
    investedRiskEnergy: 1,
    investedLongEnergy: 2,
    investedShortEnergy: 3,
    socialRank: "B",
    ...overrides,
  };
}

describe("session export 1.2.0 alignment", () => {
  it("meta includes sessionId, energyTableSize, eraThemeNames and omits eventChoices", () => {
    const game = createInitialGame("room-a", []);
    game.sessionId = "sess-1";
    game.energyTableSize = 6;
    game.players = [player("p1")];
    const exp = buildSessionExport(game);
    assert.equal(exp.meta.exportSchemaVersion, EXPORT_SCHEMA_VERSION);
    assert.equal(exp.meta.sessionId, "sess-1");
    assert.equal(exp.meta.energyTableSize, 6);
    assert.ok(Array.isArray(exp.meta.eraThemeNames));
    assert.equal(exp.meta.eraThemeNames.length, game.eraSequence.length);
    assert.equal("eventChoices" in exp, false);
  });

  it("records investment source for player vs deadline submit", () => {
    const game = createInitialGame("room", []);
    game.phase = "INVESTMENT";
    game.activeProjects = [
      {
        id: 1,
        name: "P",
        type: "short",
        maxEnergy: 20,
        accumulatedInvested: 0,
        currentInvested: 0,
        roundsNoInvestment: 0,
        investedThisRound: false,
        investorRecords: {},
        earningRecords: {},
        totalPayout: 0,
      },
    ];
    const a = player("a", { energy: 10 });
    const b = player("b", { energy: 10, investmentDraft: { 1: 3 } });
    game.players = [a, b];

    assert.equal(applyInvestments(game, "a", { 1: 2 }, "player"), true);
    const playerEvt = game.sessionTelemetry?.events.find(
      (e) => e.type === "investment_submitted" && e.playerId === "a"
    );
    assert.equal(playerEvt?.payload.source, "player");

    forceSubmitPendingInvestments(game, "deadline");
    const deadlineEvt = game.sessionTelemetry?.events.find(
      (e) => e.type === "investment_submitted" && e.playerId === "b"
    );
    assert.equal(deadlineEvt?.payload.source, "deadline");
  });

  it("lottery_settled payload distinguishes entered vs credited with gold", () => {
    const game = createInitialGame("room", []);
    const p = player("p1", {
      wealth: 10,
      activeBuffs: [{ cardId: "buff_lottery" }, { cardId: "buff_gold" }],
    });
    game.players = [p];
    const settled = applyLotteryAccept(game, p, 100);
    appendSessionEvent(
      game,
      "lottery_settled",
      {
        targetPlayerId: p.id,
        enteredAmount: settled.enteredAmount,
        creditedAmount: settled.creditedAmount,
        goldApplied: settled.goldApplied,
        accepted: true,
      },
      p.id
    );
    assert.equal(settled.enteredAmount, 100);
    assert.equal(settled.creditedAmount, 150);
    assert.notEqual(settled.enteredAmount, settled.creditedAmount);
    assert.equal(p.wealth, 160);

    const exp = buildSessionExport(game);
    assert.equal(exp.lotteryDeals[0]?.enteredAmount, 100);
    assert.equal(exp.lotteryDeals[0]?.creditedAmount, 150);
    assert.equal(exp.lotteryDeals[0]?.goldApplied, true);
    const evt = exp.events.find((e) => e.type === "lottery_settled");
    assert.equal(evt?.payload.creditedAmount, 150);
    assert.equal(evt?.payload.enteredAmount, 100);
  });

  it("workbook settlement has shortSold column and deals use source not zero-price heuristic", async () => {
    const game = createInitialGame("room", []);
    game.energyTableSize = 5;
    game.players = [player("p1")];
    game.sessionTelemetry = {
      events: [],
      settlementHistory: [
        {
          round: 1,
          currentEra: 1,
          roundInEra: 1,
          results: [
            {
              projectId: 9,
              name: "做空项",
              type: "short",
              maxEnergy: 10,
              totalInvested: 5,
              isExploded: false,
              isCompleted: false,
              shortSold: true,
              playerInvestments: { p1: 5 },
              playerGains: {
                p1: { total: 0, base: 0, rank: 0, era: 0, baseBeforeGold: 10 },
              },
            },
          ],
        },
      ],
    };
    recordAuctionCompletedDeal(game, "buff_gold", "p1", 0, "force_buy");
    // 旧档无 source 的 0 价成交不应被猜成强买
    if (!game.auctionCompletedDeals) game.auctionCompletedDeals = [];
    game.auctionCompletedDeals.push({
      cardId: "buff_insurance",
      playerId: "p1",
      cost: 0,
    });

    const buf = await buildSessionWorkbook(buildSessionExport(game));
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as never);

    const settle = sheetToRecords(wb.getWorksheet("结算"));
    assert.equal(settle[0]?.["做空"], "true");
    assert.equal(settle[0]?.["项目ID"], "9");
    assert.equal(settle[0]?.["点石前基础"], "10");

    const deals = sheetToRecords(wb.getWorksheet("成交"));
    const force = deals.find((r) => r["道具卡ID"] === "buff_gold");
    const legacy = deals.find((r) => r["道具卡ID"] === "buff_insurance");
    assert.equal(force?.["来源"], "强买强卖");
    assert.equal(legacy?.["来源"], "");
  });

  it("force buy records deal source force_buy", () => {
    const game = createInitialGame("room", []);
    game.phase = "AUCTION";
    // currentEra 3 → auctionRound 2，池内有强买与项目做空
    game.currentEra = 3;
    beginAuctionSession(game);
    game.auctionFocusCardId = "buff_short";
    const p = player("p1", { inventory: ["buff_force_buy"], wealth: 50 });
    game.players = [p];
    const result = useForceBuyCard(game, "p1");
    assert.equal(result.success, true, result.success ? "" : result.msg);
    const deal = game.auctionCompletedDeals?.find((d) => d.cardId === "buff_short");
    assert.equal(deal?.source, "force_buy");
    assert.equal(deal?.cost, 0);
  });
});
