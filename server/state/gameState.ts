import { STARTING_WEALTH } from "../config/startingWealth.js";
import { EventCard, EraCard, eraCards } from "../data/game_data.js";
import { Rng, deriveSeed, seedFromEnv } from "../utils/rng.js";
import { ExperimentMeta, experimentMetaForSeed } from "../config/experiment.js";
import { emptySessionTelemetry, SessionTelemetry } from "./sessionTelemetry.js";

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

/** 一对一私聊。与「0 元转账 + 备注」的旧私信分开记录，便于分析。 */
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

/** Agent 在时代开始时对最终六人排名的显式预测（心智理论测量）。 */
export interface AgentPrediction {
  id: string;
  playerId: string;
  playerName: string;
  era: number;
  globalRound: number;
  /** 从第 1 名到第 6 名的玩家 id */
  ranking: string[];
  reasoning: string;
  timestamp: number;
  model?: string;
}

export type AgentDecisionKind =
  | "prediction"
  | "investment"
  | "auction"
  | "transaction"
  | "chat"
  | "community_name";

/** Agent 每次 LLM 决策的结构化记录，用于导出与成本分析。 */
export interface AgentDecision {
  id: string;
  playerId: string;
  playerName: string;
  kind: AgentDecisionKind;
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

/** 每名玩家每轮的聊天配额计数。 */
export interface ChatUsage {
  round: number;
  public: number;
  private: number;
}

export interface ActiveProject {
  id: number;
  name: string;
  type: "short" | "long" | "risk";
  color?: string; 
  maxEnergy: number;
  era?: string; 

  rankRewards?: number[];
  overInvestPenalty?: number[];
  rate?: number;

  accumulatedInvested: number; 
  currentInvested: number; 

  roundsNoInvestment: number;
  investedThisRound: boolean;

  startRound?: number; 
  eraBonus?: Record<number, number>; 
  
