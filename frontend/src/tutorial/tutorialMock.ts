import { ActiveProject, EraCard, GameState, Player } from "../types";
import { getAuctionCardsForEra } from "../config/buffCards";
import { STARTING_WEALTH } from "../config/startingWealth";

const emptyProjectFields = {
  currentInvested: 0,
  roundsNoInvestment: 0,
  investedThisRound: false,
  investorRecords: {},
  earningRecords: {},
  totalPayout: 0,
};

export const TUTORIAL_PLAYER_WEALTH = STARTING_WEALTH;

export function createTutorialPlayer(overrides: Partial<Player> = {}): Player {
  const wealth = overrides.wealth ?? TUTORIAL_PLAYER_WEALTH;
  return {
    id: "tutorial-me",
    name: "你",
    energy: 10,
    wealth,
    connected: true,
    ready: false,
    rank: 3,
    investment: {},
    longTerm: {},
    inventory: [],
    usedCards: [],
    activeBuffs: [],
    slackedBy: [],
    totalEnergyConsumed: 0,
    wealthHistory: [wealth],
    investedRiskEnergy: 0,
    investedLongEnergy: 0,
    socialRank: null,
    ...overrides,
  };
}

export const TUTORIAL_SHORT_PROJECT: ActiveProject = {
  id: 1,
  name: "新能源汽车",
  type: "short",
  maxEnergy: 23,
  accumulatedInvested: 8,
  era: "气候",
  ...emptyProjectFields,
};

export const TUTORIAL_LONG_PROJECT: ActiveProject = {
  id: 101,
  name: "植树造林",
  type: "long",
  maxEnergy: 90,
  accumulatedInvested: 12,
  era: "气候",
  ...emptyProjectFields,
};

export const TUTORIAL_RISK_PROJECT: ActiveProject = {
  id: 202,
  name: "成瘾算法",
  type: "risk",
  maxEnergy: 8,
  accumulatedInvested: 6,
  era: "科技",
  ...emptyProjectFields,
};

export const TUTORIAL_DEMO_PROJECTS = [
  TUTORIAL_SHORT_PROJECT,
  TUTORIAL_LONG_PROJECT,
  TUTORIAL_RISK_PROJECT,
] as const;

/** 教程试玩侧栏：按六人桌推算排名奖/投爆罚（与对局侧栏「项目」同表） */
export function createTutorialProjectTableGame(overrides: Partial<GameState> = {}): GameState {
  const me = createTutorialPlayer();
  const players = overrides.players ?? [me];
  return {
    roomId: "tutorial",
    players,
    phase: "INVESTMENT",
    readyPlayers: [],
    phaseFinished: [],
    transactions: [],
    currentEra: 1,
    roundInEra: 1,
    globalRound: 1,
    energyTableSize: 6,
    activeProjects: [...TUTORIAL_DEMO_PROJECTS],
    uncompletedProjects: [],
    completedProjects: [],
    drawnProjects: TUTORIAL_DEMO_PROJECTS.map((p) => p.id),
    totalRiskEnergyAvailable: 0,
    logs: [],
    ...overrides,
  };
}

export const TUTORIAL_ERA_OPTIONS: EraCard[] = [
  {
    id: 1,
    name: "气候变迁",
    era: "气候",
    description: "绿色与可持续成为主旋律",
    themeColor: "green",
  },
  {
    id: 2,
    name: "数字星河",
    era: "科技",
    description: "技术重塑生活与产业",
    themeColor: "blue",
  },
  {
    id: 3,
    name: "心灵觉醒",
    era: "心理",
    description: "关注内在与社群连结",
    themeColor: "red",
  },
  {
    id: 4,
    name: "多元交响",
    era: "文化",
    description: "文明互鉴与创意繁荣",
    themeColor: "yellow",
  },
];

export const TUTORIAL_ERA_SAMPLE_PROJECT: ActiveProject = {
  id: 102,
  name: "海绵城市",
  type: "long",
  maxEnergy: 100,
  accumulatedInvested: 5,
  era: "气候",
  ...emptyProjectFields,
};

export interface TutorialNpc {
  id: string;
  name: string;
  wealth: number;
}

export const TUTORIAL_NPCS: TutorialNpc[] = [
  { id: "npc-a", name: "小林", wealth: 60 },
  { id: "npc-b", name: "阿杰", wealth: 120 },
  { id: "npc-c", name: "美玲", wealth: 200 },
];

export const TUTORIAL_SHOP_CARDS = ["buff_gold", "buff_slack", "buff_insurance"] as const;

const TUTORIAL_AUCTION_BID_STEP = 5;

/** 教程拍卖试玩初始状态（第 1 时代第 1 场，一张卡在拍） */
export function createTutorialAuctionGame(overrides: Partial<GameState> = {}): GameState {
  const era = 1;
  const cards = getAuctionCardsForEra(era);
  const focusId = cards.find((c) => c.id === "buff_gold")?.id ?? cards[0]?.id ?? "buff_gold";
  const startingBid = 5;
  const me = createTutorialPlayer({ wealth: 150, inventory: [] });

  return {
    roomId: "tutorial",
    players: [me],
    phase: "AUCTION",
    readyPlayers: [],
    phaseFinished: [],
    transactions: [],
    currentEra: era,
    roundInEra: 1,
    globalRound: 1,
    activeProjects: [],
    uncompletedProjects: [],
    completedProjects: [],
    totalRiskEnergyAvailable: 0,
    logs: [],
    auctionDistributedCardIds: [],
    auctionFocusCardId: focusId,
    auctionStartingBid: startingBid,
    auctionCurrentBid: 0,
    auctionHighBidderId: null,
    auctionHighBidderName: null,
    auctionHighBidId: null,
    auctionMinimumNextBid: startingBid,
    auctionBidHistory: [],
    forceBuyUsedPlayerIds: [],
    ...overrides,
  };
}

export function applyTutorialAuctionBid(game: GameState, player: Player, amount: number): GameState {
  const prevBid = game.auctionCurrentBid ?? 0;
  const startingBid = game.auctionStartingBid ?? 5;
  const bidId = `tutorial-bid-${Date.now()}`;
  const history = (game.auctionBidHistory ?? []).map((row) => ({
    ...row,
    status: row.status === "leading" ? ("outbid" as const) : row.status,
  }));

  return {
    ...game,
    auctionCurrentBid: amount,
    auctionMinimumNextBid: amount + TUTORIAL_AUCTION_BID_STEP,
    auctionHighBidderId: player.id,
    auctionHighBidderName: player.name,
    auctionHighBidId: bidId,
    auctionBidHistory: [
      ...history,
      {
        bidId,
        playerId: player.id,
        playerName: player.name,
        amount,
        incrementFromPrevious: amount - (prevBid > 0 ? prevBid : startingBid),
        timestamp: Date.now(),
        status: "leading",
      },
    ],
  };
}
