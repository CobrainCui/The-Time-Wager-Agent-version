import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  groupInvestorsByTiedTotal,
  settleOneProject,
  settlePhase,
  sharedPoolAmount,
} from "./projectSettlement.js";
import { ActiveProject, createInitialGame, GameState, Player } from "../state/gameState.js";

function makePlayer(id: string, overrides: Partial<Player> = {}): Player {
  return {
    id,
    name: id,
    energy: 15,
    wealth: 0,
    connected: true,
    ready: true,
    rank: 0,
    investment: {},
    longTerm: {},
    riskGains: {},
    inventory: [],
    usedCards: [],
    activeBuffs: [],
    slackedBy: [],
    totalEnergyConsumed: 0,
    wealthHistory: [0],
    investedRiskEnergy: 0,
    investedLongEnergy: 0,
    investedShortEnergy: 0,
    socialRank: null,
    ...overrides,
  };
}

describe("tied rank helpers", () => {
  it("groups equal totals and shares pool with trunc toward zero", () => {
    const a = makePlayer("a");
    const b = makePlayer("b");
    const c = makePlayer("c");
    const groups = groupInvestorsByTiedTotal([
      { player: a, total: 20 },
      { player: b, total: 20 },
      { player: c, total: 10 },
    ]);
    assert.equal(groups.length, 2);
    assert.equal(groups[0].startIndex, 0);
    assert.equal(groups[0].size, 2);
    assert.equal(groups[1].startIndex, 2);
    assert.equal(groups[1].size, 1);
    assert.equal(sharedPoolAmount([65, 45, 35], 0, 2), 55);
    assert.equal(sharedPoolAmount([65, 45, 35], 2, 1), 35);
    // Math.trunc((-35+-20)/2) === -27（向零取整，正负对称）
    assert.equal(sharedPoolAmount([-35, -20, -15], 0, 2), -27);
  });
});