  // ✅ 埋点数据：投资记录、收益记录、总产出
  investorRecords: Record<string, number>;
  /** 短/风险：每位玩家每轮有投入的精力分段（结算全览个人条） */
  investorRoundSlices?: Record<string, number[]>;
  earningRecords: Record<string, number>;
  totalPayout: number;
  /** 第四时代第二轮未完成长期梯度是否已发放 */
  endGradientPaid?: boolean;
  /** 主持强制撤场，不参与第四时代第二轮梯度 */
  adminForceWithdrawn?: boolean;
}

export interface AuctionOffer {
  offerId: string;
  playerId: string;
  cardId: string;
  cost: number;
}

/** 本场拍卖已成交记录（用于主持撤销发放） */
export interface AuctionCompletedDeal {
  cardId: string;
  playerId: string;
  cost: number;
  /** 主持确认成交或强买强卖；旧档可能缺省 */
  source?: "hammer" | "force_buy";
  /** 第几场拍卖成交；旧档可能缺省 */
  auctionRound?: number;
}

/** 公开加价记录状态 */
export type AuctionBidStatus =
  | "leading"
  | "outbid"
  | "won"
  | "void_passed"
  | "void_force_buy"
  | "void_lot_changed";

/** 整场拍卖每次出价（含分析字段；广播时对玩家脱敏） */
export interface AuctionBidRecord {
  bidId: string;
  auctionRound: number;
  cardId: string;
  playerId: string;
  playerName: string;
  amount: number;
  wealthAtBid: number;
  availableWealthAtBid: number;
  /** 出价 / 当时可用；可用为 0 时为 null */
  bidToAvailableRatio: number | null;
  timestamp: number;
  status: AuctionBidStatus;
}

export interface LotteryOffer {
  offerId: string;
  playerId: string;
  amount: number;
  /** 线上随机骰子点数 1–6；主持手动开奖或旧档可能缺省 */
  roll?: number;
  /** 随机源：random.org / 服务端加密随机 / 主持手动 */
  source?: "random.org" | "server" | "manual";
  /** 抽奖完成时间，用于超时自动领取 */
  drawnAt?: number;
}

/** 主持发起的财富调整，待玩家确认后才入账 */
export interface WealthAdjustOffer {
  offerId: string;
  playerId: string;
  /** 正数加钱，负数扣钱 */
  delta: number;
}

/** 已确认开奖记录（主持可撤回） */
export interface LotteryCompletedDeal {
  playerId: string;
  /** 实际入账财富（可能已点石成金） */
  amount: number;
  /** 主持填入 / 随机抽出的原额；旧档可能缺省 */
  enteredAmount?: number;
  /** 入账时是否套用了点石成金 */
  goldApplied?: boolean;
  /** 线上随机骰子点数 1–6 */
  roll?: number;
  /** 随机源：random.org / 服务端加密随机 / 主持手动 */
  source?: "random.org" | "server" | "manual";
}

export interface BuffRoundNote {
  cardId: string;
  role: "used" | "hit";
  text: string;
}

export interface ActiveBuff {
  /** 本轮打出实例 id，结算打火机可精确作废 */
  instanceId?: string;
  cardId: string;
  targetPlayerId?: string;
  targetProjectId?: number;
  extraData?: any;
}

/** 本轮道具打出效果（结算打火机作废时回滚） */
export interface RoundBuffPlayRecord {
  playId: string;
  ownerId: string;
  cardId: string;
  targetPlayerId?: string;
  targetProjectId?: number;
  energyDeltas: { playerId: string; delta: number }[];
  wealthCredited?: number;
  voided: boolean;
  /** 本张【摸鱼传染】已被哪张【劳逸结合】改判；打火机作废时据此回滚改判 */
  convertedByPlayId?: string;
  /** 本张摸鱼打出时目标已带有哪张【劳逸结合】被动（含实例 id） */
  passiveWorkRestInstanceId?: string;
  /** 本张【劳逸结合】追溯改判了哪些摸鱼（按 playId） */
  convertedSlackPlayIds?: string[];
}

/** 投资阶段打火机声明，结算时统一判定 */
export interface LighterBurnDeclaration {
  id: string;
  casterId: string;
  casterName: string;
  targetPlayerId: string;
  burnCardId: string;
}

/** 结算后仅受害者可见的烧毁提示 */
export interface LighterBurnNotice {
  id: string;
  cardId: string;
  cardName: string;
  kind: "inventory" | "played";
  casterName: string;
  message: string;
  energyRefund?: number;
  wealthRefund?: number;
}

// ✅ 人格分析详细数据
export interface MbtiPersona {
  code: string; // e.g., "LADV"
  label: string; // e.g., "长线激进·创业者"
  desc: string;
  axes: {
    Time: { code: string; percent: number }; // code 'L' or 'Q'
    Risk: { code: string; percent: number }; // code 'A' or 'G'
    Disruption: { code: string; percent: number }; // code 'D' or 'C'
    Motivation: { code: string; percent: number }; // code 'V' or 'R'
  };
  axisScores: {
    longShort: number;      // 正=偏长期，负=偏短期
    riskConserv: number;    // 0~100，>50=激进
    disruptFollow: number;  // 0~100，>50=破坏
    profitSocial: number;   // 正=利益导向，负=社交导向
  };
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
  primaryPersona: string;  // 命运素描
  primaryPersonaDesc: string;
  mbtiPersona: MbtiPersona; // 决策基因
}

export interface SlackHitNotice {
  id: string;
  fromName: string;
  /** 精力变化：负数为扣减，劳逸结合生效为 +8 */
  energyDelta: number;
  energyAfter: number;
  /** 摸鱼后精力为负且已自动解锁锁定投资 */
  investmentAutoUnlocked?: boolean;
  /** 对应的本轮摸鱼流水；打火机作废该次摸鱼时按此精确移除提示 */
  sourcePlayId?: string;
}

export interface Player {
  id: string;
  name: string;
  socketId?: string; 
  /** 重连票据，仅下发给本人；为空表示主持已允许下一次同名加入重新认领 */
  reconnectToken?: string;

  energy: number;
  wealth: number;
  /** 本轮起始精力是否已经发给这名玩家。离线错过发放时为 false，重连后据此补发，避免把被扣光的精力又加回来。 */
  receivedRoundEnergy?: boolean; 

  connected: boolean;
  ready: boolean; 

  rank: number;

