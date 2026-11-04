import type {
  ActiveProject,
  GameState,
  PersonaAnalysis,
  Player,
  SettlementProjectResult,
} from "../types";

export const DEVICE_PREVIEW_MY_ID = "preview-me";

export type DevicePreviewPageId =
  | "era_intro"
  | "invest"
  | "settlement"
  | "auction"
  | "game_over";

export const DEVICE_PREVIEW_PAGES: { id: DevicePreviewPageId; label: string }[] = [
  { id: "era_intro", label: "时代介绍" },
  { id: "invest", label: "投资与道具" },
  { id: "settlement", label: "结算" },
  { id: "auction", label: "拍卖" },
  { id: "game_over", label: "终局" },
];

const PLACEHOLDER_ANALYSIS: PersonaAnalysis = {
  scores: {
    longTermism: 55,
    shortTermism: 45,
    riskTaking: 50,
    ruleIntervention: 40,
    socialConnection: 60,
    resourceConversion: 50,
  },
  personaScores: {
    compass: 30,
    gardener: 25,
    trigger: 20,
    alchemist: 25,
  },
  primaryPersona: "随机诗人",
  primaryPersonaDesc: "占位说明：此处为命运素描简介。",
  mbtiPersona: {
    code: "LADV",
    label: "占位标签",
    desc: "占位说明",
    axes: {
      Time: { code: "L", percent: 55 },
      Risk: { code: "A", percent: 50 },
      Disruption: { code: "D", percent: 45 },
      Motivation: { code: "V", percent: 60 },
    },
    axisScores: {
      longShort: 55,
      riskConserv: 50,
      disruptFollow: 45,
      profitSocial: 60,
    },
  },
};

function makePlayer(
  id: string,
  name: string,
  wealth: number,
  extra: Partial<Player> = {},
): Player {
  return {
    id,
    name,
    energy: 12,
    wealth,
    connected: true,
    ready: true,
    rank: 1,
    investment: { 1: 3, 2: 2 },
    investmentDraft: { 1: 3, 2: 2 },
    longTerm: {
      2: { projectId: 2, totalInvested: 8, status: "active" },
    },
    inventory: ["buff_gold", "buff_short", "buff_slack", "buff_work_rest"],
    usedCards: [],
    activeBuffs: [],
    buffRoundNotes: [],
    slackedBy: [],
    coffeePurchasesThisRound: 0,
    totalEnergyConsumed: 24,
    wealthHistory: [100, 120, 115, 140, 160],
    investedRiskEnergy: 2,
    investedLongEnergy: 8,
    socialRank: "B",
    analysisResult: PLACEHOLDER_ANALYSIS,
    ...extra,
  };
}

const PLAYER_BLUEPRINTS: Player[] = [
  makePlayer(DEVICE_PREVIEW_MY_ID, "玩家甲", 160, { rank: 1 }),
  makePlayer("preview-p2", "玩家乙", 140, { rank: 2 }),
  makePlayer("preview-p3", "玩家丙", 120, { rank: 3 }),
  makePlayer("preview-p4", "玩家丁", 100, { rank: 4 }),
];

function clonePlayers(patch?: (p: Player) => Partial<Player>): Player[] {
  return PLAYER_BLUEPRINTS.map((p) => ({
    ...structuredClone(p),
    ...(patch ? patch(p) : {}),
  }));
}

function makeProjects(): ActiveProject[] {
  return [
    {
      id: 1,
      name: "项目一",
      type: "short",
      maxEnergy: 100,
      accumulatedInvested: 45,
      currentInvested: 12,
      rankRewards: [50, 30, 20],
      investorRecords: { [DEVICE_PREVIEW_MY_ID]: 12 },
      earningRecords: {},
      totalPayout: 0,
      roundsNoInvestment: 0,
      investedThisRound: true,
      era: "占位时代",
    },
    {
      id: 2,
      name: "项目二",
      type: "long",
      maxEnergy: 100,
      accumulatedInvested: 80,
      currentInvested: 8,
      rankRewards: [80, 50, 30],
      investorRecords: { [DEVICE_PREVIEW_MY_ID]: 20 },
      earningRecords: {},
      totalPayout: 0,
      roundsNoInvestment: 0,
      investedThisRound: true,
      era: "占位时代",
    },
    {
      id: 3,
      name: "项目三",
      type: "short",
      maxEnergy: 80,
      accumulatedInvested: 30,
      currentInvested: 5,
      rankRewards: [40, 25, 15],
      investorRecords: {},
      earningRecords: {},
      totalPayout: 0,
      roundsNoInvestment: 0,
      investedThisRound: false,
      era: "占位时代",
    },
    {
      id: 4,
      name: "项目四",
      type: "risk",
      maxEnergy: 60,
      accumulatedInvested: 25,
      currentInvested: 4,
      rankRewards: [100, 60, 40],
      overInvestPenalty: [10, 20, 30],
      investorRecords: {},
      earningRecords: {},
      totalPayout: 0,
      roundsNoInvestment: 0,
      investedThisRound: false,
    },
  ];
}