describe("settleOneProject tied sharing", () => {
  it("long completion: two tied for first share rankRewards and era +100", () => {
    const p1 = makePlayer("p1", { investment: { 101: 40 } });
    const p2 = makePlayer("p2", { investment: { 101: 40 } });
    const p3 = makePlayer("p3", { investment: { 101: 10 } });
    const project: ActiveProject = {
      id: 101,
      name: "测试长期",
      type: "long",
      era: "气候",
      maxEnergy: 90,
      accumulatedInvested: 0,
      currentInvested: 0,
      roundsNoInvestment: 0,
      investedThisRound: false,
      investorRecords: {},
      earningRecords: {},
      totalPayout: 0,
      rankRewards: [65, 45, 35, 25, 20, 10],
    };
    const game = {
      players: [p1, p2, p3],
      currentEraCard: { era: "气候" },
    } as GameState;

    const result = settleOneProject(game, project, []);

    assert.equal(result.isCompleted, true);
    // base: 40*15=600 each for p1/p2; 10*15=150 for p3
    // rank: floor((65+45)/2)=55 each for p1/p2; 35 for p3
    // era: floor(100/2)=50 each for p1/p2
    assert.equal(result.playerGains.p1?.base, 600);
    assert.equal(result.playerGains.p1?.rank, 55);
    assert.equal(result.playerGains.p1?.era, 50);
    assert.equal(result.playerGains.p2?.rank, 55);
    assert.equal(result.playerGains.p2?.era, 50);
    assert.equal(result.playerGains.p3?.base, 150);
    assert.equal(result.playerGains.p3?.rank, 35);
    assert.equal(result.playerGains.p3?.era, 0);
    assert.equal(p1.wealth, 600 + 55 + 50);
    assert.equal(p2.wealth, 600 + 55 + 50);
    assert.equal(p3.wealth, 150 + 35);
  });

  it("short explode: tied first share penalty; insurance no longer pays on short", () => {
    const p1 = makePlayer("p1", {
      investment: { 1: 5 },
      activeBuffs: [{ cardId: "buff_insurance" }],
    });
    const p2 = makePlayer("p2", {
      investment: { 1: 5 },
      activeBuffs: [{ cardId: "buff_insurance" }],
    });
    const p3 = makePlayer("p3", { investment: { 1: 3 } });
    const project: ActiveProject = {
      id: 1,
      name: "测试短期",
      type: "short",
      era: "气候",
      maxEnergy: 10,
      accumulatedInvested: 0,
      currentInvested: 0,
      roundsNoInvestment: 0,
      investedThisRound: false,
      investorRecords: {},
      earningRecords: {},
      totalPayout: 0,
      rankRewards: [45, 30, 20],
      overInvestPenalty: [-35, -20, -15],
    };
    const game = { players: [p1, p2, p3] } as GameState;

    const result = settleOneProject(game, project, []);

    assert.equal(result.isExploded, true);
    // base this round: 5*10=50, 5*10=50, 3*10=30
    // penalty tied first: trunc((-35+-20)/2)=-27 each; p3: -15
    // 保险只保风险投爆，短期不再赔
    assert.equal(result.playerGains.p1?.base, 50);
    assert.equal(result.playerGains.p1?.rank, -27);
    assert.equal(result.playerGains.p2?.rank, -27);
    assert.equal(result.playerGains.p3?.rank, -15);
    assert.equal(p1.wealth, 50 - 27);
    assert.equal(p2.wealth, 50 - 27);
    assert.equal(p3.wealth, 30 - 15);
  });

  it("risk explode: insurance pays for historical participation even with no current investment", () => {
    const insured = makePlayer("insured", {
      investment: {},
      activeBuffs: [{ cardId: "buff_insurance" }],
    });
    const spectator = makePlayer("spectator", {
      investment: {},
      activeBuffs: [{ cardId: "buff_insurance" }],
    });
    const project: ActiveProject = {
      id: 201,
      name: "测试风险",
      type: "risk",
      era: "气候",
      maxEnergy: 10,
      accumulatedInvested: 11,
      currentInvested: 0,
      roundsNoInvestment: 0,
      investedThisRound: false,
      // insured 上一轮投过 8，本轮没有再加；历史参与也算
      investorRecords: { insured: 8 },
      earningRecords: {},
      totalPayout: 0,
    };
    const game = { players: [insured, spectator] } as GameState;
    const result = settleOneProject(game, project, []);

    assert.equal(result.isExploded, true);
    assert.equal(insured.wealth, 100);
    assert.equal(spectator.wealth, 0);
    assert.equal(result.playerGains.insured?.total, 100);
  });

  it("risk explode: clawback allows negative wealth when history exceeds balance", () => {
    const historyGain = 80;
    const priorWealth = 10;
    const p = makePlayer("p", {
      wealth: priorWealth,
      investment: { 201: 3 },
      riskGains: { 201: historyGain },
    });
    const project: ActiveProject = {
      id: 201,
      name: "测试风险",
      type: "risk",
      era: "气候",
      maxEnergy: 10,
      accumulatedInvested: 8,
      currentInvested: 0,
      roundsNoInvestment: 0,
      investedThisRound: false,
      investorRecords: { p: 8 },
      earningRecords: { p: historyGain },
      totalPayout: historyGain,
    };
    const game = { players: [p] } as GameState;
    const result = settleOneProject(game, project, []);

    assert.equal(result.isExploded, true);
    assert.equal(p.wealth, priorWealth - historyGain);
    assert.equal(p.wealth, -70);
    assert.equal(p.riskGains[201], 0);
    assert.equal(result.playerGains.p?.base, -historyGain);
  });

  it("short exact complete: tied first share rank and era +50", () => {
    const p1 = makePlayer("p1", { investment: { 1: 10 } });
    const p2 = makePlayer("p2", { investment: { 1: 10 } });
    const project: ActiveProject = {
      id: 1,
      name: "测试短期",
      type: "short",
      era: "科技",
      maxEnergy: 20,
      accumulatedInvested: 0,
      currentInvested: 0,
      roundsNoInvestment: 0,
      investedThisRound: false,
      investorRecords: {},
      earningRecords: {},
      totalPayout: 0,
      rankRewards: [45, 30, 20],
      overInvestPenalty: [-35, -20, -15],
    };
    const game = {
      players: [p1, p2],
      currentEraCard: { era: "科技" },
    } as GameState;

    const result = settleOneProject(game, project, []);

    assert.equal(result.isCompleted, true);
    assert.equal(result.isExploded, false);
    assert.equal(result.playerGains.p1?.rank, 37); // floor((45+30)/2)
    assert.equal(result.playerGains.p1?.era, 25); // floor(50/2)
    assert.equal(result.playerGains.p2?.rank, 37);
    assert.equal(result.playerGains.p2?.era, 25);
    assert.deepEqual(project.investorRoundSlices?.p1, [10]);
    assert.deepEqual(project.investorRoundSlices?.p2, [10]);
  });

  it("short project accumulates investorRoundSlices across rounds", () => {
    const p = makePlayer("p1", { investment: { 1: 3 } });
    const project: ActiveProject = {
      id: 1,
      name: "测试短期",
      type: "short",
      maxEnergy: 20,
      accumulatedInvested: 5,
      currentInvested: 0,
      roundsNoInvestment: 0,
      investedThisRound: false,
      investorRecords: { p1: 5 },
      earningRecords: {},
      totalPayout: 0,
      rankRewards: [45, 30, 20],
      overInvestPenalty: [-35, -20, -15],
    };
    const game = { players: [p] } as GameState;

    settleOneProject(game, project, []);

    assert.equal(project.investorRecords.p1, 8);
    assert.deepEqual(project.investorRoundSlices?.p1, [5, 3]);
  });
});

