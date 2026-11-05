import { io, type Socket } from "socket.io-client";
import type { RuntimeConfig } from "./config.js";
import { AgentClient } from "./agentClient.js";
import { createLogger } from "./logger.js";
import type { GameSnapshot } from "./types.js";

const log = createLogger("orchestrator");
const RESTART_DELAY_MS = 5_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface OrchestratorHooks {
  /** 所有目标局数完成（AGENT_GAME_LIMIT）。 */
  onComplete?: (completedGames: number) => void;
  /** 任一 Agent 模型失败 / 预算超限，整局终止。 */
  onFatal?: (agentIndex: number, error: unknown) => void;
}

export class Orchestrator {
  private readonly runtime: RuntimeConfig;
  private readonly hooks: OrchestratorHooks;
  private readonly agents: AgentClient[];
  private admin: Socket | null = null;
  private adminReady = false;
  private adminGame: GameSnapshot | null = null;
  private started = false;
  private stopping = false;
  private pollTimer: NodeJS.Timeout | null = null;
  private experimentLogged = false;

  private auctionActionPending = false;
  private passedCards = new Set<string>();
  private currentLot: string | null = null;
  private focusStartedAt = 0;
  private lastBidAt = 0;
  private lastBidSignature = "";
  private auctionEnded = false;

  private restartScheduled = false;
  private completedSessionIds = new Set<string>();
  private joinDeadlineAt = 0;

  constructor(runtime: RuntimeConfig, hooks: OrchestratorHooks = {}) {
    this.runtime = runtime;
    this.hooks = hooks;
    this.agents = runtime.agents.map(
      (cfg) =>
        new AgentClient(cfg, runtime, {
          onFatal: (agentIndex, error) => this.fail(agentIndex, error),
        })
    );
  }

  start(): void {
    log.info(
      `启动 ${this.agents.length} 个 Agent | 房间 ${this.runtime.roomId} | 服务端 ${this.runtime.serverUrl} | run=${this.runtime.runId} | condition=${this.runtime.condition} | seed=${this.runtime.seed}`
    );
    log.info(
      `Harness: prompt=${this.runtime.promptVersion} | chat=${this.runtime.chatEnabled} | memory=${this.runtime.memoryEnabled} | prediction=${this.runtime.predictionEnabled} | tokenBudget=${this.runtime.tokenBudget}/agent/game | retries=${this.runtime.maxRetries}`
    );
    for (const a of this.runtime.agents) {
      log.info(`  #${a.index} ${a.name} | ${a.provider} | ${a.model}`);
    }
    if (!this.runtime.adminToken) {
      log.error("未设置 ADMIN_TOKEN：实验版需要管理员连接来自动开局与主持拍卖。");
      this.fail(0, "ADMIN_TOKEN 未设置");
      return;
    }
    this.connectAdmin();
    this.joinDeadlineAt = Date.now() + this.runtime.joinTimeoutMs;
    this.pollTimer = setInterval(() => void this.poll(), 1000);
  }

  private connectAdmin(): void {
    this.admin = io(this.runtime.serverUrl, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 1500,
      path: "/socket.io/",
    });

