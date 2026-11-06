import { io, type Socket } from "socket.io-client";
import type { AgentConfig, RuntimeConfig } from "./config.js";
import { createLogger } from "./logger.js";
import { AgentMemory } from "./memory.js";
import { buildObservation } from "./observation.js";
import {
  buildAuctionPrompt,
  buildCommunityNamePrompt,
  buildInvestmentPrompt,
  buildPredictionPrompt,
  buildSystemPrompt,
  buildTransactionPrompt,
} from "./prompts.js";
import {
  LlmFailureError,
  askAgentJson,
  resetAgentUsage,
  type LlmResult,
  type LlmUsage,
} from "./llm.js";
import type {
  AuctionPlan,
  ChatMessagePlan,
  GameSnapshot,
  InvestmentPlan,
  Observation,
  PredictionPlan,
  TransactionDecision,
} from "./types.js";

const PHASE_INVEST = new Set(["INVESTMENT", "BUFF_USAGE"]);
const MAX_PUBLIC_MESSAGES_PER_TURN = 2;
const MAX_PRIVATE_MESSAGES_PER_TURN = 2;
/** 每杯咖啡的财富成本；与 server/logic/coffeeLogic.ts 保持一致 */
const COFFEE_WEALTH_COST = 17;
/** 没有 gameUpdate 时的兜底心跳：重试被静默拒绝的动作，避免整局卡住 */
const HEARTBEAT_MS = 3_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function phaseKey(game: GameSnapshot): string {
  return `${game.phase}:${game.currentEra}:${game.roundInEra}:${game.globalRound}`;
}

