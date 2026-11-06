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

export interface Transaction {
  id: string;
  fromId: string;
  fromName: string;
  toId: string;
  toName: string;
  amount: number;
  note: string;
  status: "pending" | "accepted" | "rejected";
  timestamp: number;
  /** 客户端乐观发送 id，用于一对一对账去重 */
  clientTempId?: string;
}

export type ChatGroupKind = "public" | "custom";

export interface ChatGroup {
  id: string;
  kind: ChatGroupKind;
  name: string;
  memberIds: string[];
  ownerId?: string;
  createdById?: string;
  createdAt: number;
}

export interface GroupMessage {
  id: string;
  groupId: string;
  fromId: string;
  fromName: string;
  text: string;
  timestamp: number;
  clientTempId?: string;
}

export interface DirectMessage {
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
  clientTempId?: string;
}

export interface AgentPrediction {
  id: string;
  playerId: string;
  playerName: string;
  era: number;
  globalRound: number;
  ranking: string[];
  reasoning: string;
  timestamp: number;
  model?: string;
}

export interface AgentDecision {
  id: string;
  playerId: string;
  playerName: string;
  kind: string;
  phase: Phase;
  era: number;
  roundInEra: number;
  globalRound: number;
  reasoning: string;
  action: unknown;
  model?: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  latencyMs?: number;
  timestamp: number;
}

export interface ExperimentMeta {
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
}

export interface ActiveProject {
  id: number;
  name: string;
  type: "short" | "long" | "risk";
  color?: string; 
  maxEnergy: number;
  
  accumulatedInvested: number; 
  currentInvested: number; 

  rankRewards?: number[];
  overInvestPenalty?: number[];
  rate?: number;
  roundsNoInvestment: number; 
  investedThisRound: boolean;
  era?: string;

  investorRecords: Record<string, number>;
  /** 短/风险：每轮有投入的分段（结算全览个人条） */
  investorRoundSlices?: Record<string, number[]>;
  earningRecords: Record<string, number>;
  totalPayout: number;
  /** 第四时代第二轮未完成长期梯度是否已发放 */
  endGradientPaid?: boolean;
}

export interface BuffCard {
  id: string;
  name: string;
  type: 'gain' | 'interfere' | 'special';
  description: string;
  auctionRound: number;
}

export interface ActiveBuff {
  cardId: string;
  targetPlayerId?: string;
  targetProjectId?: number;
  extraData?: any;
}

export interface LongTermProgress {
  projectId: number;
  totalInvested: number;
  status: "active" | "completed" | "abandoned";
  reward?: number;
  /** 每轮投入精力（结算全览个人条分段） */
  roundSlices?: number[];
}

export interface PersonaAnalysis {
  scores: {
    longTermism: number;
    shortTermism: number;
    riskTaking: number;
    ruleIntervention: number;
    socialConnection: number;
    resourceConversion: number;
  };
  personaScores: {
    compass: number;
    gardener: number;
    trigger: number;
    alchemist: number;
  };
  primaryPersona: string;   // 命运素描
  primaryPersonaDesc: string;
  mbtiPersona?: {
    code: string; // e.g., "LADV"
    label: string; // e.g., "长线激进·创业者"
    desc: string;
    axes: {
      Time: { code: string; percent: number }; // code 'L' or 'Q'
      Risk: { code: string; percent: number }; // code 'A' or 'G'
      Disruption: { code: string; percent: number }; // code 'D' or 'C'
      Motivation: { code: string; percent: number }; // code 'V' or 'R'
    };
    axisScores: { longShort: number; riskConserv: number; disruptFollow: number; profitSocial: number };
  };
}

export interface SlackHitNotice {
  id: string;
  fromName: string;
  energyDelta: number;
  energyAfter: number;
  investmentAutoUnlocked?: boolean;
}

export interface LighterBurnNotice {
  id: string;
  cardId: string;
  cardName: string;
  /** played/inventory=命中；miss=被指定但没烧掉任何卡 */
  kind: "inventory" | "played" | "miss";
  casterName: string;
  message: string;
  energyRefund?: number;
  wealthRefund?: number;
}

export interface BuffRoundNote {
  cardId: string;
  role: "used" | "hit";
  text: string;
}

export interface Player {
  id: string;
  name: string;
  energy: number;
  wealth: number; 
  connected: boolean;
  ready: boolean; 
  rank: number;
  investment: Record<number, number>;
  investmentDraft?: Record<number, number>;
  investmentDraftAdminRevision?: number;
  longTerm: Record<number, LongTermProgress>;

