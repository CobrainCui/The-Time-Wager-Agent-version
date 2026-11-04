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