describe("gold and long-abandon edge rules", () => {
  it("gold amplifies the era-4 unfinished long progress payout", () => {
    const p1 = makePlayer("p1", {
      wealth: 0,
      investment: { 101: 10 },
      activeBuffs: [{ cardId: "buff_gold" }],
    });
    const p2 = makePlayer("p2", { wealth: 0, investment: { 101: 10 } });
    const project: ActiveProject = {
      id: 101,
      name: "测试长期",
      type: "long",
      era: "气候",
      maxEnergy: 90,
      accumulatedInvested: 0,
      currentInvested: 0,
      roundsNoInvestment: 0,
      investedThisRound: false,
      investorRecords: {},
      earningRecords: {},
      totalPayout: 0,
      rankRewards: [65, 45, 35, 25, 20, 10],
    };
    const game = createInitialGame("room", []);
    game.players = [p1, p2];
    game.currentEra = 4;
    game.roundInEra = 2;
    game.globalRound = 8;
    game.currentEraCard = { era: "气候" } as GameState["currentEraCard"];
    game.activeProjects = [project];

    settlePhase(game);

    // 总进度 20/90，未达三分之一 → 每点精力返还 1 财富
    // p1 持点石成金：floor(10 × 1.5) = 15；p2 原额 10
    assert.equal(p1.wealth, 15);
    assert.equal(p2.wealth, 10);
  });

  it("gold does not amplify long-abandon 1:1 settlement", () => {
    const p1 = makePlayer("p1", {
      wealth: 0,
      investment: {},
      longTerm: {
        101: { totalInvested: 10, status: "active", roundSlices: [10] },
      },
      activeBuffs: [{ cardId: "buff_gold" }],
    });
    const project: ActiveProject = {
      id: 101,
      name: "测试长期",
      type: "long",
      era: "气候",
      maxEnergy: 90,
      accumulatedInvested: 10,
      currentInvested: 0,
      roundsNoInvestment: 0,
      investedThisRound: false,
      investorRecords: { p1: 10 },
      earningRecords: {},
      totalPayout: 0,
      rankRewards: [65, 45, 35, 25, 20, 10],
    };
    const game = createInitialGame("room", []);
    game.players = [p1];
    game.currentEra = 4;
    game.roundInEra = 1;
    game.globalRound = 7;
    game.currentEraCard = { era: "气候" } as GameState["currentEraCard"];
    game.activeProjects = [project];

    settlePhase(game);

    // 放弃结算：每 1 点精力返还 1 财富，点石成金不放大
    assert.equal(p1.wealth, 10);
    assert.equal(p1.longTerm[101]?.status, "abandoned");
  });
});
