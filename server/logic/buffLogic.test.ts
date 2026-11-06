import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { serializeGameForClient } from "../network/broadcast.js";
import {
  ackSlackHit,
  applyGoldMultiplier,
  useBuffCard,
  useForceBuyCard,
  SLACK_ENERGY_DELTA,
  FORCE_BUY_CARD_ID,
  LIGHTER_CARD_ID,
  WORK_REST_CARD_ID,
} from "./buffLogic.js";
import { settleOneProject, settlePhase } from "./projectSettlement.js";
import {
  ackLighterBurnNotice,
  resolveRoundBuffsAtSettlement,
} from "./roundBuffResolve.js";
import { applyLotteryAccept } from "./lotterySettle.js";
import { beginAuctionSession } from "./auctionCards.js";
import { createInitialGame, Player, ActiveProject } from "../state/gameState.js";

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
    buffRoundNotes: [],
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

function shortProject(id = 1): ActiveProject {
  return {
    id,
    name: `P${id}`,
    type: "short",
    maxEnergy: 20,
    accumulatedInvested: 12,
    currentInvested: 5,
    rankRewards: [10, 5, 0],
    investorRecords: { a: 7, b: 5 },
    earningRecords: {},
    totalPayout: 0,
    roundsNoInvestment: 0,
    investedThisRound: true,
  };
}

