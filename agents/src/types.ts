export type Phase =
  | "ROOM_WAITING"
  | "ERA_INTRO"
  | "TUTORIAL"
  | "AUCTION"
  | "BUFF_USAGE"
  | "INVESTMENT"
  | "SETTLEMENT"
  | "COMMUNITY_NAMING"
  | "GAME_OVER";

export interface TransactionView {
  id: string;
  fromId: string;
  fromName: string;
  toId: string;
  toName: string;
  amount: number;
  note: string;
  status: "pending" | "accepted" | "rejected";
  timestamp: number;
}

export interface ChatGroupView {
  id: string;
  kind: "public" | "custom";
  name: string;
  memberIds: string[];
}

export interface GroupMessageView {
  id: string;
  groupId: string;
  fromId: string;
  fromName: string;
  text: string;
  timestamp: number;
}

export interface DirectMessageView {
  id: string;
  fromId: string;
  fromName: string;
  toId: string;
  toName: string;
  text: string;
  timestamp: number;
  era: number;
  roundInEra: number;
  globalRound: number;
}

export interface ProjectView {
  id: number;
  name: string;
  type: "short" | "long" | "risk";
  maxEnergy: number;
  currentInvested: number;
  accumulatedInvested: number;
  rankRewards?: number[];
  overInvestPenalty?: number[];
  rate?: number;
  era?: string;
  eraBonus?: Record<string, number>;
  roundsNoInvestment?: number;
  investedThisRound?: boolean;
}

export interface PlayerView {
  id: string;
  name: string;
  energy?: number;
  wealth: number;
  rank?: number;
  connected?: boolean;
  ready?: boolean;
  isAI?: boolean;
  aiPersona?: string;
  isAgent?: boolean;
  agentIndex?: number;
  agentModel?: string;
  agentProvider?: string;
  investment?: Record<string, number>;
  investmentDraft?: Record<string, number>;
  inventory?: string[];
  usedCards?: string[];
  activeBuffs?: Array<{ cardId: string; targetPlayerId?: string; targetProjectId?: number }>;
  buffRoundNotes?: Array<{ cardId: string; role: "used" | "hit"; text: string }>;
  pendingSlackHits?: Array<{
    id: string;
    fromName: string;
    energyDelta: number;
    energyAfter: number;
    investmentAutoUnlocked?: boolean;
  }>;
  pendingLighterBurnNotices?: Array<{
    id: string;
    cardId: string;
    cardName: string;
    kind: "inventory" | "played";
    casterName: string;
    message: string;
  }>;
  coffeePurchasesThisRound?: number;
  pendingLotteryOffer?: { offerId: string; amount: number };
  pendingWealthAdjustment?: { offerId: string; delta: number };
  totalEnergyConsumed?: number;
  investedLongEnergy?: number;
  investedShortEnergy?: number;
  investedRiskEnergy?: number;
}