    this.admin.on("connect", () => {
      log.info("管理员连接已建立，正在鉴权…");
      this.adminReady = false;
      this.admin?.emit("adminAuthenticate", { token: this.runtime.adminToken });
    });
    this.admin.on("adminAuthOk", () => {
      log.info("管理员鉴权成功");
      this.adminReady = true;
      this.admin?.emit("adminSpectate", { targetRoomId: this.runtime.roomId });
    });
    this.admin.on("adminAuthFailed", (payload: { message?: string }) => {
      log.error(`管理员鉴权失败：${payload?.message ?? "密钥无效"}`);
      this.adminReady = false;
      this.fail(0, "管理员鉴权失败");
    });
    this.admin.on("gameUpdate", (game: GameSnapshot) => {
      this.adminGame = game;
      this.onAdminGame(game);
    });
    this.admin.on("error", (message: unknown) => {
      log.warn(`管理员操作失败：${String(message)}`);
    });
    this.admin.on("disconnect", () => {
      this.adminReady = false;
    });
  }

  private async poll(): Promise<void> {
    if (this.stopping) return;

    if (this.adminReady && !this.adminGame) {
      this.admin?.emit("adminSpectate", { targetRoomId: this.runtime.roomId });
    }

    if (this.adminGame) this.onAdminGame(this.adminGame);

    const allJoined = this.agents.every((a) => a.isJoined);
    if (!allJoined) {
      if (this.joinDeadlineAt > 0 && Date.now() > this.joinDeadlineAt) {
        const missing = this.agents.filter((a) => !a.isJoined).map((a) => `#${a.index}`);
        this.fail(0, `等待 Agent 就座超时（未入座：${missing.join(", ") || "未知"}）`);
      }
      return;
    }
    // 首次全员就座后解除启动超时；中途掉线由连接恢复/失败策略处理，不在这里误杀
    this.joinDeadlineAt = 0;

    if (!this.adminReady) {
      this.agents.forEach((a) => a.requestState());
      return;
    }

    if (!this.runtime.autoStart || this.started) return;
    if (!this.adminGame) return;
    if (this.adminGame.phase !== "ROOM_WAITING") {
      this.started = true;
      return;
    }

    log.info("6 名 Agent 已就座，自动开局…");
    this.started = true;
    await sleep(800);
    this.admin?.emit("adminStartGame", { roomId: this.runtime.roomId });
  }

  // ---------- 拍卖自动控场 ----------

  private onAdminGame(game: GameSnapshot): void {
    if (!this.experimentLogged && game.experiment) {
      this.experimentLogged = true;
      log.info(
        `服务端实验元数据：seed=${game.seed} condition=${game.experiment.condition ?? "ad-hoc"} run=${game.experiment.runId ?? "-"}`
      );
    }

    if (game.phase !== "AUCTION") {
      this.resetAuctionState();
      if (game.phase === "GAME_OVER") {
        this.onGameOver(game);
      }
      return;
    }

    if (!this.runtime.autoAuction) return;
    const now = Date.now();

    const pool = game.auctionPoolCardIds ?? [];
    if (pool.length === 0) {
      log.error("服务端未下发 auctionPoolCardIds，无法自动主持拍卖");
      this.fail(0, "缺少拍卖池配置");
      return;
    }
    const distributed = new Set(game.auctionDistributedCardIds ?? []);
    const available = pool.filter((id) => !distributed.has(id) && !this.passedCards.has(id));

    const focus = game.auctionFocusCardId ?? null;

    if (!focus) {
      if (available.length === 0 || this.auctionEnded) {
        this.endAuction();
        return;
      }
      if (this.auctionActionPending) return;
      this.setFocus(available[0]);
      return;
    }

    if (this.passedCards.has(focus)) {
      this.endAuction();
      return;
    }

    if (focus !== this.currentLot) {
      this.currentLot = focus;
      this.focusStartedAt = now;
      this.lastBidAt = now;
      this.lastBidSignature = "";
    }

    const signature = `${focus}:${game.auctionCurrentBid ?? 0}:${game.auctionHighBidId ?? "none"}`;
    if (signature !== this.lastBidSignature) {
      this.lastBidSignature = signature;
      this.lastBidAt = now;
    }

    if (this.auctionActionPending) return;

    const hasBid = (game.auctionCurrentBid ?? 0) > 0 && !!game.auctionHighBidId;
    if (!hasBid) {
      if (now - this.focusStartedAt >= this.runtime.auctionPassWindowMs) {
        this.passLot(focus);
      }
      return;
    }

    if (now - this.lastBidAt >= this.runtime.auctionHammerWindowMs) {
      this.hammerLot(game);
    }
  }

  private onGameOver(game: GameSnapshot): void {
    const sessionId = game.sessionId ?? `room:${game.roomId}`;
    if (this.completedSessionIds.has(sessionId)) return;
    this.completedSessionIds.add(sessionId);
    log.info(`完成第 ${this.completedSessionIds.size} 局（session=${sessionId}）`);

    if (this.runtime.gameLimit > 0 && this.completedSessionIds.size >= this.runtime.gameLimit) {
      log.info(`已达到 AGENT_GAME_LIMIT=${this.runtime.gameLimit}，实验结束`);
      this.stopping = true;
      if (this.pollTimer) clearInterval(this.pollTimer);
      this.hooks.onComplete?.(this.completedSessionIds.size);
      return;
    }

    if (this.runtime.autoRestart && !this.restartScheduled) {
      this.scheduleRestart();
    }
  }

  private setFocus(cardId: string): void {
    log.info(`拍卖：开始拍 ${cardId}`);
    this.auctionActionPending = true;
    this.admin?.emit("adminSetAuctionFocus", { roomId: this.runtime.roomId, cardId });
    setTimeout(() => {
      this.auctionActionPending = false;
    }, 1200);
  }

  private passLot(cardId: string): void {
    log.info(`拍卖：无人出价，跳过 ${cardId}`);
    this.passedCards.add(cardId);
    this.auctionActionPending = true;
    this.admin?.emit("adminPassAuction", { roomId: this.runtime.roomId });
    setTimeout(() => {
      this.auctionActionPending = false;
    }, 1200);
  }

  private hammerLot(game: GameSnapshot): void {
    log.info(
      `拍卖：落槌 ${game.auctionFocusCardId} → ${game.auctionHighBidderName ?? "?"} @ ${game.auctionCurrentBid}`
    );
    this.auctionActionPending = true;
    this.admin?.emit("adminHammerAuction", {
      roomId: this.runtime.roomId,
      expectedBidId: game.auctionHighBidId ?? undefined,
      expectedAmount: game.auctionCurrentBid ?? undefined,
      expectedPlayerId: game.auctionHighBidderId ?? undefined,
    });
    setTimeout(() => {
      this.auctionActionPending = false;
    }, 1200);
  }

  private endAuction(): void {
    if (this.auctionEnded) return;
    this.auctionEnded = true;
    this.auctionActionPending = true;
    log.info("拍卖：所有卡牌已处理，结束拍卖");
    this.admin?.emit("adminEndAuction", { roomId: this.runtime.roomId });
    setTimeout(() => {
      this.auctionActionPending = false;
    }, 1200);
  }

  private resetAuctionState(): void {
    this.auctionActionPending = false;
    this.passedCards.clear();
    this.currentLot = null;
    this.focusStartedAt = 0;
    this.lastBidAt = 0;
    this.lastBidSignature = "";
    this.auctionEnded = false;
  }

  private scheduleRestart(): void {
    this.restartScheduled = true;
    log.info(`本局结束，${RESTART_DELAY_MS / 1000}s 后自动开新局…`);
    setTimeout(async () => {
      if (this.stopping) return;
      this.started = false;
      this.restartScheduled = false;
      this.adminGame = null;
      this.admin?.emit("adminSkipPhase", {
        roomId: this.runtime.roomId,
        targetPhase: "ROOM_WAITING",
      });
      await sleep(1500);
      if (this.stopping) return;
      this.admin?.emit("adminStartGame", { roomId: this.runtime.roomId });
    }, RESTART_DELAY_MS);
  }

  private fail(agentIndex: number, error: unknown): void {
    if (this.stopping) return;
    this.stopping = true;
    log.error(`实验终止（agent ${agentIndex || "-"}）：${String(error)}`);
    if (this.pollTimer) clearInterval(this.pollTimer);
    for (const a of this.agents) a.close();
    this.admin?.close();
    this.hooks.onFatal?.(agentIndex, error);
  }

  stop(): void {
    if (this.stopping) return;
    this.stopping = true;
    if (this.pollTimer) clearInterval(this.pollTimer);
    for (const a of this.agents) a.close();
    this.admin?.close();
    log.info("已停止");
  }
}
