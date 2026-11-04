import { io, type Socket } from "socket.io-client";
import type { RuntimeConfig } from "./config.js";
import { AgentClient } from "./agentClient.js";
import { createLogger } from "./logger.js";
import type { GameSnapshot } from "./types.js";

const log = createLogger("orchestrator");

/** 与服务端 server/logic/auctionCards.ts 保持一致 */
const AUCTION_CARD_IDS_BY_ROUND: Record<number, string[]> = {
  1: ["buff_insurance", "buff_gold", "buff_slack", "buff_work_rest"],
  2: ["buff_force_buy", "buff_slack", "buff_work_rest", "buff_short"],
  3: ["buff_lighter", "buff_lottery", "buff_slack", "buff_work_rest"],
};

const RESTART_DELAY_MS = 10_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class Orchestrator {
  private readonly runtime: RuntimeConfig;
  private readonly agents: AgentClient[];
  private admin: Socket | null = null;
  private adminReady = false;
  private adminGame: GameSnapshot | null = null;
  private started = false;
  private stopping = false;
  private pollTimer: NodeJS.Timeout | null = null;

  private auctionPhaseKey = "";
  private auctionActionPending = false;
  private passedCards = new Set<string>();
  private currentLot: string | null = null;
  private focusStartedAt = 0;
  private lastBidAt = 0;
  private lastBidSignature = "";
  private auctionEnded = false;

  private restartScheduled = false;

  constructor(runtime: RuntimeConfig) {
    this.runtime = runtime;
    this.agents = runtime.agents.map((cfg) => new AgentClient(cfg, runtime));
  }

  start(): void {
    log.info(`启动 ${this.agents.length} 个 Agent，房间 ${this.runtime.roomId}，服务端 ${this.runtime.serverUrl}`);
    if (!this.runtime.adminToken) {
      log.warn("未设置 ADMIN_TOKEN：自动开局/拍卖控场关闭，请用管理员前端手动开局。");
    } else {
      this.connectAdmin();
    }
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

    // 管理员重连后如果还没进房，重试观战
    if (this.adminReady && !this.adminGame) {
      this.admin?.emit("adminSpectate", { targetRoomId: this.runtime.roomId });
    }

    // 拍卖控场必须由定时器驱动：没人出价时服务端不会主动广播 gameUpdate
    if (this.adminGame) this.onAdminGame(this.adminGame);

    const allJoined = this.agents.every((a) => a.isJoined);
    if (!allJoined) return;

    if (!this.adminReady) {
      if (!this.runtime.autoStart) return;
      // 没有管理员鉴权时，至少让每个 Agent 拉一次完整状态
      this.agents.forEach((a) => a.requestState());
      return;
    }

    if (!this.runtime.autoStart || this.started) return;
    if (!this.adminGame) return;
    if (this.adminGame.phase !== "ROOM_WAITING") {
      this.started = true;
      return;
    }

    log.info(`6 名 Agent 已就座，自动开局…`);
    this.started = true;
    await sleep(1200);
    this.admin?.emit("adminStartGame", { roomId: this.runtime.roomId });
  }

  // ---------- 拍卖自动控场 ----------

  private onAdminGame(game: GameSnapshot): void {
    if (game.phase !== "AUCTION") {
      this.resetAuctionState();
      if (game.phase === "GAME_OVER" && this.runtime.autoRestart && !this.restartScheduled) {
        this.scheduleRestart();
      }
      return;
    }

    if (!this.runtime.autoAuction) return;
    const now = Date.now();

    const round = Math.min(3, Math.max(1, game.currentEra - 1));
    const pool = AUCTION_CARD_IDS_BY_ROUND[round] ?? AUCTION_CARD_IDS_BY_ROUND[1];
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
    this.auctionPhaseKey = "";
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
      this.started = false;
      this.restartScheduled = false;
      this.adminGame = null;
      this.admin?.emit("adminSkipPhase", {
        roomId: this.runtime.roomId,
        targetPhase: "ROOM_WAITING",
      });
      await sleep(2000);
      this.admin?.emit("adminStartGame", { roomId: this.runtime.roomId });
    }, RESTART_DELAY_MS);
  }

  stop(): void {
    this.stopping = true;
    if (this.pollTimer) clearInterval(this.pollTimer);
    for (const a of this.agents) a.close();
    this.admin?.close();
    log.info("已停止");
  }
}
