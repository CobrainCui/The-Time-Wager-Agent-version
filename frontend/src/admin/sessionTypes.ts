export type SessionRecordStatus = "active" | "voided";

export type SessionListStatus = "active" | "voided" | "all";

export type SessionPlayerSummary = {
  name: string;
  wealth: number;
  isAI?: boolean;
  fatePersona?: string;
};

export type SessionListItem = {
  sessionId: string;
  roomId: string;
  communityName: string;
  communityWealth: number;
  playerCount: number;
  sessionStartedAt: number | null;
  completedAt: number;
  eraTheme: string | null;
  condition?: string | null;
  runId?: string | null;
  seed?: number | null;
  models?: string[];
  mock?: boolean;
  topPlayer: { name: string; wealth: number };
  playersSummary: SessionPlayerSummary[];
  leaderboardRankAtComplete: number | null;
  status: SessionRecordStatus;
  voidedAt?: number;
  voidedReason?: string;
  migrated?: boolean;
  hasSnapshot: boolean;
};

export type SessionStats = {
  totalActive: number;
  totalVoided: number;
  totalAll: number;
  completedThisWeek: number;
  onLeaderboard: number;
  maxCommunityWealth: number;
};

export type SessionListResponse = {
  items: SessionListItem[];
  total: number;
  page: number;
  pageSize: number;
};

export type PlayerMetrics = {
  playerId: string;
  name: string;
  seat: number;
  isAgent: boolean;
  agentIndex: number | null;
  model: string;
  provider: string;
  finalWealth: number;
  finalRank: number;
  longShare: number;
  shortShare: number;
  riskShare: number;
  transfersSent: number;
  transfersReceived: number;
  transferReturnRate: number;
  mutualTransferPartners: number;
  publicMessages: number;
  privateMessages: number;
  privatePartners: number;
  auctionBids: number;
  auctionWins: number;
  auctionSpend: number;
  attacksInitiated: number;
  attacksReceived: number;
  predictionCount: number;
  predictionTau: number | null;
  predictionMae: number | null;
  outDegree: number;
  inDegree: number;
};

export type SessionAnalysis = {
  meta: Record<string, unknown> & {
    condition?: string | null;
    seed?: number | null;
    sessionId?: string | null;
    models?: string[];
    experiment?: Record<string, unknown> | null;
  };
  metrics: {
    game: Record<string, number | string | null | Record<string, number>>;
    players: PlayerMetrics[];
    predictionScores: Array<{
      predictionId: string;
      playerId: string;
      playerName: string;
      era: number;
      globalRound: number;
      tau: number;
      mae: number;
    }>;
  };
  predictions: Array<{
    id: string;
    playerId: string;
    playerName: string;
    era: number;
    globalRound: number;
    ranking: string[];
    reasoning: string;
    timestamp: number;
    model?: string;
  }>;
  directMessages: Array<{
    id: string;
    fromName: string;
    toName: string;
    text: string;
    timestamp: number;
    globalRound: number;
  }>;
  groupMessages: Array<{
    id: string;
    fromName: string;
    text: string;
    timestamp: number;
    groupId: string;
  }>;
  agentDecisions: Array<{
    id: string;
    playerName: string;
    kind: string;
    reasoning: string;
    action: unknown;
    totalTokens?: number;
    latencyMs?: number;
    timestamp: number;
  }>;
  players: Array<{
    id: string;
    name: string;
    isAgent: boolean;
    agentIndex?: number;
    agentModel?: string;
    agentProvider?: string;
    wealth: number;
    rank: number;
  }>;
};