  inventory: string[]; 
  usedCards: string[];
  activeBuffs: ActiveBuff[];
  /** 本轮道具发动/被用短记录（仅本人可见） */
  buffRoundNotes?: BuffRoundNote[];
  
  // 本轮被谁使用了摸鱼传染
  slackedBy: string[];
  /** 被摸鱼后待本人确认（仅本人可见） */
  pendingSlackHits?: SlackHitNotice[];
  /** 结算打火机命中后待本人确认 */
  pendingLighterBurnNotices?: LighterBurnNotice[];

  /** 本轮已购咖啡杯数（服务端权威） */
  coffeePurchasesThisRound?: number;

  totalEnergyConsumed: number; 
  wealthHistory: number[];     
  investedRiskEnergy: number;  
  investedLongEnergy: number;  
  socialRank: 'A' | 'B' | 'C' | 'D' | 'E' | null; 
  
  analysisResult?: PersonaAnalysis; 

  isAI?: boolean;
  aiPersona?: string;
  isAgent?: boolean;
  agentIndex?: number;
  agentModel?: string;
  agentProvider?: string;
}

export interface EventOption {
  energyChange: number;
  wealthChange: number;
  description: string;
}

export interface EventCard {
  id: number;
  name: string;
  description: string;
  optionA: EventOption;
  optionB: EventOption;
}

export interface EraCard {
  id: number;
  name: string;
  era: string;
  description: string;
  themeColor: string;
}

export interface GainBreakdown {
  total: number;
  base: number;
  rank: number;
  era: number;
  /** 点石成金乘算前的基础项合计；仅该分项被乘过时存在 */
  baseBeforeGold?: number;
  /** 点石成金乘算前的排名奖合计；仅该分项被乘过时存在 */
  rankBeforeGold?: number;
  /** 点石成金乘算前的时代加成合计；仅该分项被乘过时存在 */
  eraBeforeGold?: number;
}

export interface SettlementHistoryEntry {
  round: number;
  currentEra: number;
  roundInEra: number;
  results: SettlementProjectResult[];
}

export interface SettlementProjectResult {
  projectId: number;
  name: string;
  type: "short" | "long" | "risk";
  maxEnergy: number;
  totalInvested: number;
  isExploded: boolean;
  isCompleted: boolean;
  /** 本轮被【项目做空】短路结算 */
  shortSold?: boolean;
  /** 第四时代第二轮未完成长期梯度结算 */
  endGradient?: boolean;
  playerInvestments: Record<string, number>; 
  playerGains: Record<string, GainBreakdown>;
}

export type LotterySource = "random.org" | "server" | "manual";

export interface LotteryOffer {
  offerId: string;
  playerId: string;
  amount: number;
  /** 线上随机骰子点数 1–6 */
  roll?: number;
  source?: LotterySource;
  drawnAt?: number;
}

export interface GameState {
  roomId: string;
  players: Player[];
  phase: Phase;

  readyPlayers: string[]; 
  phaseFinished: string[];

  transactions: Transaction[];
  chatGroups?: ChatGroup[];
  groupMessages?: GroupMessage[];
  directMessages?: DirectMessage[];
  predictions?: AgentPrediction[];
  agentDecisions?: AgentDecision[];
  experiment?: ExperimentMeta | null;
  seed?: number | null;
  seedBase?: number | null;
  sessionOrdinal?: number;
  /** 上帝视角：本场拍卖卡池（服务端下发） */
  auctionPoolCardIds?: string[];
  /** 本场可见私信/转账归档元数据（热尾之外是否还有更早记录） */
  transactionLog?: { total: number; hasMore: boolean };
  /** 主持当前是否处于某玩家只读视角（仅管理端下发） */
  adminPerspectivePlayerId?: string | null;
  /** 上帝视角标记（仅管理端总览时下发） */
  isGodView?: boolean;

  currentEra: number;
  roundInEra: number;
  globalRound: number;
  /** 开局锁定的人数；第 1 轮消耗前可能随座位重锁 */
  energyTableSize?: number;
  /** 服务端按锁定人数算出的下一轮精力；终局为 null */
  nextRoundEnergy?: number | null;

  discussionEndsAt?: number;
  investmentEndsAt?: number;
  /** 有值表示投资倒计时已暂停；剩余 = investmentEndsAt - pausedAt */
  investmentTimerPausedAt?: number;
  buffPhaseEndsAt?: number;
  /** 与 investmentEndsAt 同包下发，用于校正倒计时 */
  serverNow?: number;
  tutorialStep?: number;

  activeProjects: ActiveProject[];
  uncompletedProjects: ActiveProject[];
  completedProjects: ActiveProject[];
  /** 本局曾抽出的项目 id（含已离场） */
  drawnProjects?: number[];