function settlementResults(): SettlementProjectResult[] {
  const gain = (total: number) => ({
    total,
    base: total - 5,
    rank: 3,
    era: 2,
  });
  return [
    {
      projectId: 1,
      name: "项目一",
      type: "short",
      maxEnergy: 100,
      totalInvested: 45,
      isExploded: false,
      isCompleted: true,
      playerInvestments: { [DEVICE_PREVIEW_MY_ID]: 12, "preview-p2": 10 },
      playerGains: {
        [DEVICE_PREVIEW_MY_ID]: gain(28),
        "preview-p2": gain(22),
      },
    },
    {
      projectId: 2,
      name: "项目二",
      type: "long",
      maxEnergy: 100,
      totalInvested: 80,
      isExploded: false,
      isCompleted: false,
      playerInvestments: { [DEVICE_PREVIEW_MY_ID]: 8 },
      playerGains: {
        [DEVICE_PREVIEW_MY_ID]: gain(0),
      },
    },
  ];
}

function baseGame(
  phase: GameState["phase"],
  patch: Partial<GameState> & { players?: Player[] } = {},
): GameState {
  const projects = makeProjects();
  const players = patch.players ?? clonePlayers();
  const readyIds = players.filter((p) => p.connected && p.ready).map((p) => p.id);
  const { players: _players, ...restPatch } = patch;
  return {
    roomId: "000000",
    players,
    phase,
    readyPlayers: readyIds,
    phaseFinished: [],
    transactions: [],
    currentEra: 2,
    roundInEra: 1,
    globalRound: 3,
    energyTableSize: 4,
    nextRoundEnergy: 12,
    activeProjects: projects,
    uncompletedProjects: projects.filter((p) => p.type === "long"),
    completedProjects: [],
    drawnProjects: [1, 2, 3, 4],
    totalRiskEnergyAvailable: 20,
    currentEraCard: {
      id: 1,
      name: "占位标题",
      era: "占位时代",
      description: "占位说明：此处为时代卡正文。",
      themeColor: "blue",
    },
    logs: [],
    globalLeaderboard: [
      { name: "占位社区", score: 520 },
      { name: "示例社区", score: 480 },
    ],
    auctionDistributedCardIds: [],
    ...restPatch,
  };
}

export function getDevicePreviewGame(pageId: DevicePreviewPageId): GameState {
  switch (pageId) {
    case "era_intro":
      return baseGame("ERA_INTRO", {
        readyPlayers: [DEVICE_PREVIEW_MY_ID],
        players: clonePlayers((p) => ({
          ready: p.id === DEVICE_PREVIEW_MY_ID,
        })),
      });
    case "invest":
      return baseGame("INVESTMENT", {
        investmentEndsAt: Date.now() + 8 * 60_000,
        readyPlayers: [],
        players: clonePlayers((p) =>
          p.id === DEVICE_PREVIEW_MY_ID
            ? {
                ready: false,
                investmentDraft: { 1: 4, 2: 3 },
                buffRoundNotes: [
                  { cardId: "buff_gold", role: "used", text: "使用【点石成金】（待结算/开奖生效）" },
                  {
                    cardId: "buff_slack",
                    role: "hit",
                    text: "有人对你使用摸鱼传染，精力 -8",
                  },
                ],
                slackedBy: [],
                inventory: ["buff_slack", "buff_work_rest", "buff_short"],
              }
            : { ready: false, investmentDraft: { 1: 2 } as Record<number, number> }
        ),
      });
    case "settlement":
      return baseGame("SETTLEMENT", {
        lastSettlement: {
          round: 3,
          results: settlementResults(),
        },
        players: clonePlayers((p) =>
          p.id === DEVICE_PREVIEW_MY_ID
            ? {
                buffRoundNotes: [
                  { cardId: "buff_gold", role: "used", text: "使用【点石成金】（待结算/开奖生效）" },
                  {
                    cardId: "buff_slack",
                    role: "hit",
                    text: "有人对你使用摸鱼传染，精力 -8",
                  },
                ],
              }
            : {}
        ),
      });
    case "auction":
      return baseGame("AUCTION", {
        // 第 3 时代 → 第 2 场拍卖：强买强卖 / 劳逸结合 / 项目做空
        currentEra: 3,
        auctionDistributedCardIds: ["buff_force_buy"],
        // 玩家可见的已成交列表（正式局由服务端 publicSoldLots 下发）
        auctionSoldLots: [
          {
            cardId: "buff_force_buy",
            playerId: "preview-p3",
            playerName: "玩家丙",
            cost: 8,
            source: "hammer",
          },
        ],
        auctionFocusCardId: "buff_work_rest",
        auctionStartingBid: 5,
        auctionCurrentBid: 10,
        auctionHighBidderId: "preview-p2",
        auctionHighBidderName: "玩家乙",
        auctionHighBidId: "preview-bid-1",
        auctionMinimumNextBid: 15,
        auctionBidHistory: [
          {
            bidId: "preview-bid-1",
            playerId: "preview-p2",
            playerName: "玩家乙",
            amount: 10,
            incrementFromPrevious: 5,
            timestamp: Date.now() - 45_000,
            status: "leading",
          },
        ],
      });
    case "game_over":
      return baseGame("GAME_OVER", {
        nextRoundEnergy: null,
        globalRound: 12,
      });
    default:
      return baseGame("ERA_INTRO");
  }
}

export function getDevicePreviewMe(game: GameState): Player {
  const me = game.players.find((p) => p.id === DEVICE_PREVIEW_MY_ID);
  if (!me) throw new Error("device preview: missing self player");
  return me;
}
