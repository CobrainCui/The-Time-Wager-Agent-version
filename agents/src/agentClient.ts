import { io, type Socket } from "socket.io-client";
import type { AgentConfig, RuntimeConfig } from "./config.js";
import { createLogger } from "./logger.js";
import { buildObservation } from "./observation.js";
import {
  buildAuctionPrompt,
  buildCommunityNamePrompt,
  buildInvestmentPrompt,
  buildSystemPrompt,
  buildTransactionPrompt,
} from "./prompts.js";
import { askAgentJson } from "./llm.js";
import {
  fallbackAuction,
  fallbackCommunityName,
  fallbackInvestment,
  fallbackTransactionDecision,
} from "./policy.js";
import type {
  AuctionPlan,
  GameSnapshot,
  InvestmentPlan,
  Observation,
  TransactionDecision,
} from "./types.js";

const PHASE_INVEST = new Set(["INVESTMENT", "BUFF_USAGE"]);

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

export class AgentClient {
  readonly cfg: AgentConfig;
  readonly runtime: RuntimeConfig;
  private readonly socket: Socket;
  private readonly log: ReturnType<typeof createLogger>;

  private game: GameSnapshot | null = null;
  private playerId: string | null = null;
  private reconnectToken: string | null = null;
  private everJoined = false;
  private joinedRoom = false;

  private busy = false;
  private tickTimer: NodeJS.Timeout | null = null;
  private pendingTick = false;

  private readySent = new Set<string>();
  private investmentPlanned = new Set<string>();
  private investmentAttemptAt = new Map<string, number>();
  private handledNotices = new Set<string>();
  private handledTransactions = new Set<string>();
  private passedLots = new Set<string>();
  private auctionDecisionKeys = new Set<string>();
  private auctionDecisionsByLot = new Map<string, number>();
  private namedCommunity = false;
  private lastPhaseKey = "";
  private previousPhase = "";
  private sessionKey = "";