  totalRiskEnergyAvailable: number;

  currentEraCard?: EraCard;
  pendingEvents?: Record<string, EventCard>; 

  logs: string[];
  /** 仅上帝视图：本轮道具流水（玩家视图不下发） */
  roundBuffPlays?: Record<string, unknown>[];
  /** 仅上帝视图：本轮打火机声明（玩家视图不下发） */
  lighterBurnDeclarations?: Record<string, unknown>[];
  /** 仅上帝视图：玩家个人日志（玩家视图不下发） */
  playerLogs?: Record<string, string[]>;

  lastSettlement?: {
    round: number;
    results: SettlementProjectResult[];
    /** 仅上帝视图：本轮打火机命中/未命中摘要 */
    lighterResolve?: { hits: number; misses: number };
    hostAdjusted?: boolean;
    hostRevision?: number;
  };

  hostRevision?: number;
  /** 主持上帝视角：结算阶段牌面项目列表（来自结算快照） */
  settlementBaselineActiveProjects?: ActiveProject[];

  /** 本局各轮结算快照（不含 telemetry 事件） */
  settlementHistory?: SettlementHistoryEntry[];
  
  communityName?: string;
  globalLeaderboard?: { name: string; score: number; recordedAt?: number }[];
  /** 本轮拍卖已成功成交的道具卡 id */
  auctionDistributedCardIds?: string[];
  /** 正在拍的卡 */
  auctionFocusCardId?: string;
  /** 本场拍卖已用过强买强卖的玩家 */
  forceBuyUsedPlayerIds?: string[];
  /** 本场拍卖成交明细（主持撤销发放用） */
  auctionCompletedDeals?: {
    cardId: string;
    playerId: string;
    cost: number;
    auctionRound?: number;
    source?: "hammer" | "force_buy";
  }[];
  /** 起拍价（固定为 5） */
  auctionStartingBid?: number;
  /** 现在最高价 */
  auctionCurrentBid?: number;
  auctionHighBidderId?: string | null;
  auctionHighBidderName?: string | null;
  /** 当前领先出价的 id（主持确认成交防过期用） */
  auctionHighBidId?: string | null;
  /** 至少要出到 */
  auctionMinimumNextBid?: number;
  /** 本场已成交（玩家可见：卡、得主、成交价；不含出价时的财富比例） */
  auctionSoldLots?: {
    cardId: string;
    playerId: string;
    playerName: string;
    cost: number;
    source?: "hammer" | "force_buy";
  }[];
  /** 本局已发放的全部拍卖成交（公开情报，不含是否已使用） */
  auctionSessionWins?: {
    cardId: string;
    playerId: string;
    playerName: string;
    cost: number;
    auctionRound?: number;
    source?: "hammer" | "force_buy";
  }[];
  auctionBidHistory?: {
    bidId: string;
    playerId: string;
    playerName: string;
    amount: number;
    incrementFromPrevious: number;
    timestamp: number;
    status: "leading" | "outbid" | "won" | "void_passed" | "void_force_buy" | "void_lot_changed";
  }[];
  /** 仅管理端：全部出价（含可用财富与比例） */
  auctionBids?: {
    bidId: string;
    auctionRound: number;
    cardId: string;
    playerId: string;
    playerName: string;
    amount: number;
    wealthAtBid: number;
    availableWealthAtBid: number;
    bidToAvailableRatio: number | null;
    timestamp: number;
    status: string;
  }[];
  /** @deprecated 旧填价确认 */
  pendingAuctionOffers?: { offerId: string; playerId: string; cardId: string; cost: number }[];
  /** @deprecated */
  pendingAuctionOffer?: { offerId: string; playerId: string; cardId: string; cost: number };
  /** @deprecated */
  myPendingAuctionOffers?: { offerId: string; playerId: string; cardId: string; cost: number }[];
  /** 仅管理端：待玩家确认的彩票开奖 */
  pendingLotteryOffers?: LotteryOffer[];
  /** 仅本人：待确认的彩票开奖（刷新/重连后仍显示弹窗） */
  pendingLotteryOffer?: LotteryOffer;
  /** 仅管理端：已确认彩票开奖 */
  lotteryCompletedDeals?: { playerId: string; amount: number }[];
  /** 仅管理端：待玩家确认的财富调整 */
  pendingWealthAdjustments?: { offerId: string; playerId: string; delta: number }[];
  /** 仅本人：待确认的财富调整 */
  pendingWealthAdjustment?: { offerId: string; playerId: string; delta: number };
  /** 仅管理端：待认领的新设备 */
  pendingDeviceClaims?: { playerId: string; requestedAt: number }[];
}