export interface GameSnapshot {
  roomId: string;
  phase: Phase;
  sessionId?: string;
  sessionStartedAt?: number;
  currentEra: number;
  roundInEra: number;
  globalRound: number;
  players: PlayerView[];
  activeProjects: ProjectView[];
  transactions: TransactionView[];
  chatGroups?: ChatGroupView[];
  groupMessages?: GroupMessageView[];
  directMessages?: DirectMessageView[];
  predictions?: Array<{
    id: string;
    playerId: string;
    playerName: string;
    era: number;
    globalRound: number;
    ranking: string[];
    reasoning: string;
    timestamp: number;
  }>;
  currentEraCard?: { id: number; name: string; era?: string; description?: string };
  logs?: string[];
  settlementHistory?: Array<{
    round: number;
    currentEra: number;
    roundInEra: number;
    results: Array<{
      projectId: number;
      name: string;
      type: "short" | "long" | "risk";
      playerInvestments: Record<string, number>;
      playerGains: Record<string, { total: number }>;
    }>;
  }>;
  readyPlayers?: string[];
  investmentEndsAt?: number;
  investmentTimerPausedAt?: number;
  serverNow?: number;
  communityName?: string;
  auctionFocusCardId?: string;
  auctionDistributedCardIds?: string[];
  auctionCurrentBid?: number;
  auctionHighBidderId?: string | null;
  auctionHighBidderName?: string | null;
  auctionHighBidId?: string | null;
  auctionMinimumNextBid?: number;
  auctionStartingBid?: number;
  auctionBidHistory?: Array<{
    bidId: string;
    playerId: string;
    playerName: string;
    amount: number;
    status: string;
    timestamp: number;
  }>;
  auctionSoldLots?: Array<{ cardId: string; playerId: string; playerName?: string; cost: number }>;
  /** 仅上帝视图下发：本场拍卖卡池（由服务端提供，避免 Agent 侧硬编码） */
  auctionPoolCardIds?: string[];
  /** 仅上帝视图下发：实验元数据 */
  experiment?: {
    runId: string | null;
    condition: string | null;
    seedBase: number;
    seed: number;
    sessionOrdinal: number;
    manifestId: string | null;
    manifestPath: string | null;
    promptVersion: string | null;
    promptHash?: string | null;
    mock?: boolean;
    policyMode: string;
    gitCommit: string | null;
    nodeVersion: string;
    serverStartedAt: number;
  } | null;
  seed?: number | null;
  seedBase?: number | null;
  sessionOrdinal?: number;
  globalLeaderboard?: Array<{ name: string; score: number }>;
}

export interface Observation {
  phase: Phase;
  era: number;
  roundInEra: number;
  globalRound: number;
  serverNow: number;
  me: {
    id: string;
    name: string;
    energy: number;
    wealth: number;
    rank: number;
    ready: boolean;
    inventory: string[];
    usedCards: string[];
    coffeePurchases: number;
    investment: Record<string, number>;
    /** 已发出、对方尚未确认的转账合计（拍卖/再转账的可用财富要扣掉） */
    pendingOut: number;
  };
  players: Array<{
    id: string;
    name: string;
    wealth: number;
    rank: number;
    energy: number | null;
    ready: boolean;
    isMe: boolean;
    isAgent: boolean;
    inventoryCount: number;
  }>;
  projects: ProjectView[];
  eraCard: GameSnapshot["currentEraCard"] | null;
  currencyLeader: string | null;
  pendingTransactions: TransactionView[];
  myPendingTransactions: TransactionView[];
  publicMessages: GroupMessageView[];
  privateMessages: DirectMessageView[];
  publicGroupId: string | null;
  settlementHistory: NonNullable<GameSnapshot["settlementHistory"]>;
  auction: {
    focusCardId: string | null;
    currentBid: number;
    minimumNextBid: number;
    highBidderId: string | null;
    highBidderName: string | null;
    soldCardIds: string[];
    distributedCardIds: string[];
    bidHistory: NonNullable<GameSnapshot["auctionBidHistory"]>;
  } | null;
  recentLogs: string[];
}

export interface ChatMessagePlan {
  channel: "public" | "private";
  toPlayerId?: string;
  text: string;
}

export interface InvestmentPlan {
  reasoning?: string;
  messages?: ChatMessagePlan[];
  transfer?: { toPlayerId: string; amount: number; note?: string } | null;
  coffee?: number;
  useCard?: {
    cardId: string;
    targetPlayerId?: string;
    targetProjectId?: number;
    burnCardId?: string;
    burnFromInventory?: boolean;
  } | null;
  investment: Record<string, number>;
  ready?: boolean;
}

export interface PredictionPlan {
  reasoning?: string;
  ranking: string[];
}

export interface AuctionPlan {
  reasoning?: string;
  action: "bid" | "pass" | "force_buy";
  amount?: number;
}

export interface TransactionDecision {
  decision: "accept" | "reject";
  reasoning?: string;
}