  constructor(cfg: AgentConfig, runtime: RuntimeConfig) {
    this.cfg = cfg;
    this.runtime = runtime;
    this.log = createLogger(`agent#${cfg.index}:${cfg.name}`);
    this.socket = io(runtime.serverUrl, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      path: "/socket.io/",
    });
    this.bind();
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
      this.everJoined = true;
      this.joinedRoom = true;
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
      this.log.error(`客户端版本过期：${JSON.stringify(payload)}`);
    });
    this.socket.on("deviceClaimPending", () => {
      this.log.error("需要主持人批准换设备认领；请检查是否重复启动了 agents 进程。");
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
      persona: this.cfg.persona,
      model: this.cfg.model,
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
    }
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
    this.lastPhaseKey = "";
  }

  private scheduleTick(delay = 250): void {
    if (this.pendingTick) return;
    this.pendingTick = true;
    this.tickTimer = setTimeout(() => {
      this.pendingTick = false;
      this.tickTimer = null;
      void this.tick();
    }, delay);
  }

  private async tick(): Promise<void> {
    if (!this.game || !this.playerId) return;
    if (this.busy) {
      this.scheduleTick(400);
      return;
    }
    this.busy = true;
    let acted = false;
    try {
      acted = await this.runTurn();
    } catch (e) {
      this.log.error("回合处理失败", e instanceof Error ? e.stack : e);
    } finally {
      this.busy = false;
      if (acted) this.scheduleTick(400);
    }
  }

  private async runTurn(): Promise<boolean> {
    const game = this.game!;
    const obs = buildObservation(game, this.playerId!);
    let acted = false;

    // 1) 立即回执类：摸鱼 / 打火机 / 彩票 / 财富调整
    acted = (await this.handleNotices(obs)) || acted;

    // 2) 待处理转账
    acted = (await this.handleTransactions(obs)) || acted;

    // 3) 阶段动作
    const key = phaseKey(game);
    if (game.phase === "ERA_INTRO" || game.phase === "SETTLEMENT" || game.phase === "GAME_OVER") {
      if (game.phase !== "GAME_OVER" && !obs.me.ready && !this.readySent.has(key)) {
        this.readySent.add(key);
        await this.politeDelay(0.5);
        this.emit("playerReady", {});
        this.log.info(`阶段 ${game.phase}：已准备`);
        acted = true;
      }
    } else if (PHASE_INVEST.has(game.phase)) {
      const attemptAt = this.investmentAttemptAt.get(key);
      if (
        this.investmentPlanned.has(key) &&
        !obs.me.ready &&
        attemptAt != null &&
        Date.now() - attemptAt > 10_000
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
      acted = true;
    }

    for (const notice of me.pendingLighterBurnNotices ?? []) {
      const id = `lighter:${notice.id}`;
      if (this.handledNotices.has(id)) continue;
      this.handledNotices.add(id);
      this.emit("ackLighterBurn", { noticeId: notice.id });
      this.log.info(`确认打火机提示：${notice.message}`);
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
      acted = true;
    }
    return acted;
  }

  private async planAndSubmitInvestment(obs: Observation): Promise<void> {
    await this.politeDelay(1);
    const plan = await this.decideInvestment(obs);
    const safe = this.sanitizeInvestmentPlan(plan, obs);
    this.log.info(`投资方案：${JSON.stringify(safe)}`);

    // 先买咖啡（+1 精力/杯），等状态刷新后再提交
    if ((safe.coffee ?? 0) > 0) {
      for (let i = 0; i < (safe.coffee ?? 0); i++) {
        this.emit("performCoffee", {});
        await sleep(150);
      }
      await this.waitForUpdate(1500);
    }

    // 再使用道具
    if (safe.useCard) {
      this.emit("useBuffCard", safe.useCard);
      await this.waitForUpdate(1500);
    }

    // 转账（可同时进行）
    if (safe.transfer) {
      this.emit("createTransaction", {
        toId: safe.transfer.toPlayerId,
        amount: safe.transfer.amount,
        note: safe.transfer.note ?? "",
        clientTempId: `agent-${this.cfg.index}-${Date.now()}`,
      });
      await sleep(200);
    }

    const latest = this.game ? buildObservation(this.game, this.playerId!) : obs;
    if (latest.me.ready) {
      this.log.info("已处于锁定状态，跳过提交");
      return;
    }

    if (PHASE_INVEST.has(latest.phase)) {
      const investment = this.sanitizeInvestment(safe.investment, latest);
      this.emit("submitInvestment", { investment });
      this.log.info(`提交投资：${JSON.stringify(investment)}`);
    } else {
      this.emit("playerReady", {});
    }
  }

  private sanitizeInvestmentPlan(plan: InvestmentPlan, obs: Observation): InvestmentPlan {
    const maxCups = Math.max(0, Math.floor(obs.me.wealth / 17));
    const coffee = Math.min(Math.max(0, int(plan.coffee) ?? 0), maxCups);

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
      if (!to || to.isMe || amount <= 0 || amount > obs.me.wealth) transfer = null;
      else transfer = { ...transfer, amount };
    }

    return {
      ...plan,
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

  private async decideInvestment(obs: Observation): Promise<InvestmentPlan> {
    if (this.runtime.offlineMode) return fallbackInvestment(obs, this.cfg);
    const system = buildSystemPrompt(this.cfg);
    const user = buildInvestmentPrompt(obs, this.cfg);
    const result = await askAgentJson(this.cfg, system, user, this.runtime.decisionTimeoutMs);
    if (result.ok && result.data && typeof result.data === "object") {
      const data = result.data as Partial<InvestmentPlan>;
      if (data.investment && typeof data.investment === "object") {
        return {
          reasoning: typeof data.reasoning === "string" ? data.reasoning : "",
          transfer: data.transfer ?? null,
          coffee: int(data.coffee) ?? 0,
          useCard: data.useCard ?? null,
          investment: data.investment,
          ready: true,
        };
      }
      this.log.warn("模型返回缺少 investment 字段，使用内置策略");
    }
    return fallbackInvestment(obs, this.cfg);
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

    const maxBid = Math.max(0, Math.floor(obs.me.wealth * this.cfg.auctionMaxWealthRatio));
    const minNext = game.auctionMinimumNextBid ?? game.auctionStartingBid ?? 5;

    this.auctionDecisionsByLot.set(lotKey, decisions + 1);
    const plan = await this.decideAuction(obs, cardId, maxBid);
    this.log.info(`拍卖 ${cardId} 决策：${JSON.stringify(plan)}（上限 ${maxBid}）`);

    if (plan.action === "force_buy") {
      if (obs.me.inventory.includes("buff_force_buy")) {
        await this.politeDelay(0.5);
        this.emit("useBuffCard", { cardId: "buff_force_buy" });
        return true;
      }
      return false;
    }

    if (plan.action === "bid") {
      const amount = int(plan.amount) ?? 0;
      if (amount >= minNext && amount <= maxBid) {
        await this.politeDelay(0.6);
        this.emit("playerPlaceAuctionBid", { amount });
        this.log.info(`出价 ${amount}`);
        return true;
      }
      this.log.warn(`出价 ${amount} 无效（最低 ${minNext} / 上限 ${maxBid}），改为放弃`);
    }

    this.passedLots.add(lotKey);
    return false;
  }

  private async decideAuction(
    obs: Observation,
    cardId: string,
    maxBid: number
  ): Promise<AuctionPlan> {
    if (this.runtime.offlineMode) return fallbackAuction(obs, this.cfg, cardId, maxBid);
    const system = buildSystemPrompt(this.cfg);
    const user = buildAuctionPrompt(obs, this.cfg, cardId, maxBid);
    const result = await askAgentJson(this.cfg, system, user, this.runtime.decisionTimeoutMs);
    if (result.ok && result.data && typeof result.data === "object") {
      const data = result.data as Partial<AuctionPlan> & { action?: string };
      const action = data.action;
      if (action === "bid" || action === "pass" || action === "force_buy") {
        return {
          action,
          amount: int(data.amount) ?? undefined,
          reasoning: typeof data.reasoning === "string" ? data.reasoning : "",
        };
      }
    }
    return fallbackAuction(obs, this.cfg, cardId, maxBid);
  }

  private async decideTransaction(
    obs: Observation,
    tx: { id: string; fromName: string; amount: number; note: string }
  ): Promise<TransactionDecision> {
    if (this.runtime.offlineMode) return fallbackTransactionDecision();
    const result = await askAgentJson(
      this.cfg,
      buildSystemPrompt(this.cfg),
      buildTransactionPrompt(obs, { ...tx, fromId: "", toId: "", toName: "", status: "pending", timestamp: 0 }, this.cfg),
      Math.min(this.runtime.decisionTimeoutMs, 30_000)
    );
    if (result.ok && result.data && typeof result.data === "object") {
      const decision = (result.data as { decision?: string }).decision;
      if (decision === "accept" || decision === "reject") {
        return {
          decision,
          reasoning: String((result.data as { reasoning?: unknown }).reasoning ?? ""),
        };
      }
    }
    return fallbackTransactionDecision();
  }

  private async handleCommunityNaming(obs: Observation): Promise<boolean> {
    if (this.namedCommunity) return false;
    const humans = this.game!.players.filter((p) => p.connected && !p.isAI);
    if (humans.length === 0) return false;
    const namer = humans.reduce((best, p) => (p.wealth > best.wealth ? p : best), humans[0]);
    if (namer.id !== this.playerId) return false;

    this.namedCommunity = true;
    let name = fallbackCommunityName(this.cfg, this.cfg.index);
    if (!this.runtime.offlineMode) {
      const result = await askAgentJson(
        this.cfg,
        buildSystemPrompt(this.cfg),
        buildCommunityNamePrompt(obs, this.cfg),
        Math.min(this.runtime.decisionTimeoutMs, 30_000)
      );
      if (result.ok && result.data && typeof result.data === "object") {
        const raw = (result.data as { name?: unknown }).name;
        if (typeof raw === "string" && raw.trim()) name = raw.trim().slice(0, 12);
      }
    }
    await this.politeDelay(0.6);
    this.emit("submitCommunityName", { name });
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
    this.socket.close();
  }
}