  investment: Record<number, number>;
  /** 讨论/投资阶段本地预填，倒计时结束时服务端据此自动提交 */
  investmentDraft?: Record<number, number>;
  /** 提交投资前快照，供上帝解锁时恢复空提交前的预填 */
  preSubmitInvestmentDraft?: Record<number, number>;
  /** 主持改写草稿时递增，客户端同步表单 */
  investmentDraftAdminRevision?: number;
  longTerm: Record<number, { 
    totalInvested: number; 
    status: "active"|"completed"|"abandoned";
    reward?: number;
    roundSlices?: number[];
  }>;

  riskGains: Record<number, number>;
  inventory: string[];
  usedCards: string[]; 
  activeBuffs: ActiveBuff[];
  /** 本轮使用 / 受到的道具短说明（仅本人广播） */
  buffRoundNotes?: BuffRoundNote[];
  
  // 本轮被谁使用了摸鱼传染（供劳逸结合事后改判）
  slackedBy: string[];
  /** 与 slackedBy 对齐：每次摸鱼实际扣掉的精力（触及 0 时可能小于 8） */
  slackEnergyLost?: number[];
  /** 被摸鱼后待本人确认的弹窗（仅本人广播） */
  pendingSlackHits?: SlackHitNotice[];
  /** 结算打火机命中后待本人确认（未打出须确认后才从手牌移除） */
  pendingLighterBurnNotices?: LighterBurnNotice[];

  /** 本轮（BUFF+投资窗口）已购买咖啡杯数，可退订 */
  coffeePurchasesThisRound?: number;

  // === 数据埋点 ===
  totalEnergyConsumed: number;
  wealthHistory: number[];
  investedRiskEnergy: number;
  investedLongEnergy: number;
  investedShortEnergy: number;
  socialRank: 'A' | 'B' | 'C' | 'D' | 'E' | null;
  
  analysisResult?: PersonaAnalysis;
  // === 服务端旧 AI Bot（Agent 版已停用） ===
  isAI?: boolean;
  aiPersona?: string; // e.g. "时荫植者", "瞬刻炼金士"

  // === Agent 玩家（外部 agents 运行时驱动） ===
  /** 该座位由外部 Agent 运行时连接并驱动；不等同于 isAI */
  isAgent?: boolean;
  /** 1–6，对应 AGENT_<n>_API_KEY */
  agentIndex?: number;
  /** Agent 的人格 / 风格名（实验版留空，仅为兼容旧数据） */
  agentPersona?: string;
  /** Agent 使用的模型标识（仅管理端与导出） */
  agentModel?: string;
  /** Agent 的 API 供应商标签（仅管理端与导出） */
  agentProvider?: string;
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

export type AdminProjectAdjustEntry =
  | {
      kind: "stake";
      projectId: number;
      playerId: string;
      delta: number;
      phase: "INVESTMENT" | "SETTLEMENT";
    }
  | {
      kind: "withdraw";
      projectId: number;
      phase: "INVESTMENT" | "SETTLEMENT";
    };

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

export interface GameState {
  roomId: string;
  players: Player[];
  phase: Phase;

  phaseFinished: Set<string>; 
  readyPlayers: Set<string>;  
  discussionEndsAt?: number;
  investmentEndsAt?: number;
  /** 有值表示投资倒计时已暂停；剩余 = investmentEndsAt - pausedAt */
  investmentTimerPausedAt?: number;
  buffPhaseEndsAt?: number;  

  tutorialStep?: number;    

  transactions: Transaction[];

  chatGroups?: ChatGroup[];
  groupMessages?: GroupMessage[];
  /** 一对一私聊（玩家 / Agent 均可用；仅收发双方与上帝可见） */
  directMessages?: DirectMessage[];
  /** 每名玩家每轮的聊天配额 */
  chatUsage?: Record<string, ChatUsage>;
  /** Agent 的最终排名预测 */
  predictions?: AgentPrediction[];
  /** Agent 的 LLM 决策记录 */
  agentDecisions?: AgentDecision[];

  currentEra: number;
  roundInEra: number;
  globalRound: number;
  
  eraSequence: number[]; 

  lastEraRanking?: string[]; 