function int(v: unknown): number | null {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

function oneLine(text: unknown, max = 300): string {
  return String(text ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export interface AgentClientHooks {
  /** 模型失败 / 预算超限 / 语义无效：终止整局，不静默兜底。 */
  onFatal: (agentIndex: number, error: unknown) => void;
}

export class AgentClient {
  readonly cfg: AgentConfig;
  readonly runtime: RuntimeConfig;
  private readonly hooks: AgentClientHooks;
  private readonly socket: Socket;
  private readonly log: ReturnType<typeof createLogger>;
  private readonly memory: AgentMemory;

  private game: GameSnapshot | null = null;
  private playerId: string | null = null;
  private reconnectToken: string | null = null;
  private joinedRoom = false;

  private busy = false;
  private tickTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private pendingTick = false;
  private fatalReported = false;

  private readySent = new Set<string>();
  private investmentPlanned = new Set<string>();
  private investmentAttemptAt = new Map<string, number>();
  private handledNotices = new Set<string>();
  private handledTransactions = new Set<string>();
  private passedLots = new Set<string>();
  private auctionDecisionKeys = new Set<string>();
  private auctionDecisionsByLot = new Map<string, number>();
  private namedCommunity = false;
  private predictionSentForEra = new Set<number>();
  private predictionBusyForEra = new Set<number>();
  private outcomeRecordedForRound = new Set<number>();
  private seenPublicMessageIds = new Set<string>();
  private seenPrivateMessageIds = new Set<string>();
  private lastPhaseKey = "";
  private previousPhase = "";
  private sessionKey = "";

  constructor(cfg: AgentConfig, runtime: RuntimeConfig, hooks: AgentClientHooks) {
    this.cfg = cfg;
    this.runtime = runtime;
    this.hooks = hooks;
    this.log = createLogger(`agent#${cfg.index}:${cfg.name}`);
    this.memory = new AgentMemory(cfg.index, runtime.memoryDir, runtime.memoryEnabled);
    this.socket = io(runtime.serverUrl, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      path: "/socket.io/",
    });
    this.bind();
    // 即使服务端没有广播新状态（例如某次动作被静默拒绝），也定期重新评估，
    // 保证「投资重试 / 转账回执 / 阶段 ready」不会因为等不到事件而卡死。
    this.heartbeatTimer = setInterval(() => {
      if (!this.joinedRoom || this.fatalReported) return;
      this.scheduleTick(0);
    }, HEARTBEAT_MS);
    this.heartbeatTimer.unref?.();
  }

  get index(): number {
    return this.cfg.index;
  }

  get name(): string {
    return this.cfg.name;
  }

  get isJoined(): boolean {
    return this.joinedRoom && this.playerId != null;
  }

  get currentPlayerId(): string | null {
    return this.playerId;
  }

  get snapshot(): GameSnapshot | null {
    return this.game;
  }

  private bind(): void {
    this.socket.on("connect", () => this.onConnect());
    this.socket.on("disconnect", (reason) => {
      this.log.warn(`断开连接：${reason}`);
      this.joinedRoom = false;
    });
    this.socket.on("connect_error", (err) => {
      this.log.warn(`连接失败：${err.message}`);
    });
    this.socket.on("playerJoined", (payload: { playerId?: string; reconnectToken?: string }) => {
      if (payload?.playerId) this.playerId = payload.playerId;
      if (payload?.reconnectToken) this.reconnectToken = payload.reconnectToken;
      this.joinedRoom = true;
      // 断线期间可能漏掉回执；重连后允许重新处理仍在待确认列表里的事务。
      // ready / investment 的重发是幂等的：服务端已 ready 时会被忽略。
      this.handledTransactions.clear();
      this.handledNotices.clear();
      this.readySent.clear();
      this.investmentPlanned.clear();
      this.predictionBusyForEra.clear();
      // 拍卖决策键也清掉：断线前若出价事件丢失，重连后可以再试一次；
      // 服务端会拒绝「已领先/低于最低价」的出价，不会造成重复成交。
      this.auctionDecisionKeys.clear();
      this.log.info(`已加入房间，playerId=${this.playerId}`);
      this.registerMeta();
      this.scheduleTick(300);
    });
    this.socket.on("gameUpdate", (game: GameSnapshot) => {
      this.game = game;
      this.onGameUpdate(game);
    });
    this.socket.on("error", (message: unknown) => {
      this.log.warn(`服务端错误：${String(message)}`);
    });
    this.socket.on("playerNotify", (payload: unknown) => {
      this.log.debug(`通知：${JSON.stringify(payload)}`);
    });
    this.socket.on("playerKicked", (payload: unknown) => {
      this.log.warn(`被主持人移出房间：${JSON.stringify(payload)}`);
      this.joinedRoom = false;
    });
    this.socket.on("sessionReplaced", (payload: unknown) => {
      this.log.warn(`身份被替换：${JSON.stringify(payload)}`);
      this.joinedRoom = false;
    });
    this.socket.on("clientUpdateRequired", (payload: unknown) => {
      // 版本不一致会让服务端拒绝关键事件；继续跑只会产生不可信数据，直接终止。
      this.printFatal(`客户端版本过期：${JSON.stringify(payload)}`);
    });
    this.socket.on("deviceClaimPending", () => {
      this.printFatal("需要主持人批准换设备认领；请检查是否重复启动了 agents 进程。");
    });
  }

  private onConnect(): void {
    this.log.info(`已连接 ${this.runtime.serverUrl}`);
    this.socket.emit("joinGame", {
      roomId: this.runtime.roomId,
      name: this.cfg.name,
      ...(this.reconnectToken ? { reconnectToken: this.reconnectToken } : {}),
    });
  }

  private registerMeta(): void {
    this.socket.emit("agentRegister", {
      agentIndex: this.cfg.index,
      model: this.cfg.model,
      provider: this.cfg.provider,
    });
  }

  private onGameUpdate(game: GameSnapshot): void {
    const previousPhase = this.previousPhase;
    this.previousPhase = game.phase;
    const nextSessionKey = `${game.sessionId ?? ""}:${game.sessionStartedAt ?? ""}`;
    const enteringWaiting = game.phase === "ROOM_WAITING" && previousPhase !== "ROOM_WAITING";
    const sessionChanged =
      nextSessionKey !== this.sessionKey && nextSessionKey !== ":" && nextSessionKey !== "";
    if (enteringWaiting || sessionChanged) {
      this.resetSessionState();
      this.sessionKey = nextSessionKey;
      if (nextSessionKey !== ":" && nextSessionKey !== "") {
        this.memory.beginSession(nextSessionKey, game.sessionId ?? nextSessionKey);
        resetAgentUsage(this.cfg.index);
        this.log.info(`新对局：sessionKey=${nextSessionKey}`);
      }
    }
    this.ingestMessages(game);
    const key = phaseKey(game);
    if (key !== this.lastPhaseKey) {
      this.lastPhaseKey = key;
      this.log.info(
        `阶段变化 → ${game.phase} | 时代 ${game.currentEra} 第 ${game.roundInEra} 轮 | 全局轮 ${game.globalRound}`
      );
    }
    this.scheduleTick(250);
  }

  private resetSessionState(): void {
    this.readySent.clear();
    this.investmentPlanned.clear();
    this.investmentAttemptAt.clear();
    this.handledNotices.clear();
    this.handledTransactions.clear();
    this.passedLots.clear();
    this.auctionDecisionKeys.clear();
    this.auctionDecisionsByLot.clear();
    this.namedCommunity = false;
    this.predictionSentForEra.clear();
    this.predictionBusyForEra.clear();
    this.outcomeRecordedForRound.clear();
    this.seenPublicMessageIds.clear();
    this.seenPrivateMessageIds.clear();
    this.lastPhaseKey = "";
  }

  /** 把新看到的公开/私聊写入记忆。聊天是数据，不是指令。 */
  private ingestMessages(game: GameSnapshot): void {
    if (!this.memory.isEnabled || !this.playerId) return;
    const groupLabels = new Map(
      (game.chatGroups ?? []).map((g) => [
        g.id,
        g.kind === "public" ? "公开" : `群聊·${g.name}`,
      ])
    );
    for (const m of game.groupMessages ?? []) {
      if (this.seenPublicMessageIds.has(m.id)) continue;
      this.seenPublicMessageIds.add(m.id);
      if (m.fromId === this.playerId) continue;
      const label = groupLabels.get(m.groupId) ?? "群聊";
      this.memory.record(
        "chat",
        `[${label}] ${m.fromName}: ${oneLine(m.text, 220)}`,
        {
          globalRound: game.globalRound,
          era: game.currentEra,
          roundInEra: game.roundInEra,
          data: { messageId: m.id, fromId: m.fromId, groupId: m.groupId },
        }
      );
    }
    for (const m of game.directMessages ?? []) {
      if (this.seenPrivateMessageIds.has(m.id)) continue;
      this.seenPrivateMessageIds.add(m.id);
      const mine = m.toId === this.playerId || m.fromId === this.playerId;
      if (!mine) continue;
      // 自己发出的私聊已在 sendPlannedMessages 记录，避免重复。
      if (m.fromId === this.playerId) continue;
      this.memory.record(
        "chat",
        `[私聊] ${m.fromName} → ${m.toName}: ${oneLine(m.text, 220)}`,
        {
          globalRound: game.globalRound,
          era: game.currentEra,
          roundInEra: game.roundInEra,
          data: { messageId: m.id, fromId: m.fromId, toId: m.toId },
        }
      );
    }
  }

  private scheduleTick(delay = 250): void {
    if (this.pendingTick || this.fatalReported) return;
    this.pendingTick = true;
    this.tickTimer = setTimeout(() => {
      this.pendingTick = false;
      this.tickTimer = null;
      void this.tick();
    }, delay);
  }

  private async tick(): Promise<void> {
    if (!this.game || !this.playerId || this.fatalReported) return;
    if (this.busy) {
      this.scheduleTick(400);
      return;
    }
    this.busy = true;
    let acted = false;
    try {
      acted = await this.runTurn();
    } catch (e) {
      this.printFatal(e instanceof Error ? e.stack ?? e.message : String(e));
    } finally {
      this.busy = false;
      if (acted) this.scheduleTick(400);
    }
  }

  private printFatal(message: unknown): void {
    if (this.fatalReported) return;
    this.fatalReported = true;
    this.log.error(`【实验终止】${String(message)}`);
    this.hooks.onFatal(this.cfg.index, message);
  }

  private async runTurn(): Promise<boolean> {
    const game = this.game!;
    let obs = buildObservation(game, this.playerId!);
    let acted = false;

    // 1) 立即回执类：摸鱼 / 打火机 / 彩票 / 财富调整
    const noticesActed = await this.handleNotices(obs);
    acted = noticesActed || acted;

    // 2) 待处理转账
    const txActed = await this.handleTransactions(obs);
    acted = txActed || acted;

    // 转账/开奖会改变财富，后续投资与拍卖必须用最新视角
    if (noticesActed || txActed) {
      obs = buildObservation(this.game!, this.playerId!);
    }

    // 3) 阶段动作
    const key = phaseKey(game);
    if (game.phase === "ERA_INTRO") {
      acted = (await this.handleEraIntro(obs, key)) || acted;
    } else if (game.phase === "SETTLEMENT") {
      this.recordSettlementOutcome(obs);
      if (!obs.me.ready && !this.readySent.has(key)) {
        this.readySent.add(key);
        await this.politeDelay(0.4);
        this.emit("playerReady", {});
        this.log.info(`阶段 SETTLEMENT：已准备`);
        acted = true;
      }
    } else if (game.phase === "GAME_OVER") {
      this.recordFinalOutcome(obs);
    } else if (PHASE_INVEST.has(game.phase)) {
      const attemptAt = this.investmentAttemptAt.get(key);
      if (
        this.investmentPlanned.has(key) &&
        !obs.me.ready &&
        attemptAt != null &&
        Date.now() - attemptAt > 20_000
      ) {
        // 上一次方案可能被服务端拒绝或事件丢失，允许再试一次
        this.investmentPlanned.delete(key);
      }
      if (!obs.me.ready && !this.investmentPlanned.has(key)) {
        this.investmentPlanned.add(key);
        this.investmentAttemptAt.set(key, Date.now());
        await this.planAndSubmitInvestment(obs);
        acted = true;
      }
    } else if (game.phase === "AUCTION") {
      acted = (await this.handleAuction(obs)) || acted;
    } else if (game.phase === "COMMUNITY_NAMING") {
      acted = (await this.handleCommunityNaming(obs)) || acted;
    }

    return acted;
  }

  private askOptions(label: string) {
    return {
      timeoutMs: this.runtime.decisionTimeoutMs,
      maxRetries: this.runtime.maxRetries,
      maxOutputTokens: this.runtime.maxOutputTokens,
      tokenBudget: this.runtime.tokenBudget,
      label,
    };
  }

  /**
   * 网络/JSON 重试在 llm.ts；这里再对「字段语义」重试一次。
   * 仍无效则终止本局——不退回规则策略。
   */
  private async askWithValidation<T>(
    label: string,
    user: string,
    validate: (data: unknown) => T | null,
    semanticAttempts = 2
  ): Promise<{ value: T; usage?: LlmUsage; latencyMs: number }> {
    let lastProblem = "";
    let prompt = user;
    for (let attempt = 1; attempt <= semanticAttempts; attempt++) {
      const result: LlmResult = await askAgentJson(
        this.cfg,
        buildSystemPrompt(this.cfg),
        prompt,
        this.askOptions(label)
      );
      const value = validate(result.data);
      if (value) {
        return {
          value,
          usage: result.usage
            ? { ...result.usage, calls: 1 }
            : undefined,
          latencyMs: result.latencyMs,
        };
      }
      lastProblem = "输出 JSON 缺少必要字段或取值非法";
      this.log.warn(`${label} 第 ${attempt} 次语义校验失败：${lastProblem}`);
      prompt = `${user}\n\n注意：上一次输出无效（${lastProblem}）。请严格按上面的 schema 输出单个 JSON 对象，不要输出其他内容。`;
    }
    throw new LlmFailureError(
      `agent#${this.cfg.index} ${label}：${semanticAttempts} 次语义校验均失败（${lastProblem}）。`
    );
  }

  private emitDecision(
    kind: "prediction" | "investment" | "auction" | "transaction" | "chat" | "community_name",
    reasoning: string,
    action: unknown,
    usage?: LlmUsage,
    latencyMs?: number
  ): void {
    this.emit("agentDecision", {
      kind,
      reasoning: oneLine(reasoning, 1200),
      action,
      model: this.cfg.model,
      promptTokens: usage?.prompt,
      completionTokens: usage?.completion,
      totalTokens: usage?.total,
      latencyMs,
    });
  }

  private async handleNotices(obs: Observation): Promise<boolean> {
    const me = this.game!.players.find((p) => p.id === this.playerId);
    if (!me) return false;
    let acted = false;

    for (const hit of me.pendingSlackHits ?? []) {
      const id = `slack:${hit.id}`;
      if (this.handledNotices.has(id)) continue;
      this.handledNotices.add(id);
      this.emit("ackSlackHit", { hitId: hit.id });
      this.log.info(`确认摸鱼提示：${hit.energyDelta}（精力 ${hit.energyAfter}）`);
      this.memory.record("notice", `被摸鱼传染，精力变化 ${hit.energyDelta}`, {
        globalRound: this.game!.globalRound,
        era: this.game!.currentEra,
        roundInEra: this.game!.roundInEra,
      });
      acted = true;
    }

    for (const notice of me.pendingLighterBurnNotices ?? []) {
      const id = `lighter:${notice.id}`;
      if (this.handledNotices.has(id)) continue;
      this.handledNotices.add(id);
      this.emit("ackLighterBurn", { noticeId: notice.id });
      this.log.info(`确认打火机提示：${notice.message}`);
      this.memory.record("notice", `被 ${notice.casterName} 用打火机烧掉 ${notice.cardName}`, {
        globalRound: this.game!.globalRound,
        era: this.game!.currentEra,
        roundInEra: this.game!.roundInEra,
      });
      acted = true;
    }

    if (me.pendingLotteryOffer) {
      const id = `lottery:${me.pendingLotteryOffer.offerId}`;
      if (!this.handledNotices.has(id)) {
        this.handledNotices.add(id);
        this.emit("playerRespondLottery", {
          offerId: me.pendingLotteryOffer.offerId,
          accept: true,
        });
        this.log.info(`接受彩票开奖：${me.pendingLotteryOffer.amount}`);
        acted = true;
      }
    }

    if (me.pendingWealthAdjustment) {
      const id = `wealth:${me.pendingWealthAdjustment.offerId}`;
      if (!this.handledNotices.has(id)) {
        this.handledNotices.add(id);
        this.emit("playerRespondWealthAdjust", {
          offerId: me.pendingWealthAdjustment.offerId,
          accept: true,
        });
        this.log.info(`接受财富调整：${me.pendingWealthAdjustment.delta}`);
        acted = true;
      }
    }

    return acted;
  }

  private async handleEraIntro(obs: Observation, key: string): Promise<boolean> {
    let acted = false;
    if (this.runtime.predictionEnabled && !this.predictionSentForEra.has(obs.era)) {
      if (this.predictionBusyForEra.has(obs.era)) return false;
      this.predictionBusyForEra.add(obs.era);
      try {
        await this.submitPrediction(obs);
        acted = true;
      } catch (error) {
        // 预测是观测项，不是投资/拍卖决策；单次模型异常不应终止整局。
        this.log.warn(
          `时代 ${obs.era} 预测失败，跳过本次预测：${
            error instanceof Error ? error.message : String(error)
          }`
        );
      } finally {
        this.predictionSentForEra.add(obs.era);
        this.predictionBusyForEra.delete(obs.era);
      }
    }
    if (!obs.me.ready && !this.readySent.has(key)) {
      this.readySent.add(key);
      await this.politeDelay(0.4);
      this.emit("playerReady", {});
      this.log.info(`阶段 ERA_INTRO：已准备`);
      acted = true;
    }
    return acted;
  }

  private async submitPrediction(obs: Observation): Promise<void> {
    const ids = obs.players.map((p) => p.id);
    const result = await this.askWithValidation<PredictionPlan>(
      `era${obs.era}-prediction`,
      buildPredictionPrompt(obs, this.cfg, this.memory.digest()),
      (data) => {
        if (!data || typeof data !== "object") return null;
        const raw = (data as { ranking?: unknown }).ranking;
        if (!Array.isArray(raw)) return null;
        const byName = new Map(obs.players.map((p) => [p.name, p.id]));
        const ranking = raw
          .map((v) => (typeof v === "string" ? byName.get(v) ?? v : ""))
          .filter((v): v is string => !!v);
        if (
          ranking.length !== ids.length ||
          new Set(ranking).size !== ranking.length ||
          ranking.some((id) => !ids.includes(id))
        ) {
          return null;
        }
        return {
          ranking,
          reasoning:
            typeof (data as { reasoning?: unknown }).reasoning === "string"
              ? (data as { reasoning: string }).reasoning
              : "",
        };
      }
    );

    const names = result.value.ranking
      .map((id) => obs.players.find((p) => p.id === id)?.name ?? id)
      .join(" > ");
    this.emit("submitPrediction", {
      era: obs.era,
      ranking: result.value.ranking,
      reasoning: result.value.reasoning,
      model: this.cfg.model,
    });
    this.emitDecision("prediction", result.value.reasoning ?? "", { ranking: result.value.ranking }, result.usage, result.latencyMs);
    this.memory.record("prediction", `时代 ${obs.era} 预测最终排名：${names}`, {
      globalRound: obs.globalRound,
      era: obs.era,
      roundInEra: obs.roundInEra,
      data: { ranking: result.value.ranking },
    });
    this.log.info(`时代 ${obs.era} 预测：${names}`);
  }

  private async handleTransactions(obs: Observation): Promise<boolean> {
    let acted = false;
    for (const tx of obs.myPendingTransactions) {
      if (this.handledTransactions.has(tx.id)) continue;
      this.handledTransactions.add(tx.id);
      const decision = await this.decideTransaction(obs, tx);
      this.emit("respondTransaction", { txId: tx.id, accept: decision.decision === "accept" });
      this.log.info(
        `转账 ${tx.fromName} → ${tx.amount}：${decision.decision}（${decision.reasoning ?? "no reason"}）`
      );
      this.memory.record(
        "transfer",
        `收到 ${tx.fromName} 的转账 ${tx.amount}（备注：${oneLine(tx.note, 80) || "无"}），我${decision.decision === "accept" ? "接受" : "拒绝"}了`,
        {
          globalRound: obs.globalRound,
          era: obs.era,
          roundInEra: obs.roundInEra,
          data: { txId: tx.id, fromId: tx.fromId, amount: tx.amount },
        }
      );
      acted = true;
    }
    return acted;
  }

  private async planAndSubmitInvestment(obs: Observation): Promise<void> {
    await this.politeDelay(1);
    const result = await this.decideInvestment(obs);
    const plan = this.sanitizeInvestmentPlan(result.plan, obs);
    this.log.info(`投资方案：${JSON.stringify(plan)}`);

    // 先拉群，再发群消息；新建群要等 gameUpdate 把新 groupId 带回来。
    const createdGroup = await this.createPlannedGroup(plan.createGroup, obs);
    if (createdGroup) {
      await this.waitForUpdate(1200);
      obs = buildObservation(this.game!, this.playerId!);
    }

    const sentMessages = await this.sendPlannedMessages(plan.messages ?? [], obs);
    const sentGroupMessages = await this.sendPlannedGroupMessages(
      plan.groupMessages ?? [],
      obs
    );
    if (sentMessages + sentGroupMessages > 0) await sleep(200);

    // 先买咖啡（+1 精力/杯），等状态刷新后再提交
    if ((plan.coffee ?? 0) > 0) {
      for (let i = 0; i < (plan.coffee ?? 0); i++) {
        this.emit("performCoffee", {});
        await sleep(150);
      }
      await this.waitForUpdate(1500);
    }

    // 再使用道具
    if (plan.useCard) {
      this.emit("useBuffCard", plan.useCard);
      await this.waitForUpdate(1500);
    }

    // 转账（可同时进行）
    if (plan.transfer) {
      this.emit("createTransaction", {
        toId: plan.transfer.toPlayerId,
        amount: plan.transfer.amount,
        note: plan.transfer.note ?? "",
        clientTempId: `agent-${this.cfg.index}-${Date.now()}`,
      });
      await sleep(200);
    }

    const latest = this.game ? buildObservation(this.game, this.playerId!) : obs;
    if (latest.me.ready) {
      this.log.info("已处于锁定状态，跳过提交");
    } else if (PHASE_INVEST.has(latest.phase)) {
      const investment = this.sanitizeInvestment(plan.investment, latest);
      this.emit("submitInvestment", { investment });
      this.log.info(`提交投资：${JSON.stringify(investment)}`);
    } else {
      this.emit("playerReady", {});
    }

    this.emitDecision(
      "investment",
      plan.reasoning ?? "",
      {
        messages: plan.messages ?? [],
        groupMessages: plan.groupMessages ?? [],
        createGroup: plan.createGroup ?? null,
        transfer: plan.transfer,
        coffee: plan.coffee,
        useCard: plan.useCard,
        investment: plan.investment,
      },
      result.usage,
      result.latencyMs
    );
    this.memory.record(
      "action",
      `第 ${obs.globalRound} 轮投资：${JSON.stringify(plan.investment)}` +
        (plan.transfer ? `；转账 ${plan.transfer.amount} 给 ${obs.players.find((p) => p.id === plan.transfer!.toPlayerId)?.name ?? plan.transfer.toPlayerId}` : "") +
        (plan.coffee ? `；买咖啡 ${plan.coffee} 杯` : "") +
        (plan.useCard ? `；使用 ${plan.useCard.cardId}` : "") +
        (createdGroup ? `；创建群聊「${plan.createGroup?.name ?? "未命名"}」` : "") +
        (sentMessages ? `；发言 ${sentMessages} 条` : "") +
        (sentGroupMessages ? `；群发言 ${sentGroupMessages} 条` : ""),
      {
        globalRound: obs.globalRound,
        era: obs.era,
        roundInEra: obs.roundInEra,
        data: { investment: plan.investment, transfer: plan.transfer, coffee: plan.coffee },
      }
    );
  }

  private async createPlannedGroup(
    group: InvestmentPlan["createGroup"] | null | undefined,
    obs: Observation
  ): Promise<boolean> {
    if (!this.runtime.chatEnabled || !group) return false;
    const memberIds = group.memberIds.filter(
      (id) => id !== obs.me.id && obs.players.some((p) => p.id === id)
    );
    if (memberIds.length < 2) return false;
    this.emit("createChatGroup", {
      memberIds,
      name: group.name ?? "",
    });
    const names = memberIds
      .map((id) => obs.players.find((p) => p.id === id)?.name ?? id)
      .join("、");
    this.memory.record("action", `创建群聊「${group.name ?? "未命名"}」：${names}`, {
      globalRound: obs.globalRound,
      era: obs.era,
      roundInEra: obs.roundInEra,
      data: { memberIds },
    });
    this.emitDecision("chat", `创建群聊「${group.name ?? "未命名"}」`, {
      createGroup: { name: group.name ?? "", memberIds },
    });
    this.log.info(`创建群聊：${group.name ?? "未命名"}（${names}）`);
    return true;
  }

  private async sendPlannedGroupMessages(
    messages: NonNullable<InvestmentPlan["groupMessages"]>,
    obs: Observation
  ): Promise<number> {
    if (!this.runtime.chatEnabled || messages.length === 0) return 0;
    let sent = 0;
    for (const message of messages) {
      const group = obs.groupChats.find((g) => g.id === message.groupId);
      if (!group) continue;
      const text = oneLine(message.text, 300);
      if (!text) continue;
      this.emit("sendGroupMessage", {
        groupId: group.id,
        text,
        clientTempId: `agent-${this.cfg.index}-grp-${Date.now()}-${sent}`,
      });
      sent += 1;
      this.memory.record("chat", `[我·群聊 ${group.name}] ${text}`, {
        globalRound: obs.globalRound,
        era: obs.era,
        roundInEra: obs.roundInEra,
        data: { groupId: group.id },
      });
      await sleep(180);
    }
    if (sent > 0) {
      this.emitDecision("chat", `在群聊中发送 ${sent} 条消息`, {
        groupMessages: messages,
      });
    }
    return sent;
  }

  private async sendPlannedMessages(messages: ChatMessagePlan[], obs: Observation): Promise<number> {
    if (!this.runtime.chatEnabled || messages.length === 0) return 0;
    let publicSent = 0;
    let privateSent = 0;
    let total = 0;
    for (const message of messages) {
      if (!message || typeof message.text !== "string") continue;
      const text = oneLine(message.text, 300);
      if (!text) continue;
      if (message.channel === "public" && publicSent < MAX_PUBLIC_MESSAGES_PER_TURN) {
        // 没有公开群时不硬编码假群 ID，否则服务端会拒绝并反复重试
        if (!obs.publicGroupId) continue;
        this.emit("sendGroupMessage", {
          groupId: obs.publicGroupId,
          text,
          clientTempId: `agent-${this.cfg.index}-pub-${Date.now()}-${total}`,
        });
        publicSent += 1;
        total += 1;
        this.memory.record("chat", `[我·公开] ${text}`, {
          globalRound: obs.globalRound,
          era: obs.era,
          roundInEra: obs.roundInEra,
        });
        await sleep(180);
      } else if (message.channel === "private" && privateSent < MAX_PRIVATE_MESSAGES_PER_TURN) {
        const toId = typeof message.toPlayerId === "string" ? message.toPlayerId : "";
        const target = obs.players.find((p) => p.id === toId && !p.isMe);
        if (!target) continue;
        this.emit("sendDirectMessage", {
          toId,
          text,
          clientTempId: `agent-${this.cfg.index}-dm-${Date.now()}-${total}`,
        });
        privateSent += 1;
        total += 1;
        this.memory.record("chat", `[我·私聊→${target.name}] ${text}`, {
          globalRound: obs.globalRound,
          era: obs.era,
          roundInEra: obs.roundInEra,
        });
        await sleep(180);
      }
    }
    if (total > 0) {
      this.emitDecision("chat", `本轮共发送 ${total} 条消息`, {
        public: publicSent,
        private: privateSent,
        messages,
      });
    }
    return total;
  }

  private sanitizeInvestmentPlan(plan: InvestmentPlan, obs: Observation): InvestmentPlan {
    // 可用财富 = 账面 − 已发出未确认转账；咖啡与再转账都不能超过它
    const availableWealth = Math.max(0, obs.me.wealth - (obs.me.pendingOut ?? 0));
    const maxCups = Math.max(0, Math.floor(availableWealth / COFFEE_WEALTH_COST));
    const coffee = Math.min(Math.max(0, int(plan.coffee) ?? 0), maxCups, 3);

    let useCard = plan.useCard ?? null;
    if (useCard) {
      const candidate = useCard;
      const cardId = candidate.cardId;
      const targetPlayerId = candidate.targetPlayerId?.trim();
      const targetProjectId = int(candidate.targetProjectId) ?? undefined;
      const burnCardId = candidate.burnCardId?.trim();
      const allowedCards = [
        "buff_gold",
        "buff_insurance",
        "buff_work_rest",
        "buff_slack",
        "buff_short",
        "buff_lighter",
      ];
      const valid =
        obs.me.inventory.includes(cardId) &&
        allowedCards.includes(cardId) &&
        (!targetPlayerId || obs.players.some((p) => p.id === targetPlayerId)) &&
        (!targetProjectId || obs.projects.some((p) => p.id === targetProjectId)) &&
        (cardId !== "buff_slack" || !!targetPlayerId) &&
        (cardId !== "buff_work_rest" || !!targetPlayerId) &&
        (cardId !== "buff_short" || !!targetProjectId) &&
        (cardId !== "buff_lighter" || (!!targetPlayerId && !!burnCardId));
      useCard = valid
        ? {
            cardId,
            ...(targetPlayerId ? { targetPlayerId } : {}),
            ...(targetProjectId ? { targetProjectId } : {}),
            ...(burnCardId ? { burnCardId } : {}),
            ...(candidate.burnFromInventory ? { burnFromInventory: true } : {}),
          }
        : null;
    }

    let transfer = plan.transfer ?? null;
    if (transfer) {
      const amount = int(transfer.amount) ?? 0;
      const to = obs.players.find((p) => p.id === transfer!.toPlayerId);
      const transferBudget = Math.max(0, availableWealth - coffee * COFFEE_WEALTH_COST);
      if (!to || to.isMe || amount <= 0 || amount > transferBudget) transfer = null;
      else transfer = { ...transfer, amount };
    }

    const messages = (plan.messages ?? []).filter(
      (m) => m && (m.channel === "public" || m.channel === "private") && typeof m.text === "string"
    );

    const groupMessages = (plan.groupMessages ?? [])
      .filter(
        (m) =>
          m &&
          typeof m.groupId === "string" &&
          typeof m.text === "string" &&
          obs.groupChats.some((g) => g.id === m.groupId)
      )
      .map((m) => ({ groupId: m.groupId, text: oneLine(m.text, 300) }))
      .filter((m) => !!m.text)
      .slice(0, 3);

    let createGroup = plan.createGroup ?? null;
    if (createGroup) {
      const ids = Array.isArray(createGroup.memberIds)
        ? [
            ...new Set(
              createGroup.memberIds.filter(
                (id): id is string =>
                  typeof id === "string" &&
                  id !== obs.me.id &&
                  obs.players.some((p) => p.id === id)
              )
            ),
          ].slice(0, 5)
        : [];
      if (ids.length < 2) {
        createGroup = null;
      } else {
        createGroup = {
          ...(typeof createGroup.name === "string" && createGroup.name.trim()
            ? { name: oneLine(createGroup.name, 32) }
            : {}),
          memberIds: ids,
        };
      }
    }

    return {
      ...plan,
      messages,
      groupMessages,
      createGroup,
      coffee,
      useCard,
      transfer,
      investment: plan.investment ?? {},
      ready: true,
    };
  }

  private sanitizeInvestment(
    raw: Record<string, number> | undefined,
    obs: Observation
  ): Record<string, number> {
    const out: Record<string, number> = {};
    let budget = Math.max(0, Math.floor(obs.me.energy));
    if (!raw || typeof raw !== "object") return out;

    for (const [key, value] of Object.entries(raw)) {
      const id = int(key);
      const amount = int(value);
      if (id == null || amount == null || amount <= 0) continue;
      const project = obs.projects.find((p) => p.id === id);
      if (!project) continue;
      const remaining = Math.max(0, Math.floor(project.maxEnergy - project.currentInvested));
      const allowed = Math.min(amount, remaining, budget);
      if (allowed <= 0) continue;
      out[String(id)] = (out[String(id)] ?? 0) + allowed;
      budget -= allowed;
    }
    return out;
  }

  private async decideInvestment(
    obs: Observation
  ): Promise<{ plan: InvestmentPlan; usage?: LlmUsage; latencyMs: number }> {
    const result = await this.askWithValidation<InvestmentPlan>(
      `r${obs.globalRound}-investment`,
      buildInvestmentPrompt(obs, this.cfg, this.memory.digest()),
      (data) => {
        if (!data || typeof data !== "object") return null;
        const raw = data as Partial<InvestmentPlan>;
        if (!raw.investment || typeof raw.investment !== "object") return null;
        return {
          reasoning: typeof raw.reasoning === "string" ? raw.reasoning : "",
          messages: Array.isArray(raw.messages) ? raw.messages : [],
          groupMessages: Array.isArray(raw.groupMessages) ? raw.groupMessages : [],
          createGroup: raw.createGroup ?? null,
          transfer: raw.transfer ?? null,
          coffee: int(raw.coffee) ?? 0,
          useCard: raw.useCard ?? null,
          investment: raw.investment,
          ready: true,
        };
      }
    );
    return { plan: result.value, usage: result.usage, latencyMs: result.latencyMs };
  }

  private async handleAuction(obs: Observation): Promise<boolean> {
    const game = this.game!;
    const cardId = game.auctionFocusCardId;
    if (!cardId) return false;
    const lotKey = `${game.currentEra}:${cardId}`;
    if (this.passedLots.has(lotKey)) return false;

    const decisions = this.auctionDecisionsByLot.get(lotKey) ?? 0;
    if (decisions >= this.runtime.auctionMaxDecisions) {
      this.passedLots.add(lotKey);
      this.log.info(`拍卖 ${cardId}：已达本轮决策上限，停止加价`);
      return false;
    }

    const highBidder = game.auctionHighBidderId ?? null;
    if (highBidder === this.playerId) return false;

    const highBidId = game.auctionHighBidId ?? "none";
    const decisionKey = `${lotKey}:${game.auctionCurrentBid ?? 0}:${highBidId}`;
    if (this.auctionDecisionKeys.has(decisionKey)) return false;
    this.auctionDecisionKeys.add(decisionKey);

    const availableWealth = Math.max(0, obs.me.wealth - (obs.me.pendingOut ?? 0));
    const maxBid = Math.max(
      0,
      Math.floor(availableWealth * this.runtime.auctionMaxWealthRatio)
    );
    const minNext = game.auctionMinimumNextBid ?? game.auctionStartingBid ?? 5;

    this.auctionDecisionsByLot.set(lotKey, decisions + 1);
    const result = await this.decideAuction(obs, cardId, maxBid);
    this.log.info(`拍卖 ${cardId} 决策：${JSON.stringify(result.plan)}（上限 ${maxBid}）`);
    this.emitDecision("auction", result.plan.reasoning ?? "", { cardId, ...result.plan }, result.usage, result.latencyMs);

    // 模型返回时焦点可能已经切到下一张卡；不要把对 A 的决策执行到 B 上
    if (this.game?.auctionFocusCardId !== cardId) {
      this.log.warn(`拍卖焦点已从 ${cardId} 切走，放弃本次 ${result.plan.action}`);
      return false;
    }

    if (result.plan.action === "force_buy") {
      if (obs.me.inventory.includes("buff_force_buy")) {
        await this.politeDelay(0.5);
        if (this.game?.auctionFocusCardId !== cardId) return false;
        this.emit("useBuffCard", { cardId: "buff_force_buy" });
        this.memory.record("action", `拍卖 ${cardId}：使用强买强卖`, {
          globalRound: obs.globalRound,
          era: obs.era,
          roundInEra: obs.roundInEra,
        });
        return true;
      }
      this.passedLots.add(lotKey);
      return false;
    }

    if (result.plan.action === "bid") {
      // 模型偶尔会照抄示例或给出低于当前最低价的金额；按当前最低价兜底一次，
      // 保留出价意图，避免同一口价反复被拒导致拍卖空转。
      const planned = int(result.plan.amount) ?? 0;
      const latestGame = this.game;
      const latestMin =
        latestGame?.auctionMinimumNextBid ??
        latestGame?.auctionStartingBid ??
        minNext;
      const amount = Math.max(planned, latestMin);
      if (amount <= maxBid) {
        await this.politeDelay(0.6);
        if (this.game?.auctionFocusCardId !== cardId) {
          this.log.warn(`出价前拍卖焦点已从 ${cardId} 切走，放弃本次出价`);
          return false;
        }
        this.emit("playerPlaceAuctionBid", { amount });
        this.log.info(
          `出价 ${amount}` + (amount !== planned ? `（模型原出价 ${planned}，按最低价兜底）` : "")
        );
        this.memory.record("action", `拍卖 ${cardId}：出价 ${amount}`, {
          globalRound: obs.globalRound,
          era: obs.era,
          roundInEra: obs.roundInEra,
        });
        return true;
      }
      // 不要立刻标记 pass：并发出价被拒后，下一帧仍有新的最低价，可再试一次。
      this.log.warn(`出价 ${planned} 无效（最低 ${latestMin} / 上限 ${maxBid}），等待下一次机会`);
      return false;
    }

    this.passedLots.add(lotKey);
    this.memory.record("action", `拍卖 ${cardId}：放弃`, {
      globalRound: obs.globalRound,
      era: obs.era,
      roundInEra: obs.roundInEra,
    });
    return false;
  }

  private async decideAuction(
    obs: Observation,
    cardId: string,
    maxBid: number
  ): Promise<{ plan: AuctionPlan; usage?: LlmUsage; latencyMs: number }> {
    const result = await this.askWithValidation<AuctionPlan>(
      `auction-${cardId}`,
      buildAuctionPrompt(obs, this.cfg, cardId, maxBid, this.memory.digest()),
      (data) => {
        if (!data || typeof data !== "object") return null;
        const raw = data as Partial<AuctionPlan> & { action?: unknown };
        if (raw.action !== "bid" && raw.action !== "pass" && raw.action !== "force_buy") {
          return null;
        }
        return {
          action: raw.action,
          amount: int(raw.amount) ?? undefined,
          reasoning: typeof raw.reasoning === "string" ? raw.reasoning : "",
        };
      }
    );
    return { plan: result.value, usage: result.usage, latencyMs: result.latencyMs };
  }

  private async decideTransaction(
    obs: Observation,
    tx: { id: string; fromName: string; amount: number; note: string }
  ): Promise<TransactionDecision> {
    const result = await this.askWithValidation<TransactionDecision>(
      `tx-${tx.id.slice(0, 8)}`,
      buildTransactionPrompt(
        obs,
        { ...tx, fromId: "", toId: "", toName: "", status: "pending", timestamp: 0 },
        this.cfg,
        this.memory.digest()
      ),
      (data) => {
        if (!data || typeof data !== "object") return null;
        const decision = (data as { decision?: unknown }).decision;
        if (decision !== "accept" && decision !== "reject") return null;
        return {
          decision,
          reasoning: String((data as { reasoning?: unknown }).reasoning ?? ""),
        };
      },
      2
    );
    this.emitDecision(
      "transaction",
      result.value.reasoning ?? "",
      { txId: tx.id, fromName: tx.fromName, amount: tx.amount, decision: result.value.decision },
      result.usage,
      result.latencyMs
    );
    return result.value;
  }

  private recordSettlementOutcome(obs: Observation): void {
    // 一次 gameUpdate 可能跨过多轮（重连/卡顿），把尚未记录的轮次都补上，
    // 而不是只记录 settlementHistory 的最后一条。
    for (const last of obs.settlementHistory) {
      if (this.outcomeRecordedForRound.has(last.round)) continue;
      this.outcomeRecordedForRound.add(last.round);
      let ownGain = 0;
      let ownInvested = 0;
      for (const res of last.results) {
        ownInvested += res.playerInvestments[obs.me.id] ?? 0;
        ownGain += res.playerGains[obs.me.id]?.total ?? 0;
      }
      this.memory.record(
        "outcome",
        `第 ${last.round} 轮结算：财富 ${obs.me.wealth}，排名 ${obs.me.rank}` +
          (ownInvested || ownGain ? `；本轮投入 ${ownInvested}，收益 ${ownGain}` : ""),
        {
          globalRound: last.round,
          era: obs.era,
          roundInEra: obs.roundInEra,
          data: { wealth: obs.me.wealth, rank: obs.me.rank, ownInvested, ownGain },
        }
      );
    }
  }

  private recordFinalOutcome(obs: Observation): void {
    const key = -1;
    if (this.outcomeRecordedForRound.has(key)) return;
    this.outcomeRecordedForRound.add(key);
    this.memory.record(
      "outcome",
      `游戏结束：最终财富 ${obs.me.wealth}，排名 ${obs.me.rank}；社区名 ${this.game?.communityName ?? "未命名"}`,
      {
        globalRound: obs.globalRound,
        era: obs.era,
        roundInEra: obs.roundInEra,
      }
    );
  }

  private async handleCommunityNaming(obs: Observation): Promise<boolean> {
    if (this.namedCommunity) return false;
    const connected = this.game!.players.filter((p) => p.connected);
    if (connected.length === 0) return false;
    const namer = connected.reduce((best, p) => (p.wealth > best.wealth ? p : best), connected[0]);
    if (namer.id !== this.playerId) return false;

    this.namedCommunity = true;
    const result = await this.askWithValidation<string>(
      "community-name",
      buildCommunityNamePrompt(obs, this.cfg),
      (data) => {
        if (!data || typeof data !== "object") return null;
        const raw = (data as { name?: unknown }).name;
        if (typeof raw !== "string" || !raw.trim()) return null;
        return raw.trim().replace(/[^一-龥A-Za-z0-9]/g, "").slice(0, 12);
      }
    );
    const name = result.value;
    await this.politeDelay(0.6);
    this.emit("submitCommunityName", { name });
    this.emitDecision("community_name", `提交社区名称：${name}`, { name }, result.usage, result.latencyMs);
    this.memory.record("action", `我为社区命名：${name}`, {
      globalRound: obs.globalRound,
      era: obs.era,
      roundInEra: obs.roundInEra,
    });
    this.log.info(`提交社区名称：${name}`);
    return true;
  }

  private emit(event: string, payload: unknown): void {
    this.socket.emit(event, payload);
  }

  private async politeDelay(scale = 1): Promise<void> {
    const min = this.runtime.actionDelayMinMs * scale;
    const max = this.runtime.actionDelayMaxMs * scale;
    const jitter = Math.floor(Math.random() * Math.max(1, max - min));
    await sleep(min + jitter);
  }

  private waitForUpdate(timeoutMs: number): Promise<void> {
    return new Promise((resolve) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        this.socket.off("gameUpdate", done);
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(done, timeoutMs);
      this.socket.on("gameUpdate", done);
    });
  }

  /** 供 orchestrator 判断是否已就座 */
  requestState(): void {
    if (this.joinedRoom) this.socket.emit("requestGameState");
  }

  close(): void {
    if (this.tickTimer) clearTimeout(this.tickTimer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.socket.close();
  }
}
