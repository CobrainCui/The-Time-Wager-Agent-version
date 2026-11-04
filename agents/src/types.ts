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
  agentPersona?: string;
  agentModel?: string;
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
  currentEraCard?: { id: number; name: string; era?: string; description?: string };
  logs?: string[];
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
    agentPersona: string | null;
    inventoryCount: number;
  }>;
  projects: ProjectView[];
  eraCard: GameSnapshot["currentEraCard"] | null;
  currencyLeader: string | null;
  pendingTransactions: TransactionView[];
  myPendingTransactions: TransactionView[];
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

export interface InvestmentPlan {
  reasoning?: string;
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

export interface AuctionPlan {
  reasoning?: string;
  action: "bid" | "pass" | "force_buy";
  amount?: number;
}

export interface TransactionDecision {
  decision: "accept" | "reject";
  reasoning?: string;
}