  activeProjects: ActiveProject[];
  uncompletedProjects: ActiveProject[];
  completedProjects: ActiveProject[];
  
  drawnProjects: Set<number>;
  /** 已为哪一时代发过第一轮项目牌；避免跳过时代介绍后漏发或重复发 */
  projectDrawEra?: number;

  totalRiskEnergyAvailable: number;

  currentEraCard?: EraCard;
  pendingEvents: Record<string, EventCard>; 
  eventCards: Record<string, EventCard>; 
  eventChoices: Record<string, "A" | "B">; 

  logs: string[];
  playerLogs: Record<string, string[]>; 
  lastSettlement?: {
    round: number;
    results: SettlementProjectResult[];
    /** 本轮结算前打火机处理摘要（展示用） */
    lighterResolve?: { hits: number; misses: number };
    hostAdjusted?: boolean;
    hostRevision?: number;
  };

  /** 本轮进入 settlePhase 前的不可变快照（不广播） */
  settlementBaseline?: unknown;
  /** 主持项目调整流水（审计与结算阶段重放） */
  adminProjectAdjustments?: AdminProjectAdjustEntry[];
  /** 主持项目调整版本号，提交时需 expectedRevision 匹配 */
  hostRevision?: number;

  /** 本轮打火机声明（结算时消费） */
  lighterBurnDeclarations?: LighterBurnDeclaration[];
  /** 本轮道具打出流水 */
  roundBuffPlays?: RoundBuffPlayRecord[];

  communityName?: string;
  globalLeaderboard?: { name: string; score: number; roomId?: string; recordedAt?: number }[];
  /** 本轮拍卖已成功成交的道具卡 id */
  auctionDistributedCardIds?: string[];
  /** 主持标出的「当前正在拍」的卡（强买强卖用） */
  auctionFocusCardId?: string;
  /** 本场拍卖已使用过强买强卖的玩家 id */
  forceBuyUsedPlayerIds?: string[];
  /** 本场拍卖成交明细（主持可撤销） */
  auctionCompletedDeals?: AuctionCompletedDeal[];
  /** 本场拍卖全部出价记录（含分析字段） */
  auctionBids?: AuctionBidRecord[];
  /** @deprecated 旧「主持填价确认」；竞价流程不再写入 */
  pendingAuctionOffers?: AuctionOffer[];
  /** 主持已发出、等待玩家确认的彩票开奖（不广播给玩家） */
  pendingLotteryOffers?: LotteryOffer[];
  /** 已确认彩票开奖（上帝视图撤回用） */
  lotteryCompletedDeals?: LotteryCompletedDeal[];
  /** 主持已发出、等待玩家确认的财富调整（不广播全表） */
  pendingWealthAdjustments?: WealthAdjustOffer[];
  /** 换设备认领：等待主持批准的新连接（不广播 socketId） */
  pendingDeviceClaims?: { playerId: string; socketId: string; requestedAt: number }[];
  /** 进入 TUTORIAL 前的阶段，用于教程结束后判断是否全量 reset */
  tutorialEntryPhase?: Phase;

  /**
   * 开局时锁定的人数，决定整局用四/五/六人精力表。
   * 未设置时按当时人数现算（仅开局前）。
   */
  energyTableSize?: number;
  /** 房间创建时间，用于空等候房 TTL */
  roomCreatedAt?: number;
  /** 建房来源 IP，仅用于并发配额，不广播 */
  createdByIp?: string;

  /** 本局唯一标识（首次正式开局时生成） */
  sessionId?: string;
  /** 本局开始时间（首次正式开局） */
  sessionStartedAt?: number;

  /** 实验：基准种子与派生本局种子（不广播给玩家） */
  seedBase: number;
  seed: number;
  /** 本局随机流状态；所有结构性随机抽取都从这里取 */
  rngState: number;
  /** 同一基准种子下的第几局（0 开始） */
  sessionOrdinal: number;
  experiment: ExperimentMeta;

