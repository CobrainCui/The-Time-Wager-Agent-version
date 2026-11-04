import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { useBuffCard, LIGHTER_CARD_ID, SLACK_CARD_ID, WORK_REST_CARD_ID } from "./buffLogic.js";
import { LOTTERY_CARD_ID } from "./lotterySettle.js";
import { resolveRoundBuffsAtSettlement } from "./roundBuffResolve.js";
import { settlePhase } from "./projectSettlement.js";
import { createInitialGame, Player } from "../state/gameState.js";

function player(id: string, overrides: Partial<Player> = {}): Player {
  return {
    id,
    name: id,
    energy: 20,
    wealth: 100,
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
    coffeePurchasesThisRound: 0,
    totalEnergyConsumed: 0,
    wealthHistory: [100],
    investedRiskEnergy: 0,
    investedLongEnergy: 0,
    investedShortEnergy: 0,
    socialRank: null,
    ...overrides,
  };
}

describe("roundBuffResolve settlement order", () => {
  it("lighter after slack refunds victim energy when slack play voided", () => {
    const game = createInitialGame("r", []);
    game.phase = "BUFF_USAGE";
    const a = player("a", { inventory: [SLACK_CARD_ID] });
    const b = player("b", { energy: 20 });
    const c = player("c", { inventory: [LIGHTER_CARD_ID] });
    game.players = [a, b, c];
    useBuffCard(game, "a", SLACK_CARD_ID, { targetPlayerId: "b" });
    assert.equal(b.energy, 12);
    useBuffCard(game, "c", LIGHTER_CARD_ID, {
      targetPlayerId: "a",
      burnCardId: SLACK_CARD_ID,
    });
    resolveRoundBuffsAtSettlement(game);
    assert.equal(b.energy, 20);
    assert.equal(a.pendingLighterBurnNotices?.[0]?.kind, "played");
    const victimNote = b.buffRoundNotes?.some((n) => n.text.includes("打火机作废"));
    assert.equal(victimNote, true);
  });

  it("lighter burn on target voids work-rest passive granted to that player", () => {
    const game = createInitialGame("r", []);
    game.phase = "BUFF_USAGE";
    const caster = player("caster", { inventory: [WORK_REST_CARD_ID] });
    const victim = player("victim", { energy: 20 });
    const lighter = player("lighter", { inventory: [LIGHTER_CARD_ID] });
    game.players = [caster, victim, lighter];
    useBuffCard(game, "caster", WORK_REST_CARD_ID, { targetPlayerId: "victim" });
    assert.ok(victim.activeBuffs.some((b) => b.cardId === WORK_REST_CARD_ID));
    useBuffCard(game, "lighter", LIGHTER_CARD_ID, {
      targetPlayerId: "victim",
      burnCardId: WORK_REST_CARD_ID,
    });
    resolveRoundBuffsAtSettlement(game);
    assert.equal(
      victim.activeBuffs.some((b) => b.cardId === WORK_REST_CARD_ID),
      false
    );
  });

  it("voiding lottery clears pending offer at settlement", () => {
    const game = createInitialGame("r", []);
    game.phase = "BUFF_USAGE";
    const lot = player("lot", { inventory: [LOTTERY_CARD_ID] });
    const lighter = player("lighter", { inventory: [LIGHTER_CARD_ID] });
    game.players = [lot, lighter];
    useBuffCard(game, "lot", LOTTERY_CARD_ID, {});
    game.pendingLotteryOffers = [{ offerId: "o1", playerId: "lot", amount: 10 }];
    useBuffCard(game, "lighter", LIGHTER_CARD_ID, {
      targetPlayerId: "lot",
      burnCardId: LOTTERY_CARD_ID,
    });
    resolveRoundBuffsAtSettlement(game);
    assert.equal(game.pendingLotteryOffers?.length ?? 0, 0);
    assert.equal(lot.activeBuffs.some((b) => b.cardId === LOTTERY_CARD_ID), false);
  });

  it("short voided by lighter before project settlement", () => {
    const game = createInitialGame("r", []);
    game.phase = "BUFF_USAGE";
    const shortUser = player("short", { inventory: ["buff_short"] });
    const lighter = player("lighter", { inventory: [LIGHTER_CARD_ID] });
    game.players = [shortUser, lighter];
    game.activeProjects = [
      {
        id: 1,
        name: "P1",
        type: "short",
        era: "科技",
        maxEnergy: 10,
        accumulatedInvested: 5,
        currentInvested: 0,
        rankRewards: [10],
        overInvestPenalty: [-5],
        investorRecords: { short: 5 },
        earningRecords: {},
        totalPayout: 0,
        roundsNoInvestment: 0,
        investedThisRound: false,
      },
    ];
    useBuffCard(game, "short", "buff_short", { targetProjectId: 1 });
    useBuffCard(game, "lighter", LIGHTER_CARD_ID, {
      targetPlayerId: "short",
      burnCardId: "buff_short",
    });
    settlePhase(game);
    assert.equal(game.lastSettlement?.results[0]?.shortSold, undefined);
    assert.equal(game.activeProjects[0]?.accumulatedInvested, 5);
    const publicLog = game.logs.join("\n");
    assert.equal(publicLog.includes("打火机结算"), false);
  });
});