describe("buffLogic new roster effects", () => {
  it("useBuffCard honors inventoryIndex for duplicate card ids", () => {
    const game = createInitialGame("r", []);
    game.phase = "BUFF_USAGE";
    const a = player("a", { inventory: ["buff_slack", "buff_gold", "buff_slack"], energy: 20 });
    const b = player("b", { energy: 20 });
    game.players = [a, b];

    const secondSlack = useBuffCard(game, "a", "buff_slack", {
      targetPlayerId: "b",
      inventoryIndex: 2,
    });
    assert.equal(secondSlack.success, true);
    assert.deepEqual(a.inventory, ["buff_slack", "buff_gold"]);

    const stale = useBuffCard(game, "a", "buff_gold", { inventoryIndex: 2 });
    assert.equal(stale.success, false);
    if (!stale.success) assert.match(stale.msg, /手牌已变化/);
  });

  it("slack subtracts 8 energy", () => {
    const game = createInitialGame("r", []);
    game.phase = "BUFF_USAGE";
    const a = player("a", { inventory: ["buff_slack"] });
    const b = player("b", { energy: 15 });
    game.players = [a, b];
    const res = useBuffCard(game, "a", "buff_slack", { targetPlayerId: "b" });
    assert.equal(res.success, true);
    assert.equal(b.energy, 15 - SLACK_ENERGY_DELTA);
    assert.equal(SLACK_ENERGY_DELTA, 8);
  });

  it("slack with work-rest on target adds 8 instead", () => {
    const game = createInitialGame("r", []);
    game.phase = "BUFF_USAGE";
    const a = player("a", { inventory: ["buff_slack"] });
    const b = player("b", {
      energy: 10,
      // 已成功打出后留在 activeBuffs，后续摸鱼继续改判
      activeBuffs: [{ cardId: WORK_REST_CARD_ID }],
    });
    game.players = [a, b];
    const res = useBuffCard(game, "a", "buff_slack", { targetPlayerId: "b" });
    assert.equal(res.success, true);
    assert.equal(b.energy, 18);
  });

  it("work-rest on self grants passive without pending slack", () => {
    const game = createInitialGame("r", []);
    game.phase = "BUFF_USAGE";
    const b = player("b", { energy: 20, inventory: ["buff_work_rest"] });
    game.players = [b];
    const res = useBuffCard(game, "b", "buff_work_rest", { targetPlayerId: "b" });
    assert.equal(res.success, true);
    assert.deepEqual(b.inventory, []);
    assert.equal(b.activeBuffs.filter((x) => x.cardId === WORK_REST_CARD_ID).length, 1);
    assert.equal(res.notifyTargetId, undefined);
    assert.match(res.msg, /被摸鱼传染 \+8/);
  });

  it("work-rest on other player grants passive and notify fields", () => {
    const game = createInitialGame("r", []);
    game.phase = "BUFF_USAGE";
    const a = player("a", { inventory: ["buff_work_rest"] });
    const b = player("b", { energy: 20 });
    game.players = [a, b];
    const res = useBuffCard(game, "a", "buff_work_rest", { targetPlayerId: "b" });
    assert.equal(res.success, true);
    assert.equal(b.activeBuffs.some((x) => x.cardId === WORK_REST_CARD_ID), true);
    assert.equal(a.activeBuffs.some((x) => x.cardId === WORK_REST_CARD_ID), false);
    assert.equal(res.notifyTargetId, "b");
    assert.match(res.notifyTargetMsg ?? "", /为你发动了劳逸结合/);
    assert.match(
      (b.buffRoundNotes ?? []).find((n) => n.role === "hit" && n.cardId === WORK_REST_CARD_ID)?.text ?? "",
      /为你发动了劳逸结合/
    );
  });

  it("work-rest duplicate grant does not stack passive entries", () => {
    const game = createInitialGame("r", []);
    game.phase = "BUFF_USAGE";
    const a = player("a", { inventory: ["buff_work_rest", "buff_work_rest"] });
    const b = player("b", { energy: 20 });
    game.players = [a, b];
    useBuffCard(game, "a", "buff_work_rest", { targetPlayerId: "b", inventoryIndex: 0 });
    useBuffCard(game, "a", "buff_work_rest", { targetPlayerId: "b", inventoryIndex: 0 });
    assert.equal(b.activeBuffs.filter((x) => x.cardId === WORK_REST_CARD_ID).length, 1);
  });

  it("work-rest hit note is private to target", () => {
    const game = createInitialGame("r", []);
    game.phase = "BUFF_USAGE";
    const a = player("a", { inventory: ["buff_work_rest"] });
    const b = player("b", { energy: 20 });
    game.players = [a, b];
    useBuffCard(game, "a", "buff_work_rest", { targetPlayerId: "b" });

    const forCaster = serializeGameForClient(game, {}, "a") as {
      players: { id: string; buffRoundNotes?: unknown; activeBuffs?: unknown }[];
    };
    const targetFromCaster = forCaster.players.find((p) => p.id === "b")!;
    assert.equal(targetFromCaster.buffRoundNotes, undefined);
    assert.equal(targetFromCaster.activeBuffs, undefined);

    const forTarget = serializeGameForClient(game, {}, "b") as {
      players: { id: string; buffRoundNotes?: { role: string }[]; activeBuffs?: { cardId: string }[] }[];
    };
    const self = forTarget.players.find((p) => p.id === "b")!;
    assert.equal(self.buffRoundNotes?.some((n) => n.role === "hit"), true);
    assert.equal(self.activeBuffs?.some((b) => b.cardId === WORK_REST_CARD_ID), true);
  });

  it("work-rest from ally resolves pending slack on target", () => {
    const game = createInitialGame("r", []);
    game.phase = "BUFF_USAGE";
    const a = player("a", { inventory: ["buff_slack"] });
    const b = player("b", { energy: 20 });
    const c = player("c", { inventory: ["buff_work_rest"] });
    game.players = [a, b, c];
    useBuffCard(game, "a", "buff_slack", { targetPlayerId: "b" });
    assert.equal(b.energy, 12);
    const res = useBuffCard(game, "c", "buff_work_rest", { targetPlayerId: "b" });
    assert.equal(res.success, true);
    assert.equal(b.energy, 28);
    assert.equal(b.activeBuffs.some((x) => x.cardId === WORK_REST_CARD_ID), true);
    assert.equal(res.notifyTargetId, "b");
    assert.equal((b.pendingSlackHits ?? []).length, 0);
  });

  it("work-rest after slack converts the hit into +8", () => {
    const game = createInitialGame("r", []);
    game.phase = "BUFF_USAGE";
    const a = player("a", { inventory: ["buff_slack"] });
    const b = player("b", { energy: 20, inventory: ["buff_work_rest"] });
    game.players = [a, b];
    useBuffCard(game, "a", "buff_slack", { targetPlayerId: "b" });
    assert.equal(b.energy, 12);
    assert.equal(b.pendingSlackHits?.length, 1);
    const res = useBuffCard(game, "b", "buff_work_rest", { targetPlayerId: "b" });
    assert.equal(res.success, true);
    assert.equal(b.energy, 28);
    assert.deepEqual(b.slackedBy, []);
    assert.equal(b.pendingSlackHits?.length ?? 0, 0);
  });

  it("slack can drive energy below zero; work-rest still restores full hit plus 8", () => {
    const game = createInitialGame("r", []);
    game.phase = "BUFF_USAGE";
    const a = player("a", { inventory: ["buff_slack"] });
    const b = player("b", { energy: 3, inventory: ["buff_work_rest"] });
    game.players = [a, b];
    useBuffCard(game, "a", "buff_slack", { targetPlayerId: "b" });
    assert.equal(b.energy, -5);
    assert.equal(b.pendingSlackHits?.[0]?.energyDelta, -8);
    useBuffCard(game, "b", "buff_work_rest", { targetPlayerId: "b" });
    assert.equal(b.energy, 11);
  });

  it("self-slack with work-rest passive adds energy and pending hit +8", () => {
    const game = createInitialGame("r", []);
    game.phase = "BUFF_USAGE";
    const a = player("a", {
      inventory: ["buff_slack"],
      energy: 20,
      activeBuffs: [{ cardId: WORK_REST_CARD_ID }],
    });
    game.players = [a];
    const res = useBuffCard(game, "a", "buff_slack", { targetPlayerId: "a" });
    assert.equal(res.success, true);
    assert.equal(a.energy, 28);
    assert.equal((a.buffRoundNotes ?? []).filter((n) => n.role === "hit").length, 0);
    assert.match(res.msg, /劳逸结合/);
    assert.equal(a.pendingSlackHits?.[0]?.energyDelta, 8);
  });

  it("slack clears investmentDraft when energy goes negative; keeps draft when still non-negative", () => {
    const game = createInitialGame("r", []);
    game.phase = "BUFF_USAGE";
    const a = player("a", { inventory: ["buff_slack", "buff_slack"] });
    const low = player("low", { energy: 3, investmentDraft: { 1: 2 } });
    const ok = player("ok", { energy: 12, investmentDraft: { 1: 5 } });
    game.players = [a, low, ok];
    useBuffCard(game, "a", "buff_slack", { targetPlayerId: "low" });
    assert.equal(low.energy, -5);
    assert.equal(low.investmentDraft, undefined);

    useBuffCard(game, "a", "buff_slack", { targetPlayerId: "ok" });
    assert.equal(ok.energy, 4);
    assert.deepEqual(ok.investmentDraft, { 1: 5 });
  });

  it("slack auto-unlocks locked investment when energy goes negative in INVESTMENT", () => {
    const game = createInitialGame("r", []);
    game.phase = "INVESTMENT";
    game.activeProjects = [shortProject(1)];
    const a = player("a", { inventory: ["buff_slack"] });
    const victim = player("victim", {
      energy: 0,
      ready: true,
      investment: { 1: 10 },
      investedShortEnergy: 10,
      totalEnergyConsumed: 10,
    });
    game.players = [a, victim];
    game.readyPlayers.add("victim");

    const res = useBuffCard(game, "a", "buff_slack", { targetPlayerId: "victim" });
    assert.equal(res.success, true);
    if (res.success) {
      assert.equal(res.investmentAutoUnlocked, true);
      assert.match(res.notifyTargetMsg ?? "", /自动解锁投资/);
    }
    assert.equal(victim.energy, 2);
    assert.equal(victim.ready, false);
    assert.equal(game.readyPlayers.has("victim"), false);
    assert.deepEqual(victim.investment, {});
    assert.deepEqual(victim.investmentDraft, { 1: 2 });
    assert.equal(victim.investedShortEnergy, 0);
    assert.equal(victim.pendingSlackHits?.[0]?.investmentAutoUnlocked, true);
    assert.match(game.logs.join("\n"), /因摸鱼精力为负/);
  });

  it("slack keeps locked investment when energy stays non-negative", () => {
    const game = createInitialGame("r", []);
    game.phase = "INVESTMENT";
    game.activeProjects = [shortProject(1)];
    const a = player("a", { inventory: ["buff_slack"] });
    const victim = player("victim", {
      energy: 8,
      ready: true,
      investment: { 1: 10 },
      investedShortEnergy: 10,
      totalEnergyConsumed: 10,
    });
    game.players = [a, victim];
    game.readyPlayers.add("victim");

    const res = useBuffCard(game, "a", "buff_slack", { targetPlayerId: "victim" });
    assert.equal(res.success, true);
    if (res.success) {
      assert.notEqual(res.investmentAutoUnlocked, true);
    }
    assert.equal(victim.energy, 0);
    assert.equal(victim.ready, true);
    assert.equal(game.readyPlayers.has("victim"), true);
    assert.deepEqual(victim.investment, { 1: 10 });
  });

  it("short wipe clears project investments and returns empty gains", () => {
    const game = createInitialGame("r", []);
    const proj = shortProject(1);
    const a = player("a", {
      investment: { 1: 7 },
      longTerm: { 1: { totalInvested: 12, status: "active" } },
      activeBuffs: [{ cardId: "buff_short", targetProjectId: 1 }],
    });
    const b = player("b", { investment: { 1: 5 } });
    game.players = [a, b];
    game.activeProjects = [proj];
    const logs: string[] = [];
    const result = settleOneProject(game, proj, logs);
    assert.equal(result.shortSold, true);
    assert.deepEqual(result.playerGains, {});
    assert.equal(proj.accumulatedInvested, 0);
    assert.deepEqual(proj.investorRecords, {});
    assert.deepEqual(proj.investorRoundSlices, {});
    assert.equal(a.investment[1], 0);
    assert.equal(a.longTerm[1], undefined);
    // investorRecords 历史 + 本轮投入
    assert.equal(result.playerInvestments.a, 14);
    assert.equal(result.playerInvestments.b, 10);
    assert.match(logs.join("\n"), /项目做空/);
  });

  it("short wipe lists prior holders even with zero round invest", () => {
    const game = createInitialGame("r", []);
    const proj = shortProject(1);
    proj.investorRecords = { a: 9, c: 3 };
    proj.accumulatedInvested = 12;
    const a = player("a", {
      investment: { 1: 0 },
      activeBuffs: [{ cardId: "buff_short", targetProjectId: 1 }],
    });
    const c = player("c", { investment: {} });
    game.players = [a, c];
    game.activeProjects = [proj];
    const result = settleOneProject(game, proj, []);
    assert.equal(result.shortSold, true);
    assert.equal(result.playerInvestments.a, 9);
    assert.equal(result.playerInvestments.c, 3);
  });

  it("short wipe clears accumulated energy and keeps historical wealth", () => {
    const game = createInitialGame("r", []);
    const proj = shortProject(201);
    proj.type = "risk";
    proj.maxEnergy = 10;
    proj.accumulatedInvested = 4;
    proj.investorRecords = { a: 4 };
    const a = player("a", {
      wealth: 200,
      investment: { 201: 2 },
      riskGains: { 201: 80 },
      activeBuffs: [{ cardId: "buff_short", targetProjectId: 201 }],
    });
    game.players = [a];
    game.activeProjects = [proj];
    const logs: string[] = [];
    const result = settleOneProject(game, proj, logs);
    assert.equal(result.shortSold, true);
    assert.equal(a.wealth, 200);
    assert.equal(a.riskGains[201], 0);
    assert.equal(a.investment[201], 0);
    assert.equal(proj.accumulatedInvested, 0);
    assert.deepEqual(result.playerGains, {});
    assert.match(logs.join("\n"), /已入账财富不追回/);
  });

  it("short wipe keeps project on board and resets empty-round counter", () => {
    const game = createInitialGame("r", []);
    const proj = shortProject(1);
    proj.roundsNoInvestment = 1;
    proj.accumulatedInvested = 5;
    proj.investorRecords = { a: 5 };
    proj.earningRecords = { a: 20 };
    proj.totalPayout = 20;
    const a = player("a", {
      wealth: 150,
      riskGains: { 1: 20 },
      activeBuffs: [{ cardId: "buff_short", targetProjectId: 1 }],
    });
    game.players = [a];
    game.activeProjects = [proj];

    settlePhase(game);

    assert.equal(game.activeProjects.length, 1);
    assert.equal(game.activeProjects[0]?.id, 1);
    assert.equal(game.activeProjects[0]?.roundsNoInvestment, 0);
    assert.equal(game.activeProjects[0]?.accumulatedInvested, 0);
    assert.deepEqual(game.activeProjects[0]?.earningRecords, {});
    assert.equal(a.wealth, 150);
    assert.equal(a.riskGains[1], 0);
    assert.equal(game.lastSettlement?.results[0]?.shortSold, true);
  });

  it("project with prior investment stays after two empty rounds", () => {
    const game = createInitialGame("r", []);
    const proj = shortProject(1);
    proj.maxEnergy = 100;
    proj.accumulatedInvested = 30;
    proj.investorRecords = { a: 30 };
    proj.currentInvested = 0;
    game.players = [player("a", { investment: {} })];
    game.activeProjects = [proj];

    settlePhase(game);
    assert.equal(game.activeProjects.length, 1);
    assert.equal(game.activeProjects[0]?.roundsNoInvestment, 1);

    settlePhase(game);
    assert.equal(game.activeProjects.length, 1);
    assert.equal(game.activeProjects[0]?.id, 1);
    assert.equal(game.uncompletedProjects.length, 0);
  });

  it("shorted project leaves only after two empty rounds", () => {
    const game = createInitialGame("r", []);
    const proj = shortProject(1);
    proj.accumulatedInvested = 0;
    proj.investorRecords = {};
    const a = player("a", {
      activeBuffs: [{ cardId: "buff_short", targetProjectId: 1 }],
    });
    game.players = [a];
    game.activeProjects = [proj];

    settlePhase(game);
    assert.equal(game.activeProjects[0]?.roundsNoInvestment, 0);

    a.activeBuffs = [];
    a.investment = {};
    settlePhase(game);
    assert.equal(game.activeProjects.length, 1);
    assert.equal(game.activeProjects[0]?.roundsNoInvestment, 1);

    settlePhase(game);
    assert.equal(game.activeProjects.length, 0);
    assert.equal(game.uncompletedProjects.some((p) => p.id === 1), true);
  });

  it("insurance and lottery use floor(*1.5) with gold", () => {
    const withGold = player("g", { activeBuffs: [{ cardId: "buff_gold" }] });
    assert.equal(applyGoldMultiplier(withGold, 100), 150);
    assert.equal(applyGoldMultiplier(withGold, 101), 151);

    const game = createInitialGame("r", []);
    const p = player("p", {
      wealth: 10,
      activeBuffs: [{ cardId: "buff_lottery" }, { cardId: "buff_gold" }],
    });
    game.players = [p];
    applyLotteryAccept(game, p, 100);
    assert.equal(p.wealth, 160);
  });

  it("gold amplifies positive rank and era separately into breakdown", () => {
    const game = createInitialGame("r", []);
    const proj: ActiveProject = {
      id: 1,
      name: "P1",
      type: "short",
      era: "科技",
      maxEnergy: 10,
      accumulatedInvested: 0,
      currentInvested: 0,
      rankRewards: [20, 10],
      overInvestPenalty: [-10, -5],
      investorRecords: {},
      earningRecords: {},
      totalPayout: 0,
      roundsNoInvestment: 0,
      investedThisRound: true,
    };
    const a = player("a", {
      wealth: 0,
      investment: { 1: 10 },
      activeBuffs: [{ cardId: "buff_gold" }],
    });
    game.players = [a];
    game.activeProjects = [proj];
    game.currentEraCard = {
      id: 1,
      name: "科技",
      era: "科技",
      description: "",
      themeColor: "#3b82f6",
    };
    const result = settleOneProject(game, proj, []);
    // base 10*10=100 → floor(100*1.5)=150；rank 20 → 30；era 50 → 75
    assert.equal(result.playerGains.a?.base, 150);
    assert.equal(result.playerGains.a?.rank, 30);
    assert.equal(result.playerGains.a?.era, 75);
    assert.equal(result.playerGains.a?.baseBeforeGold, 100);
    assert.equal(result.playerGains.a?.rankBeforeGold, 20);
    assert.equal(result.playerGains.a?.eraBeforeGold, 50);
    assert.equal(result.playerGains.a?.total, 150 + 30 + 75);
    assert.equal(
      result.playerGains.a!.base + result.playerGains.a!.rank + result.playerGains.a!.era,
      result.playerGains.a!.total
    );
  });

  it("force buy can use a second copy granted by admin", () => {
    const game = createInitialGame("r", []);
    game.phase = "AUCTION";
    game.currentEra = 3;
    beginAuctionSession(game);
    game.auctionFocusCardId = "buff_short";
    const p = player("p", { inventory: [FORCE_BUY_CARD_ID] });
    game.players = [p];

    const first = useForceBuyCard(game, "p");
    assert.equal(first.success, true);
    assert.ok(p.inventory.includes("buff_short"));
    assert.ok(!p.inventory.includes(FORCE_BUY_CARD_ID));

    p.inventory.push(FORCE_BUY_CARD_ID);
    game.auctionFocusCardId = "buff_work_rest";
    const second = useForceBuyCard(game, "p");
    assert.equal(second.success, true);
    assert.ok(p.inventory.includes("buff_work_rest"));
  });

  it("lighter defers inventory burn until settlement ack", () => {
    const game = createInitialGame("r", []);
    game.phase = "BUFF_USAGE";
    const a = player("a", { inventory: [LIGHTER_CARD_ID] });
    const b = player("b", {
      inventory: ["buff_insurance"],
      activeBuffs: [{ cardId: WORK_REST_CARD_ID }],
    });
    game.players = [a, b];
    const res = useBuffCard(game, "a", LIGHTER_CARD_ID, {
      targetPlayerId: "b",
      burnCardId: "buff_insurance",
    });
    assert.equal(res.success, true);
    assert.match(res.msg, /结算时判定/);
    assert.deepEqual(b.inventory, ["buff_insurance"]);
    assert.equal(res.notifyTargetId, undefined);
    resolveRoundBuffsAtSettlement(game);
    assert.equal(b.pendingLighterBurnNotices?.length, 1);
    assert.equal(b.pendingLighterBurnNotices?.[0]?.kind, "inventory");
    assert.deepEqual(b.inventory, ["buff_insurance"]);
    const noticeId = b.pendingLighterBurnNotices?.[0]?.id;
    assert.equal(ackLighterBurnNotice(game, "b", noticeId), true);
    assert.deepEqual(b.inventory, []);
  });

  it("lighter at settlement voids played activeBuff", () => {
    const game = createInitialGame("r", []);
    game.phase = "BUFF_USAGE";
    const a = player("a", { inventory: [LIGHTER_CARD_ID] });
    const b = player("b", {
      inventory: [],
      activeBuffs: [{ cardId: "buff_insurance" }],
    });
    game.players = [a, b];
    useBuffCard(game, "a", LIGHTER_CARD_ID, {
      targetPlayerId: "b",
      burnCardId: "buff_insurance",
    });
    resolveRoundBuffsAtSettlement(game);
    assert.equal(b.activeBuffs.some((x) => x.cardId === "buff_insurance"), false);
    assert.equal(b.pendingLighterBurnNotices?.[0]?.kind, "played");
  });

  it("lighter hits inventory at settlement even when target locked investment", () => {
    const game = createInitialGame("r", []);
    game.phase = "INVESTMENT";
    const a = player("a", { inventory: [LIGHTER_CARD_ID] });
    const b = player("b", { inventory: ["buff_insurance"], activeBuffs: [], ready: true });
    game.players = [a, b];
    useBuffCard(game, "a", LIGHTER_CARD_ID, {
      targetPlayerId: "b",
      burnCardId: "buff_insurance",
    });
    resolveRoundBuffsAtSettlement(game);
    assert.equal(b.pendingLighterBurnNotices?.length, 1);
    assert.deepEqual(b.inventory, ["buff_insurance"]);
  });

  it("lighter miss at settlement only tells the target, never the caster", () => {
    const game = createInitialGame("r", []);
    game.phase = "BUFF_USAGE";
    const a = player("a", { inventory: [LIGHTER_CARD_ID] });
    const b = player("b", { inventory: ["buff_gold"], activeBuffs: [] });
    game.players = [a, b];
    const res = useBuffCard(game, "a", LIGHTER_CARD_ID, {
      targetPlayerId: "b",
      burnCardId: "buff_insurance",
    });
    assert.equal(res.success, true);
    assert.equal(res.notifyTargetId, undefined);
    const summary = resolveRoundBuffsAtSettlement(game);
    assert.equal(summary.misses, 1);
    // 使用者没有命中反馈；被指定者收到「未烧中」提示，且手牌不变
    assert.equal((a.pendingLighterBurnNotices ?? []).length, 0);
    assert.equal(b.pendingLighterBurnNotices?.length, 1);
    assert.equal(b.pendingLighterBurnNotices?.[0]?.kind, "miss");
    assert.deepEqual(b.inventory, ["buff_gold"]);
    assert.equal(
      ackLighterBurnNotice(game, "b", b.pendingLighterBurnNotices?.[0]?.id),
      true
    );
    assert.equal(b.pendingLighterBurnNotices?.length, 0);
    assert.deepEqual(b.inventory, ["buff_gold"]);
  });

  it("lighter hit and miss share the same public log line shape", () => {
    const game = createInitialGame("r", []);
    game.phase = "BUFF_USAGE";
    const a = player("a", { inventory: [LIGHTER_CARD_ID, LIGHTER_CARD_ID] });
    const b = player("b", { inventory: ["buff_insurance"], activeBuffs: [] });
    game.players = [a, b];
    useBuffCard(game, "a", LIGHTER_CARD_ID, {
      targetPlayerId: "b",
      burnCardId: "buff_gold",
    });
    useBuffCard(game, "a", LIGHTER_CARD_ID, {
      targetPlayerId: "b",
      burnCardId: "buff_insurance",
    });
    const lighterLogs = game.logs.filter((l) => l.includes("打火机"));
    assert.deepEqual(lighterLogs, [
      "🔥 a 对 b 使用【打火机】，指定【点石成金】",
      "🔥 a 对 b 使用【打火机】，指定【保险】",
    ]);
  });

  it("lighter cannot burn own cards", () => {
    const game = createInitialGame("r", []);
    game.phase = "BUFF_USAGE";
    const a = player("a", {
      inventory: [LIGHTER_CARD_ID, "buff_insurance"],
      activeBuffs: [{ cardId: WORK_REST_CARD_ID }],
    });
    game.players = [a];
    const res = useBuffCard(game, "a", LIGHTER_CARD_ID, {
      targetPlayerId: "a",
      burnCardId: "buff_insurance",
    });
    assert.equal(res.success, false);
    if (!res.success) assert.match(res.msg, /不能烧毁自己/);
    assert.equal(a.inventory.includes(LIGHTER_CARD_ID), true);
    assert.equal(a.inventory.includes("buff_insurance"), true);
    assert.equal(a.activeBuffs.some((x) => x.cardId === WORK_REST_CARD_ID), true);
  });

  it("lighter holder does not see others unplayed hand or burnable hints", () => {
    const game = createInitialGame("r", []);
    const held = player("held", {
      inventory: ["buff_insurance"],
      activeBuffs: [],
      usedCards: ["buff_slack"],
    });
    const active = player("active", {
      inventory: [],
      activeBuffs: [{ cardId: "buff_insurance" }],
      usedCards: [],
    });
    const viewer = player("viewer", { inventory: [LIGHTER_CARD_ID] });
    game.players = [held, active, viewer];
    game.auctionCompletedDeals = [
      { cardId: "buff_insurance", playerId: "held", cost: 40, source: "hammer", auctionRound: 1 },
      { cardId: "buff_slack", playerId: "held", cost: 30, source: "hammer", auctionRound: 1 },
      { cardId: "buff_gold", playerId: "active", cost: 50, source: "hammer", auctionRound: 2 },
      { cardId: LIGHTER_CARD_ID, playerId: "active", cost: 55, source: "hammer", auctionRound: 3 },
    ];

    const forViewer = serializeGameForClient(game, {}, "viewer") as {
      players: {
        id: string;
        inventory?: string[];
        activeBuffs?: unknown;
        usedCards?: string[];
        burnableCardIds?: string[];
      }[];
    };
    const heldView = forViewer.players.find((p) => p.id === "held")!;
    const activeView = forViewer.players.find((p) => p.id === "active")!;
    assert.equal(heldView.burnableCardIds, undefined);
    assert.equal(activeView.burnableCardIds, undefined);
    assert.equal(heldView.inventory, undefined);
    assert.equal(heldView.activeBuffs, undefined);
    assert.equal(heldView.usedCards, undefined);
    assert.equal(activeView.inventory, undefined);
    assert.equal(activeView.activeBuffs, undefined);

    const forHeld = serializeGameForClient(game, {}, "held") as {
      players: { id: string; burnableCardIds?: string[]; inventory?: string[] }[];
    };
    const activeFromHeld = forHeld.players.find((p) => p.id === "active")!;
    assert.equal(activeFromHeld.burnableCardIds, undefined);
    const me = forHeld.players.find((p) => p.id === "held")!;
    assert.deepEqual(me.inventory, ["buff_insurance"]);
  });

  it("lighter burn notice is private to victim after settlement", () => {
    const game = createInitialGame("r", []);
    game.phase = "BUFF_USAGE";
    const a = player("a", { inventory: [LIGHTER_CARD_ID] });
    const b = player("b", { inventory: ["buff_insurance"], activeBuffs: [] });
    game.players = [a, b];
    useBuffCard(game, "a", LIGHTER_CARD_ID, {
      targetPlayerId: "b",
      burnCardId: "buff_insurance",
    });
    resolveRoundBuffsAtSettlement(game);

    const forAttacker = serializeGameForClient(game, {}, "a") as {
      players: { id: string; pendingLighterBurnNotices?: unknown }[];
    };
    assert.equal(forAttacker.players.find((p) => p.id === "b")?.pendingLighterBurnNotices, undefined);

    const forVictim = serializeGameForClient(game, {}, "b") as {
      players: { id: string; pendingLighterBurnNotices?: { kind: string }[] }[];
    };
    assert.equal(forVictim.players.find((p) => p.id === "b")?.pendingLighterBurnNotices?.length, 1);
  });

  it("lighter cannot target another lighter card id", () => {
    const game = createInitialGame("r", []);
    game.phase = "BUFF_USAGE";
    const a = player("a", { inventory: [LIGHTER_CARD_ID] });
    const b = player("b", { inventory: [LIGHTER_CARD_ID] });
    game.players = [a, b];
    const res = useBuffCard(game, "a", LIGHTER_CARD_ID, {
      targetPlayerId: "b",
      burnCardId: LIGHTER_CARD_ID,
    });
    assert.equal(res.success, false);
    if (!res.success) assert.match(res.msg, /不可烧毁/);
    assert.equal(a.inventory.includes(LIGHTER_CARD_ID), true);
    assert.equal(b.inventory.includes(LIGHTER_CARD_ID), true);
  });

  it("self-slack does not push hit note", () => {
    const game = createInitialGame("r", []);
    game.phase = "BUFF_USAGE";
    const a = player("a", { inventory: ["buff_slack"], energy: 20 });
    game.players = [a];
    const res = useBuffCard(game, "a", "buff_slack", { targetPlayerId: "a" });
    assert.equal(res.success, true);
    assert.equal(a.energy, 12);
    assert.equal((a.buffRoundNotes ?? []).filter((n) => n.role === "hit").length, 0);
    assert.equal((a.buffRoundNotes ?? []).some((n) => n.role === "used"), true);
    assert.equal(a.pendingSlackHits?.length, 1);
    assert.equal(a.pendingSlackHits?.[0]?.energyDelta, -8);
    assert.equal(a.pendingSlackHits?.[0]?.fromName, "你自己");
  });

  it("slack hit waits for the target to confirm and stays private", () => {
    const game = createInitialGame("r", []);
    game.phase = "BUFF_USAGE";
    const a = player("a", { inventory: ["buff_slack"] });
    const b = player("b", { energy: 15 });
    game.players = [a, b];
    useBuffCard(game, "a", "buff_slack", { targetPlayerId: "b" });
    assert.equal(b.pendingSlackHits?.length, 1);
    assert.equal(b.pendingSlackHits?.[0]?.fromName, "有人");
    assert.equal(
      (b.buffRoundNotes ?? []).find((n) => n.role === "hit")?.text,
      "有人对你使用摸鱼传染，精力 -8"
    );
    assert.equal(b.pendingSlackHits?.[0]?.energyAfter, 7);

    type SerializedPlayer = {
      id: string;
      pendingSlackHits?: unknown[];
      slackedBy?: string[];
    };
    const forA = serializeGameForClient(game, {}, "a") as { players: SerializedPlayer[] };
    assert.equal(forA.players.find((p) => p.id === "b")?.pendingSlackHits, undefined);
    assert.deepEqual(forA.players.find((p) => p.id === "b")?.slackedBy, []);
    const forB = serializeGameForClient(game, {}, "b") as { players: SerializedPlayer[] };
    assert.equal(forB.players.find((p) => p.id === "b")?.pendingSlackHits?.length, 1);
    assert.deepEqual(forB.players.find((p) => p.id === "b")?.slackedBy, []);
    assert.equal(b.slackedBy?.includes("a"), true);

    assert.equal(ackSlackHit(game, "b", b.pendingSlackHits?.[0]?.id), true);
    assert.equal(b.pendingSlackHits?.length, 0);
  });

  it("force buy voids open bids on focus card and advances focus", () => {
    const game = createInitialGame("r", []);
    game.phase = "AUCTION";
    game.currentEra = 3;
    beginAuctionSession(game);
    game.auctionFocusCardId = "buff_short";
    game.auctionBids = [
      {
        bidId: "b1",
        auctionRound: 2,
        cardId: "buff_short",
        playerId: "other",
        playerName: "other",
        amount: 10,
        wealthAtBid: 100,
        availableWealthAtBid: 100,
        bidToAvailableRatio: 0.1,
        timestamp: Date.now(),
        status: "leading",
      },
    ];
    const p = player("p", { inventory: [FORCE_BUY_CARD_ID] });
    game.players = [p, player("other")];
    const res = useForceBuyCard(game, "p");
    assert.equal(res.success, true);
    assert.equal(game.auctionBids?.[0]?.status, "void_force_buy");
    assert.equal(game.auctionFocusCardId, "buff_force_buy");
  });

  it("force buy uses each physical copy once when admin granted extras", () => {
    const game = createInitialGame("r", []);
    game.phase = "AUCTION";
    game.currentEra = 2;
    beginAuctionSession(game);
    game.auctionFocusCardId = "buff_gold";
    const p = player("p", { inventory: [FORCE_BUY_CARD_ID, FORCE_BUY_CARD_ID] });
    game.players = [p, player("other")];
    assert.equal(useForceBuyCard(game, "p").success, true);
    assert.equal(p.inventory.filter((c) => c === FORCE_BUY_CARD_ID).length, 1);
    assert.equal(useForceBuyCard(game, "p").success, true);
    assert.equal(p.inventory.filter((c) => c === FORCE_BUY_CARD_ID).length, 0);
  });

  it("lighter burning a converted slack also removes that work-rest conversion", () => {
    const game = createInitialGame("r", []);
    game.phase = "BUFF_USAGE";
    const a = player("a", { inventory: ["buff_slack", "buff_slack", LIGHTER_CARD_ID] });
    const c = player("c", { inventory: [WORK_REST_CARD_ID] });
    const b = player("b", { energy: 20 });
    game.players = [a, b, c];

    useBuffCard(game, "a", "buff_slack", { targetPlayerId: "b" });
    useBuffCard(game, "a", "buff_slack", { targetPlayerId: "b" });
    assert.equal(b.energy, 4);
    useBuffCard(game, "c", WORK_REST_CARD_ID, { targetPlayerId: "b" });
    assert.equal(b.energy, 36); // 两次摸鱼各改判为 +8

    useBuffCard(game, "a", LIGHTER_CARD_ID, {
      targetPlayerId: "b",
      burnCardId: "buff_slack",
    });
    resolveRoundBuffsAtSettlement(game);

    // 仍有一次摸鱼被劳逸结合改判：20 + 8 = 28，而不是 44
    assert.equal(b.energy, 28);
    const workRestPlay = game.roundBuffPlays?.find((p) => p.cardId === WORK_REST_CARD_ID);
    assert.equal(workRestPlay?.energyDeltas[0]?.delta, 16);
    const remainingSlack = game.roundBuffPlays?.filter(
      (p) => p.cardId === "buff_slack" && !p.voided
    );
    assert.equal(remainingSlack?.length, 1);
    assert.ok(remainingSlack?.[0]?.convertedByPlayId);
    assert.equal(b.pendingSlackHits?.length, 0);
  });

  it("lighter burning work-rest restores the slack and leaves it convertible again", () => {
    const game = createInitialGame("r", []);
    game.phase = "BUFF_USAGE";
    const a = player("a", { inventory: ["buff_slack", LIGHTER_CARD_ID] });
    const c = player("c", { inventory: [WORK_REST_CARD_ID, WORK_REST_CARD_ID] });
    const b = player("b", { energy: 20 });
    game.players = [a, b, c];

    useBuffCard(game, "a", "buff_slack", { targetPlayerId: "b" });
    assert.equal(b.energy, 12);
    useBuffCard(game, "c", WORK_REST_CARD_ID, { targetPlayerId: "b" });
    assert.equal(b.energy, 28);
    useBuffCard(game, "a", LIGHTER_CARD_ID, {
      targetPlayerId: "b",
      burnCardId: WORK_REST_CARD_ID,
    });
    resolveRoundBuffsAtSettlement(game);
    assert.equal(b.energy, 12);

    const slackPlay = game.roundBuffPlays?.find((p) => p.cardId === "buff_slack");
    assert.equal(slackPlay?.convertedByPlayId, undefined);
    // 作废后仍可再被一张新的劳逸结合改判
    useBuffCard(game, "c", WORK_REST_CARD_ID, { targetPlayerId: "b" });
    assert.equal(b.energy, 28);
  });

  it("lighter burning work-rest also reverts slacks cast while the passive was active", () => {
    const game = createInitialGame("r", []);
    game.phase = "BUFF_USAGE";
    const a = player("a", { inventory: ["buff_slack", LIGHTER_CARD_ID] });
    const c = player("c", { inventory: [WORK_REST_CARD_ID] });
    const b = player("b", { energy: 20 });
    game.players = [a, b, c];

    useBuffCard(game, "c", WORK_REST_CARD_ID, { targetPlayerId: "b" });
    useBuffCard(game, "a", "buff_slack", { targetPlayerId: "b" });
    assert.equal(b.energy, 28); // 劳逸被动生效，摸鱼改为 +8

    useBuffCard(game, "a", LIGHTER_CARD_ID, {
      targetPlayerId: "b",
      burnCardId: WORK_REST_CARD_ID,
    });
    resolveRoundBuffsAtSettlement(game);

    // 劳逸被作废后，这次摸鱼应恢复为 -8：20 - 8 = 12
    assert.equal(b.energy, 12);
    const slackPlay = game.roundBuffPlays?.find((p) => p.cardId === "buff_slack");
    assert.equal(slackPlay?.energyDeltas[0]?.delta, -8);
    assert.equal(slackPlay?.passiveWorkRestInstanceId, undefined);
  });

  it("lighter burns only one copy of the declared kind", () => {
    const game = createInitialGame("r", []);
    game.phase = "BUFF_USAGE";
    const a = player("a", { inventory: [LIGHTER_CARD_ID] });
    const b = player("b", { inventory: ["buff_insurance", "buff_insurance"] });
    game.players = [a, b];
    useBuffCard(game, "a", LIGHTER_CARD_ID, {
      targetPlayerId: "b",
      burnCardId: "buff_insurance",
    });
    resolveRoundBuffsAtSettlement(game);
    assert.equal(b.pendingLighterBurnNotices?.length, 1);
    assert.equal(ackLighterBurnNotice(game, "b", b.pendingLighterBurnNotices?.[0]?.id), true);
    assert.equal(b.inventory.filter((c) => c === "buff_insurance").length, 1);
  });

  it("lighter countering a converted slack spends work-rest without refunding it", () => {
    const game = createInitialGame("r", []);
    game.phase = "BUFF_USAGE";
    const a = player("a", { inventory: ["buff_slack"] });
    const b = player("b", { energy: 20 });
    const c = player("c", { inventory: [WORK_REST_CARD_ID] });
    const d = player("d", { inventory: [LIGHTER_CARD_ID] });
    game.players = [a, b, c, d];

    // A 摸鱼 B → B 用劳逸结合改判 → D 对 A 打出的那张摸鱼用打火机
    useBuffCard(game, "a", "buff_slack", { targetPlayerId: "b" });
    assert.equal(b.energy, 12);
    useBuffCard(game, "c", WORK_REST_CARD_ID, { targetPlayerId: "b" });
    assert.equal(b.energy, 28);
    useBuffCard(game, "d", LIGHTER_CARD_ID, {
      targetPlayerId: "a",
      burnCardId: "buff_slack",
    });
    resolveRoundBuffsAtSettlement(game);

    // 改判撤销后 B 回到 20；劳逸结合已经被消耗，不会退回 C 的手牌
    assert.equal(b.energy, 20);
    assert.equal(c.inventory.includes(WORK_REST_CARD_ID), false);
    // 劳逸结合仍作为本卡生效轮次内的被动保留
    assert.equal(
      b.activeBuffs.some((x) => x.cardId === WORK_REST_CARD_ID),
      true
    );
    const workRestPlay = game.roundBuffPlays?.find((p) => p.cardId === WORK_REST_CARD_ID);
    assert.equal(workRestPlay?.voided, false);
    assert.equal(workRestPlay?.energyDeltas[0]?.delta, 0);
    const slackPlay = game.roundBuffPlays?.find((p) => p.cardId === "buff_slack");
    assert.equal(slackPlay?.voided, true);

    // 只有被指定的 A 收到打火机提示；使用者 D 看不到命中结果
    assert.equal(a.pendingLighterBurnNotices?.[0]?.kind, "played");
    assert.equal((d.pendingLighterBurnNotices ?? []).length, 0);
    // B 会看到自己的精力因改判撤销而调整
    assert.ok((b.buffRoundNotes ?? []).some((n) => n.text.includes("打火机")));
  });

  it("player payload hides light-burn internals and other players' project records", () => {
    const game = createInitialGame("r", []);
    game.phase = "INVESTMENT";
    const a = player("a");
    const b = player("b", {
      longTerm: { 101: { totalInvested: 5, status: "active" } },
      coffeePurchasesThisRound: 2,
      totalEnergyConsumed: 30,
      investedRiskEnergy: 3,
    });
    game.players = [a, b];
    game.roundBuffPlays = [
      {
        playId: "play-1",
        ownerId: "a",
        cardId: "buff_slack",
        targetPlayerId: "b",
        energyDeltas: [{ playerId: "b", delta: -8 }],
        voided: false,
      },
    ];
    game.lighterBurnDeclarations = [
      {
        id: "decl-1",
        casterId: "a",
        casterName: "a",
        targetPlayerId: "b",
        burnCardId: "buff_gold",
      },
    ];
    game.playerLogs = { a: ["只有 a 自己能看的日志"] };
    game.lastSettlement = {
      round: 1,
      results: [],
      lighterResolve: { hits: 1, misses: 0 },
    };
    const project = shortProject();
    project.investorRecords = { a: 7, b: 5 };
    project.investorRoundSlices = { a: [7], b: [5] };
    project.earningRecords = { a: 70, b: 50 };
    game.activeProjects = [project];

    const forA = serializeGameForClient(game, {}, "a") as Record<string, unknown> & {
      activeProjects: ActiveProject[];
      players?: Player[];
      lastSettlement?: { lighterResolve?: unknown };
    };
    assert.equal(forA.roundBuffPlays, undefined);
    assert.equal(forA.lighterBurnDeclarations, undefined);
    assert.equal(forA.playerLogs, undefined);
    assert.equal(forA.lastSettlement?.lighterResolve, undefined);
    assert.deepEqual(forA.activeProjects[0]?.investorRecords, { a: 7 });
    assert.deepEqual(forA.activeProjects[0]?.investorRoundSlices, { a: [7] });
    assert.deepEqual(forA.activeProjects[0]?.earningRecords, {});
    const bView = forA.players?.find((p) => p.id === "b");
    assert.deepEqual(bView?.longTerm, {});
    assert.equal(bView?.coffeePurchasesThisRound, undefined);
    assert.equal(bView?.totalEnergyConsumed, undefined);
    assert.equal(bView?.investedRiskEnergy, undefined);

    const god = serializeGameForClient(game, { isGodView: true }, null) as Record<string, unknown> & {
      activeProjects: ActiveProject[];
      players?: Player[];
      lastSettlement?: { lighterResolve?: unknown };
    };
    assert.ok(Array.isArray(god.roundBuffPlays));
    assert.ok(Array.isArray(god.lighterBurnDeclarations));
    assert.equal(god.lastSettlement?.lighterResolve !== undefined, true);
    assert.deepEqual(god.activeProjects[0]?.investorRecords, { a: 7, b: 5 });
    const godB = god.players?.find((p) => p.id === "b");
    assert.equal(godB?.longTerm[101]?.totalInvested, 5);
    assert.equal(godB?.coffeePurchasesThisRound, 2);
  });

  it("force buy rejects outside auction, without focus, and cannot buy itself", () => {
    const game = createInitialGame("r", []);
    const p = player("p", {
      inventory: [FORCE_BUY_CARD_ID, FORCE_BUY_CARD_ID, FORCE_BUY_CARD_ID],
    });
    game.players = [p];

    game.phase = "BUFF_USAGE";
    assert.equal(useForceBuyCard(game, "p").success, false);

    game.phase = "AUCTION";
    game.currentEra = 2;
    beginAuctionSession(game);
    game.auctionFocusCardId = undefined;
    assert.equal(useForceBuyCard(game, "p").success, false);

    game.auctionFocusCardId = FORCE_BUY_CARD_ID;
    assert.equal(useForceBuyCard(game, "p").success, false);
    // 三次失败都不消耗手牌
    assert.equal(p.inventory.filter((c) => c === FORCE_BUY_CARD_ID).length, 3);
  });

  it("lighter voids the played copy before touching the same card in hand", () => {
    const game = createInitialGame("r", []);
    game.phase = "BUFF_USAGE";
    const a = player("a", { inventory: [LIGHTER_CARD_ID] });
    const b = player("b", {
      inventory: ["buff_insurance"],
      activeBuffs: [{ cardId: "buff_insurance" }],
    });
    game.players = [a, b];

    useBuffCard(game, "a", LIGHTER_CARD_ID, {
      targetPlayerId: "b",
      burnCardId: "buff_insurance",
    });
    resolveRoundBuffsAtSettlement(game);

    // 已打出的一张被作废；手牌里的同名卡保留
    assert.equal(b.activeBuffs.some((x) => x.cardId === "buff_insurance"), false);
    assert.deepEqual(b.inventory, ["buff_insurance"]);
    assert.equal(b.pendingLighterBurnNotices?.[0]?.kind, "played");
    // 确认命中提示不应误删手牌
    ackLighterBurnNotice(game, "b", b.pendingLighterBurnNotices?.[0]?.id);
    assert.deepEqual(b.inventory, ["buff_insurance"]);
  });
});