  /** 行为流水与结算历史（不广播给玩家客户端） */
  sessionTelemetry?: SessionTelemetry;
}

export function createInitialGame(
  roomId: string,
  _playerNames: string[],
  options: { seedBase?: number; sessionOrdinal?: number } = {}
): GameState {
  const seedBase = options.seedBase ?? seedFromEnv();
  const sessionOrdinal = Math.max(0, Math.trunc(options.sessionOrdinal ?? 0));
  const seed = deriveSeed(seedBase, sessionOrdinal);
  const rng = new Rng(seed);
  // 引擎只有 4 个时代（4 × 2 = 8 轮）；第 5 张时代卡不再进入序列，避免「抽了但永远玩不到」。
  const initialEraSequence = rng.shuffle([0, 1, 2, 3, 4]).slice(0, 4);

  return {
    roomId,
    players: [],
    phase: "ROOM_WAITING",
    roomCreatedAt: Date.now(),

    phaseFinished: new Set(),
    readyPlayers: new Set(),

    transactions: [],
    chatGroups: [],
    groupMessages: [],
    directMessages: [],
    chatUsage: {},
    predictions: [],
    agentDecisions: [],

    currentEra: 1,
    roundInEra: 1,
    globalRound: 1,

    eraSequence: initialEraSequence,
    currentEraCard: eraCards.find(c => c.id === (initialEraSequence[0] + 1)) || eraCards[0],

    activeProjects: [],
    uncompletedProjects: [],
    completedProjects: [],
    drawnProjects: new Set(),

    totalRiskEnergyAvailable: 0,

    pendingEvents: {},
    eventCards: {},
    eventChoices: {},

    logs: [],
    playerLogs: {},

    investmentEndsAt: undefined,
    investmentTimerPausedAt: undefined,
    tutorialStep: 0,

    seedBase,
    seed,
    rngState: rng.rngState,
    sessionOrdinal,
    experiment: experimentMetaForSeed(seedBase, seed, sessionOrdinal),

    sessionTelemetry: emptySessionTelemetry(),
  };
}

function freshPlayerFromIdentity(
  meta: Pick<
    Player,
    | "id"
    | "name"
    | "socketId"
    | "reconnectToken"
    | "connected"
    | "isAI"
    | "aiPersona"
    | "isAgent"
    | "agentIndex"
    | "agentPersona"
    | "agentModel"
    | "agentProvider"
  >
): Player {
  return {
    id: meta.id,
    name: meta.name,
    socketId: meta.socketId,
    reconnectToken: meta.reconnectToken,
    connected: meta.connected,
    isAI: meta.isAI,
    aiPersona: meta.aiPersona,
    isAgent: meta.isAgent,
    agentIndex: meta.agentIndex,
    agentPersona: meta.agentPersona,
    agentModel: meta.agentModel,
    agentProvider: meta.agentProvider,
    ready: false,
    energy: 15,
    wealth: STARTING_WEALTH,
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
    totalEnergyConsumed: 15,
    wealthHistory: [STARTING_WEALTH],
    investedRiskEnergy: 0,
    investedLongEnergy: 0,
    investedShortEnergy: 0,
    socialRank: null,
  };
}

/** 同一房间新开一局：保留玩家身份，其余对齐 createInitialGame */
export function resetGameSession(game: GameState): void {
  const preserved = game.players.map((p) => ({
    id: p.id,
    name: p.name,
    socketId: p.socketId,
    reconnectToken: p.reconnectToken,
    connected: p.connected,
    isAI: p.isAI,
    aiPersona: p.aiPersona,
    isAgent: p.isAgent,
    agentIndex: p.agentIndex,
    agentPersona: p.agentPersona,
    agentModel: p.agentModel,
    agentProvider: p.agentProvider,
  }));

  const fresh = createInitialGame(game.roomId, [], {
    seedBase: game.seedBase ?? seedFromEnv(),
    sessionOrdinal: (game.sessionOrdinal ?? 0) + 1,
  });
  fresh.players = preserved.map(freshPlayerFromIdentity);
  fresh.logs.push("🔄 新一局已开始，状态已重置");

  game.players = fresh.players;
  game.phase = fresh.phase;
  game.phaseFinished = fresh.phaseFinished;
  game.readyPlayers = fresh.readyPlayers;
  game.transactions = fresh.transactions;
  game.chatGroups = fresh.chatGroups;
  game.groupMessages = fresh.groupMessages;
  game.directMessages = fresh.directMessages;
  game.chatUsage = fresh.chatUsage;
  game.predictions = fresh.predictions;
  game.agentDecisions = fresh.agentDecisions;
  game.currentEra = fresh.currentEra;
  game.roundInEra = fresh.roundInEra;
  game.globalRound = fresh.globalRound;
  game.eraSequence = fresh.eraSequence;
  game.lastEraRanking = undefined;
  game.activeProjects = fresh.activeProjects;
  game.uncompletedProjects = fresh.uncompletedProjects;
  game.completedProjects = fresh.completedProjects;
  game.drawnProjects = fresh.drawnProjects;
  game.projectDrawEra = undefined;
  game.totalRiskEnergyAvailable = fresh.totalRiskEnergyAvailable;
  game.currentEraCard = fresh.currentEraCard;
  game.pendingEvents = fresh.pendingEvents;
  game.eventCards = fresh.eventCards;
  game.eventChoices = fresh.eventChoices;
  game.logs = fresh.logs;
  game.playerLogs = fresh.playerLogs;
  game.investmentEndsAt = undefined;
  game.investmentTimerPausedAt = undefined;
  game.buffPhaseEndsAt = undefined;
  game.discussionEndsAt = undefined;
  game.tutorialStep = 0;
  game.tutorialEntryPhase = undefined;
  game.lastSettlement = undefined;
  game.communityName = undefined;
  game.globalLeaderboard = undefined;
  game.auctionDistributedCardIds = undefined;
  game.auctionCompletedDeals = undefined;
  game.auctionBids = undefined;
  game.auctionFocusCardId = undefined;
  game.forceBuyUsedPlayerIds = undefined;
  game.pendingAuctionOffers = undefined;
  game.pendingLotteryOffers = undefined;
  game.lotteryCompletedDeals = undefined;
  game.pendingWealthAdjustments = undefined;
  game.pendingDeviceClaims = undefined;
  game.energyTableSize = undefined;
  game.roomCreatedAt = Date.now();
  game.sessionId = undefined;
  game.sessionStartedAt = undefined;
  game.seedBase = fresh.seedBase;
  game.seed = fresh.seed;
  game.rngState = fresh.rngState;
  game.sessionOrdinal = fresh.sessionOrdinal;
  game.experiment = fresh.experiment;
  game.sessionTelemetry = emptySessionTelemetry();
}

export function needsSessionReset(game: GameState): boolean {
  if (game.phase === "GAME_OVER" || game.phase === "COMMUNITY_NAMING") return true;
  if (game.communityName) return true;
  if (game.players.some((p) => p.analysisResult)) return true;
  return false;
}

/** 教程结束（或从教程直接开局）时：必要时全量 reset，否则回到开局前 ERA_INTRO */
export function finishTutorialExit(game: GameState): void {
  if (shouldResetAfterTutorial(game)) {
    resetGameSession(game);
  } else {
    game.phase = "ROOM_WAITING";
    game.tutorialStep = 0;
    game.tutorialEntryPhase = undefined;
  }
}

export function getWealthiestPlayer(game: GameState): Player | undefined {
  if (game.players.length === 0) return undefined;
  return game.players.reduce((best, p) => (p.wealth > best.wealth ? p : best), game.players[0]);
}

/** 当前拥有社区命名权的玩家：在线真人中财富最高者；首富离线时顺延 */
export function getCommunityNamer(game: GameState): Player | undefined {
  const candidates = game.players.filter((p) => p.connected && !p.isAI);
  if (candidates.length === 0) return undefined;
  return candidates.reduce((best, p) => (p.wealth > best.wealth ? p : best), candidates[0]);
}

export function shouldResetAfterTutorial(game: GameState): boolean {
  const entry = game.tutorialEntryPhase;
  if (!entry) return false;
  if (entry !== "ERA_INTRO" && entry !== "TUTORIAL") return true;
  if (game.currentEra > 1 || game.roundInEra > 1 || game.globalRound > 1) return true;
  if (game.lastSettlement) return true;
  if (game.activeProjects.length > 0) return true;
  if (game.players.some((p) => p.wealth > 0 || (p.inventory?.length ?? 0) > 0)) return true;
  return false;
}