import { randomBytes, timingSafeEqual } from "node:crypto";
import { Server, Socket } from "socket.io";
import {
  createInitialGame,
  Player,
  resetGameSession,
  needsSessionReset,
  finishTutorialExit,
  getCommunityNamer,
  GameState,
  Phase,
} from "../state/gameState.js";
import {
  togglePlayerReady,
  forceSubmitPendingInvestments,
  adminUnlockPlayer,
  unlockSubmittedInvestment,
  resetAllReady,
} from "../state/gameActions.js";
import { tryAdvancePhase } from "../state/phaseController.js";
import {
  clearActionDeadline,
  formatActionDeadlineClock,
  startInvestmentDeadline,
  pauseInvestmentDeadline,
  resumeInvestmentDeadline,
  getInvestmentRemainingMs,
  isInvestmentBuffLockoutActive,
} from "../state/actionDeadline.js";
import { applyInvestments, sanitizeInvestments } from "../logic/investmentLogic.js"; 
import {
  COFFEE_ENERGY_GAIN,
  COFFEE_WEALTH_COST,
  purchaseCoffee,
  refundCoffee,
} from "../logic/coffeeLogic.js";
import { broadcastUpdate, emitSerializedGameUpdate } from "./broadcast.js";
import { STARTING_WEALTH } from "../config/startingWealth.js";
import { TUTORIAL_MAX_STEP } from "../config/tutorial.js";
import { rooms, customImagesVersions, customEraImagesVersions, customBuffImagesVersions, customPersonaImagesVersions } from "../state/store.js";
import {
  broadcastLeaderboardToAllRooms,
  sanitizeCommunityName,
} from "../state/communityLeaderboard.js";
import { archiveCompletedSession } from "../state/sessionArchive.js"; 
import { ensureProjectsDrawnForEra } from "../state/gameEra.js";
import { applyRoundEnergy, syncEnergyAfterRosterChange } from "../logic/energySchedule.js";
import { useBuffCard, useForceBuyCard, ackSlackHit, FORCE_BUY_CARD_ID } from "../logic/buffLogic.js";
import { ackLighterBurnNotice } from "../logic/roundBuffResolve.js";
import { analyzeGamePersona } from "../logic/analysisLogic.js";
import { verifyAdminToken } from "../config/adminAuth.js";
import {
  CLIENT_UPDATE_MESSAGE,
  isClientBuildStale,
} from "../config/clientBuild.js";
import {
  beginAuctionSession,
  buildAuctionLotPublicView,
  clearAuctionOffers,
  formatAuctionSoldMessage,
  hammerAuctionLot,
  passAuctionLot,
  placeAuctionBid,
  playerAvailableWealth,
  formatPlayerHoldSuffix,
  revokeAuctionGrant,
  setAuctionFocusCard,
  voidAllOpenAuctionBids,
} from "../logic/auctionCards.js";
import {
  applyLotteryAccept,
  claimLotteryResponse,
  findPendingLotteryOffer,
  proposeLotterySettle,
  revokeLotteryGrant,
} from "../logic/lotterySettle.js";
import {
  claimWealthAdjustResponse,
  proposeWealthAdjust,
  revokeWealthAdjustOffer,
} from "../logic/wealthAdjust.js";
import { adminAdjustPlayerCard } from "../logic/adminPlayerCard.js";
import {
  findDeviceClaimByPlayer,
  removeDeviceClaimByPlayer,
  removeDeviceClaimBySocket,
  takeDeviceClaimForPlayer,
  upsertDeviceClaim,
} from "../logic/deviceClaim.js";
import { pruneSettledTransactions, pendingCountFrom, MAX_PENDING_PER_SENDER } from "../util/pruneTransactions.js";
import {
  clampHistoryPageLimit,
  fetchTransactionHistoryPage,
  visibleTransactionsForViewer,
} from "../util/transactionHistory.js";
import { isValidHumanPerspectiveTarget } from "./adminPerspective.js";
import {
  commitAdminProjectAdjust,
  previewAdminProjectAdjust,
  undoAdminProjectAdjust,
  notifyMessageForAdjust,
  type ProjectAdjustAction,
} from "../logic/adminProjectAdjust.js";
import { resolvePendingTransfer } from "../logic/transferResolve.js";
import { sanitizeTransactionNote, normalizeNoteInput, truncateNotePreview } from "../logic/forbiddenText.js";
import {
  addChatGroupMembers,
  createCustomChatGroup,
  leaveChatGroup,
  sendGroupChatMessage,
  syncChatGroupsOnRosterChange,
} from "../logic/chatGroups.js";
import { GROUP_CHAT_DISABLED_MESSAGE, GROUP_CHAT_ENABLED } from "../config/playerChatFeatures.js";
import { allow } from "../util/rateLimit.js";
import { canCreateRoom } from "../logic/roomCreatePolicy.js";
import {
  appendSessionEvent,
  ensureSessionStarted,
  recordPhaseChange,
} from "../state/sessionTelemetry.js";

function presencePayload(game: GameState, action: string, playerId: string) {
  return {
    action,
    playerId,
    phase: game.phase,
    globalRound: game.globalRound,
    currentEra: game.currentEra,
    roundInEra: game.roundInEra,
  };
}
function buildAdminRoomList() {
  return Object.keys(rooms).map((rid) => ({
    roomId: rid,
    playerCount: rooms[rid].players.length,
    phase: rooms[rid].phase,
  }));
}

/** 向所有已登录管理员广播房间列表；若传入 socket 则同时给该连接发一份 */
function broadcastRoomList(io: Server, socket?: Socket) {
  const roomList = buildAdminRoomList();
  io.to("super_admin_room").emit("adminRoomList", roomList);
  if (socket) socket.emit("adminRoomList", roomList);
}

const MAX_ROOM_ID_LENGTH = 48;
const MAX_PLAYER_NAME_LENGTH = 24;
const MAX_ROOMS = 50;

const JUMPABLE_PHASES: ReadonlySet<string> = new Set([
  "ROOM_WAITING",
  "ERA_INTRO",
  "TUTORIAL",
  "AUCTION",
  "BUFF_USAGE",
  "INVESTMENT",
  "SETTLEMENT",
  "COMMUNITY_NAMING",
  "GAME_OVER",
]);

/** 离开所有游戏房间频道，保留 super_admin_room */
function leaveAllGameRooms(socket: Socket) {
  for (const room of socket.rooms) {
    if (room !== socket.id && room !== "super_admin_room") {
      socket.leave(room);
    }
  }
  delete socket.data.gameRoomId;
}

/** 主持认领座位后离房时，把该玩家标为离线并放开昵称 */
function detachClaimedPlayer(socket: Socket): GameState | null {
  for (const game of Object.values(rooms)) {
    const player = game.players.find((p) => p.socketId === socket.id);
    if (!player) continue;
    player.connected = false;
    player.ready = false;
    game.readyPlayers.delete(player.id);
    player.socketId = undefined;
    syncEnergyAfterRosterChange(game);
    return game;
  }
  return null;
}

function clientIp(socket: Socket): string {
  const fwd = socket.handshake.headers["x-forwarded-for"];
  const first = Array.isArray(fwd) ? fwd[0] : fwd?.split(",")[0];
  return (first ?? socket.handshake.address ?? "unknown").trim();
}

function issueReconnectToken(): string {
  return randomBytes(24).toString("base64url");
}

function reconnectTokenMatches(expected: string, provided: unknown): boolean {
  if (typeof provided !== "string" || !provided) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  return a.length === b.length && timingSafeEqual(a, b);
}

function clearPendingDeviceClaimOnSocket(
  io: Server,
  socket: Socket,
  game: GameState | undefined
): boolean {
  const pending = socket.data.pendingDeviceClaim as
    | { roomId: string; playerId: string }
    | undefined;
  delete socket.data.pendingDeviceClaim;
  if (!pending) return false;
  const g = game ?? rooms[pending.roomId];
  if (!g) return false;
  return removeDeviceClaimBySocket(g, socket.id);
}

function emitPlayerJoinSideEffects(socket: Socket, game: GameState, player: Player) {
  socket.emit("playerJoined", { playerId: player.id, reconnectToken: player.reconnectToken });
  const pendingLottery = findPendingLotteryOffer(game, player.id);
  if (pendingLottery) {
    socket.emit("lotterySettleRequest", {
      offerId: pendingLottery.offerId,
      amount: pendingLottery.amount,
    });
  }
}

function bindPlayerSocket(
  io: Server,
  game: GameState,
  player: Player,
  socket: Socket,
  options?: { rejoining?: boolean }
) {
  const rejoining = options?.rejoining ?? !player.connected;
  if (!player.reconnectToken) player.reconnectToken = issueReconnectToken();
  player.socketId = socket.id;
  player.connected = true;
  if (game.phase === "ROOM_WAITING") {
    player.ready = false;
    game.readyPlayers.delete(player.id);
  }
  if (rejoining) syncEnergyAfterRosterChange(game, player);
}

function detachKickedPlayerSocket(io: Server, roomId: string, socketId: string | undefined) {
  if (!socketId) return;
  const kickedSocket = io.sockets.sockets.get(socketId);
  if (!kickedSocket) return;
  kickedSocket.leave(roomId);
  delete kickedSocket.data.gameRoomId;
  kickedSocket.emit("playerKicked", { message: "你已被主持人移出房间" });
}

function finalizeCommunityName(io: Server, game: GameState, communityName: string, source: string): void {
  const prevPhase = game.phase;
  game.communityName = communityName;
  game.phase = "GAME_OVER";
  analyzeGamePersona(game);
  appendSessionEvent(game, "community_named", { communityName, source });
  recordPhaseChange(game, prevPhase, game.phase, source);
  archiveCompletedSession(game);
  broadcastUpdate(io, game);
  broadcastLeaderboardToAllRooms(io);
}

function markClientBuildFromHandshake(socket: Socket): void {
  if (isClientBuildStale(socket.handshake.auth?.clientBuildId)) {
    socket.data.clientBuildStale = true;
    socket.emit("clientUpdateRequired", { message: CLIENT_UPDATE_MESSAGE });
  }
}

function rejectStaleClient(socket: Socket): boolean {
  if (!socket.data.clientBuildStale) return false;
  socket.emit("error", CLIENT_UPDATE_MESSAGE);
  return true;
}

export function registerSocketHandlers(io: Server, socket: Socket) {
  console.log(`🔌 Socket connected: ${socket.id}`);
  markClientBuildFromHandshake(socket);

  // 发送自定义图片版本号
  socket.emit("syncProjectImages", customImagesVersions);
  socket.emit("syncEraImages", customEraImagesVersions);
  socket.emit("syncBuffImages", customBuffImagesVersions);
  socket.emit("syncPersonaImages", customPersonaImagesVersions);


  // 1. 加入房间
  socket.on("joinGame", ({ roomId, name, reconnectToken }: { roomId: string, name: string, reconnectToken?: string }) => {
    if (rejectStaleClient(socket)) return;
    if (!allow(`join:${socket.id}`, 10, 60_000)) {
      socket.emit("error", "加入过于频繁，请稍后再试");
      return;
    }
    roomId = String(roomId).trim().slice(0, MAX_ROOM_ID_LENGTH);
    const playerName = String(name).trim().slice(0, MAX_PLAYER_NAME_LENGTH);
    if (!roomId || !playerName) return;

    const existingGame = rooms[roomId];
    let player = existingGame?.players.find(p => p.name === playerName);

    if (!player && existingGame && existingGame.players.length >= 6) {
      socket.emit("error", "房间已满 (Max 6)");
      return;
    }

    let replacedSocketId: string | undefined;
    if (player) {
      if (player.isAI) {
        socket.emit("error", "该昵称已被占用，请更换昵称");
        return;
      }
      if (player.reconnectToken) {
        if (!reconnectTokenMatches(player.reconnectToken, reconnectToken)) {
          if (!existingGame) {
            socket.emit("error", "房间不存在或已解散");
            return;
          }
          const replaced = upsertDeviceClaim(existingGame, player.id, socket.id);
          if (replaced && replaced.socketId !== socket.id) {
            const superseded = io.sockets.sockets.get(replaced.socketId);
            if (superseded) {
              clearPendingDeviceClaimOnSocket(io, superseded, existingGame);
              superseded.emit("deviceClaimSuperseded", {
                message: "已有更新的认领请求，请重新加入",
              });
            }
          }
          socket.data.pendingDeviceClaim = { roomId, playerId: player.id };
          socket.emit("deviceClaimPending", {
            roomId,
            playerId: player.id,
            playerName: player.name,
          });
          appendSessionEvent(
            existingGame,
            "presence",
            presencePayload(existingGame, "device_claim_pending", player.id),
            player.id
          );
          broadcastUpdate(io, existingGame);
          return;
        }
        if (player.connected && player.socketId && player.socketId !== socket.id) {
          replacedSocketId = player.socketId;
        }
      } else if (player.connected && player.socketId && player.socketId !== socket.id) {
        socket.emit("error", "该昵称已在房间中在线，请更换昵称或等待对方离线");
        return;
      }
    }

    if (!rooms[roomId]) {
      if (Object.keys(rooms).length >= MAX_ROOMS) {
        socket.emit("error", "服务器房间已满，请稍后再试");
        return;
      }
      const ip = clientIp(socket);
      const gate = canCreateRoom(rooms, ip);
      if (!gate.ok) {
        socket.emit("error", gate.message);
        return;
      }
      rooms[roomId] = createInitialGame(roomId, []);
      rooms[roomId].createdByIp = ip;
    }
    const game = rooms[roomId];

    if (replacedSocketId) {
      const oldSocket = io.sockets.sockets.get(replacedSocketId);
      if (oldSocket) {
        oldSocket.leave(roomId);
        delete oldSocket.data.gameRoomId;
        oldSocket.emit("sessionReplaced", { message: "你的身份已在其他页面登录" });
      }
    }

    leaveAllGameRooms(socket);
    socket.join(roomId);
    socket.data.gameRoomId = roomId;

    if (player) {
      const rejoining = !player.connected;
      bindPlayerSocket(io, game, player, socket, { rejoining });
      appendSessionEvent(
        game,
        "presence",
        presencePayload(game, rejoining ? "rejoin" : "reconnect", player.id),
        player.id
      );
    } else {
      const newPlayer: Player = {
        id: socket.id,
        name: playerName,
        socketId: socket.id,
        reconnectToken: issueReconnectToken(),
        connected: true,
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
        slackedBy: [], // ✅ 初始化新增字段
        coffeePurchasesThisRound: 0,
        totalEnergyConsumed: 15,
        wealthHistory: [STARTING_WEALTH], 
        investedRiskEnergy: 0,
        investedLongEnergy: 0,
        investedShortEnergy: 0,
        socialRank: null
      };
      game.players.push(newPlayer);
      syncEnergyAfterRosterChange(game, newPlayer);
      player = newPlayer;
      game.logs.push(`👤 玩家 ${player.name} 加入游戏`);
      appendSessionEvent(
        game,
        "presence",
        presencePayload(game, "join", player.id),
        player.id
      );
    }

    syncChatGroupsOnRosterChange(game);
    emitPlayerJoinSideEffects(socket, game, player);
    broadcastUpdate(io, game);
    broadcastRoomList(io);
  });

  socket.on("leaveGame", () => {
    const roomId = getRoomId(socket);
    if (!roomId || !rooms[roomId]) {
      leaveAllGameRooms(socket);
      return;
    }
    const game = rooms[roomId];
    const player = game.players.find((p) => p.socketId === socket.id);
    if (player) {
      player.connected = false;
      player.ready = false;
      game.readyPlayers.delete(player.id);
      syncEnergyAfterRosterChange(game);
      appendSessionEvent(
        game,
        "presence",
        presencePayload(game, "leave", player.id),
        player.id
      );
      syncChatGroupsOnRosterChange(game);
    }
    leaveAllGameRooms(socket);
    broadcastUpdate(io, game);
    broadcastRoomList(io);
  });

  /** 已入房但未收到状态时拉取全量（与 joinGame 后 gameUpdate 一致） */
  socket.on("requestGameState", () => {
    const roomId = getRoomId(socket);
    if (!roomId || !rooms[roomId]) return;
    const game = rooms[roomId];
    emitSerializedGameUpdate(socket, game);
  });

  // === Admin ===
  socket.on("adminAuthenticate", ({ token }: { token?: string }) => {
    console.log("[admin] authenticate request socket=%s", socket.id);
    if (rejectStaleClient(socket)) return;
    if (!allow(`admin-auth:${socket.id}`, 5, 60_000)) {
      socket.emit("adminAuthFailed", { message: "尝试过于频繁，请稍后再试" });
      return;
    }
    if (!verifyAdminToken(token)) {
      console.log("[admin] authenticate rejected (invalid token)");
      socket.data.isSuperAdmin = false;
      socket.leave("super_admin_room");
      setTimeout(() => {
        socket.emit("adminAuthFailed", { message: "密钥无效" });
      }, 400);
      return;
    }
    console.log("[admin] authenticate ok socket=%s", socket.id);
    socket.data.isSuperAdmin = true;
    socket.join("super_admin_room");
    socket.emit("adminAuthOk");
    broadcastRoomList(io, socket);
  });

  socket.on("adminSpectate", ({ targetRoomId }) => {
    if (!socket.data.isSuperAdmin) return;
    const rid = String(targetRoomId ?? "").trim().slice(0, MAX_ROOM_ID_LENGTH);
    const game = rooms[rid];
    if (!game) {
      socket.emit("error", "房间不存在或已解散");
      return;
    }
    const detached = detachClaimedPlayer(socket);
    leaveAllGameRooms(socket);
    if (detached) broadcastUpdate(io, detached);
    socket.join(rid);
    socket.data.gameRoomId = rid;
    emitSerializedGameUpdate(socket, game);
  });

  socket.on("adminLeaveRoom", ({ roomId }) => {
    if (!socket.data.isSuperAdmin) return;
    const detached = detachClaimedPlayer(socket);
    socket.leave(roomId);
    delete socket.data.gameRoomId;
    if (detached) broadcastUpdate(io, detached);
    broadcastRoomList(io, socket);
  });

  socket.on("adminStartTutorial", ({ roomId }) => {
      if (!socket.data.isSuperAdmin) return;
      const game = rooms[roomId];
      if (game && (game.phase === "ERA_INTRO" || game.phase === "ROOM_WAITING")) {
          game.tutorialEntryPhase = game.phase;
          game.phase = "TUTORIAL";
          game.tutorialStep = 0;
          game.logs.push("🎓 上帝开启了新手教程");
          broadcastUpdate(io, game);
      }
  });

  socket.on("adminTutorialNext", ({ roomId }) => {
      if (!socket.data.isSuperAdmin) return;
      const game = rooms[roomId];
      if (game && game.phase === "TUTORIAL") {
          const next = Math.min((game.tutorialStep || 0) + 1, TUTORIAL_MAX_STEP);
          if (next === game.tutorialStep) return;
          game.tutorialStep = next;
          game.logs.push(`🎓 教程进度：第 ${next + 1} 页`);
          broadcastUpdate(io, game);
      }
  });

  socket.on("adminTutorialPrev", ({ roomId }) => {
      if (!socket.data.isSuperAdmin) return;
      const game = rooms[roomId];
      if (game && game.phase === "TUTORIAL") {
          const prev = Math.max(0, (game.tutorialStep || 0) - 1);
          if (prev === game.tutorialStep) return;
          game.tutorialStep = prev;
          game.logs.push(`🎓 教程进度：第 ${prev + 1} 页`);
          broadcastUpdate(io, game);
      }
  });

  socket.on("adminEndTutorial", ({ roomId }) => {
      if (!socket.data.isSuperAdmin) return;
      const game = rooms[roomId];
      if (game && game.phase === "TUTORIAL") {
          finishTutorialExit(game);
          game.logs.push("🎓 上帝结束了新手教程");
          broadcastUpdate(io, game);
      }
  });

  socket.on("adminStartGame", ({ roomId }) => {
    if (!socket.data.isSuperAdmin) return;
    const game = rooms[roomId];
    if (!game) return;

    if (game.phase === "ROOM_WAITING") {
      if (needsSessionReset(game)) {
        resetGameSession(game);
      }
      const online = game.players.filter((p) => p.connected);
      if (online.length === 0) {
        socket.emit("error", "暂无在线玩家，无法开局");
        return;
      }
      resetAllReady(game);
      const prevPhase = game.phase;
      ensureSessionStarted(game);
      applyRoundEnergy(game, { relock: true });
      game.phase = "ERA_INTRO";
      game.logs.push("👑 主持开局，进入第 1 时代");
      recordPhaseChange(game, prevPhase, game.phase, "adminStartGame");
      broadcastUpdate(io, game);
      return;
    }

    if (game.phase === "ERA_INTRO" || game.phase === "TUTORIAL") {
      if (game.phase === "TUTORIAL") {
        finishTutorialExit(game);
      }
      if (needsSessionReset(game)) {
        resetGameSession(game);
      }

      const prevPhase = game.phase;
      ensureSessionStarted(game);
      if (game.energyTableSize == null) {
        applyRoundEnergy(game, { relock: true });
      }

      if (game.currentEra === 1 && game.roundInEra === 1) {
        game.activeProjects = [];
        game.uncompletedProjects = [];
        game.completedProjects = [];
        game.drawnProjects = new Set();
        game.projectDrawEra = undefined;
        game.totalRiskEnergyAvailable = 0;
      }
      ensureProjectsDrawnForEra(game);
      game.phase = "INVESTMENT";
      startInvestmentDeadline(game);

      game.logs.push("👑 游戏开始！进入投资阶段");
      recordPhaseChange(game, prevPhase, game.phase, "adminStartGame");
      broadcastUpdate(io, game);
    }
  });

  socket.on("adminKickPlayer", ({ roomId, targetPlayerId }) => {
    if (!socket.data.isSuperAdmin) return;
    const game = rooms[roomId];
    if (!game) return;
    const playerIndex = game.players.findIndex(p => p.id === targetPlayerId);
    if (playerIndex !== -1) {
      const [removed] = game.players.splice(playerIndex, 1);
      appendSessionEvent(
        game,
        "presence",
        presencePayload(game, "kick", removed.id),
        removed.id
      );
      detachKickedPlayerSocket(io, roomId, removed.socketId);
      syncEnergyAfterRosterChange(game);
      syncChatGroupsOnRosterChange(game);
      broadcastUpdate(io, game);
      broadcastRoomList(io);
    }
  });

  socket.on("cancelDeviceClaim", () => {
    const pending = socket.data.pendingDeviceClaim as { roomId: string } | undefined;
    if (!pending) return;
    const game = rooms[pending.roomId];
    if (game && removeDeviceClaimBySocket(game, socket.id)) {
      broadcastUpdate(io, game);
    }
    delete socket.data.pendingDeviceClaim;
    socket.emit("deviceClaimCancelled");
  });

  socket.on("adminReleasePlayerClaim", ({ roomId, targetPlayerId }) => {
    if (!socket.data.isSuperAdmin) return;
    const game = rooms[roomId];
    if (!game) return;
    const player = game.players.find((p) => p.id === targetPlayerId);
    if (!player || player.isAI) {
      socket.emit("error", "找不到该玩家");
      return;
    }
    const claim = findDeviceClaimByPlayer(game, targetPlayerId);
    if (!claim) {
      socket.emit("error", "没有待认领的新设备");
      return;
    }
    const waitSocket = io.sockets.sockets.get(claim.socketId);
    if (!waitSocket) {
      removeDeviceClaimByPlayer(game, targetPlayerId);
      broadcastUpdate(io, game);
      socket.emit("error", "待认领连接已断开，请让玩家重新加入");
      return;
    }

    if (player.socketId && player.socketId !== claim.socketId) {
      const oldSocket = io.sockets.sockets.get(player.socketId);
      if (oldSocket) {
        oldSocket.leave(roomId);
        delete oldSocket.data.gameRoomId;
        oldSocket.emit("sessionReplaced", { message: "你的身份已在其他设备登录" });
      }
    }

    const rejoining = !player.connected;
    leaveAllGameRooms(waitSocket);
    waitSocket.join(roomId);
    waitSocket.data.gameRoomId = roomId;
    delete waitSocket.data.pendingDeviceClaim;
    player.reconnectToken = issueReconnectToken();
    bindPlayerSocket(io, game, player, waitSocket, { rejoining });
    takeDeviceClaimForPlayer(game, targetPlayerId, claim.socketId);

    appendSessionEvent(
      game,
      "presence",
      presencePayload(game, "rejoin", player.id),
      player.id
    );
    game.logs.push(`🔑 主持已允许 ${player.name} 用新设备进入`);
    emitPlayerJoinSideEffects(waitSocket, game, player);
    broadcastUpdate(io, game);
    broadcastRoomList(io);
  });

  socket.on("adminUnlockPlayer", ({ roomId, targetPlayerId }) => {
    if (!socket.data.isSuperAdmin) return;
    const game = rooms[roomId];
    if (!game) return;

    const result = adminUnlockPlayer(game, targetPlayerId);
    if (!result.ok) {
      const messages: Record<typeof result.reason, string> = {
        not_found: "解锁失败：找不到该玩家",
        not_ready: "解锁失败：该玩家未处于已锁定状态",
        wrong_phase: "倒计时已结束或已进入结算，无法解锁",
        timer_closed: "倒计时已结束或已进入结算，无法解锁",
        ai_player: "无法解锁 AI 玩家",
      };
      socket.emit("error", messages[result.reason]);
      return;
    }

    const unlocked = game.players.find((p) => p.id === targetPlayerId);
    if (unlocked?.socketId) {
      io.to(unlocked.socketId).emit("playerNotify", {
        message: "主持人允许你修改已提交的投资方案，精力已退回，请调整后重新提交。",
      });
    }
    broadcastUpdate(io, game);
  });

  function parseProjectAdjustAction(body: {
    kind?: string;
    projectId?: unknown;
    playerId?: string;
    delta?: unknown;
  }): ProjectAdjustAction | null {
    const projectId = Number(body.projectId);
    if (!Number.isFinite(projectId)) return null;
    if (body.kind === "withdraw") return { kind: "withdraw", projectId };
    if (body.kind === "stake") {
      const delta = Number(body.delta);
      const playerId = typeof body.playerId === "string" ? body.playerId.trim() : "";
      if (!playerId || !Number.isSafeInteger(delta) || delta === 0) return null;
      return { kind: "stake", projectId, playerId, delta };
    }
    return null;
  }

  socket.on("adminPreviewProjectAdjust", (body) => {
    if (!socket.data.isSuperAdmin) return;
    const roomId = getRoomId(socket);
    if (!roomId || !rooms[roomId]) return;
    const game = rooms[roomId];
    const action = parseProjectAdjustAction(body ?? {});
    if (!action) {
      socket.emit("error", "无效的调整参数");
      return;
    }
    const preview = previewAdminProjectAdjust(game, action);
    socket.emit("adminProjectAdjustPreview", {
      roomId,
      hostRevision: game.hostRevision ?? 0,
      ...preview,
    });
  });

  socket.on("adminCommitProjectAdjust", (body) => {
    if (!socket.data.isSuperAdmin) return;
    const roomId = getRoomId(socket);
    if (!roomId || !rooms[roomId]) return;
    const game = rooms[roomId];
    const action = parseProjectAdjustAction(body ?? {});
    const expectedRevision = Number(body?.expectedRevision);
    if (!action || !Number.isFinite(expectedRevision)) {
      socket.emit("error", "无效的调整参数");
      return;
    }
    const result = commitAdminProjectAdjust(game, action, expectedRevision);
    if (!result.ok) {
      socket.emit("error", result.message ?? "提交失败");
      return;
    }
    const entry = game.adminProjectAdjustments?.[game.adminProjectAdjustments.length - 1];
    if (entry && result.preview) {
      const msg = notifyMessageForAdjust(game, entry, result.preview);
      if (entry.kind === "stake" && msg) {
        const target = game.players.find((p) => p.id === entry.playerId);
        if (target?.socketId) {
          io.to(target.socketId).emit("playerNotify", { message: msg });
        }
      } else if (entry.kind === "withdraw" && result.preview.refundsEnergy) {
        for (const [pid, refund] of Object.entries(result.preview.refundsEnergy)) {
          if (refund <= 0) continue;
          const target = game.players.find((p) => p.id === pid);
          const proj = result.preview.projectName ?? String(entry.projectId);
          if (target?.socketId) {
            io.to(target.socketId).emit("playerNotify", {
              message: `主持已将「${proj}」撤场，本轮 ${refund} 精力已退回`,
            });
          }
        }
      }
    }
    broadcastUpdate(io, game);
  });

  socket.on("adminUndoProjectAdjust", (body) => {
    if (!socket.data.isSuperAdmin) return;
    const roomId = getRoomId(socket);
    if (!roomId || !rooms[roomId]) return;
    const game = rooms[roomId];
    const expectedRevision = Number(body?.expectedRevision);
    if (!Number.isFinite(expectedRevision)) {
      socket.emit("error", "无效参数");
      return;
    }
    const result = undoAdminProjectAdjust(game, expectedRevision);
    if (!result.ok) {
      socket.emit("error", result.message ?? "撤销失败");
      return;
    }
    broadcastUpdate(io, game);
  });

  socket.on("adminInvestmentTimer", ({ roomId, action }) => {
    if (!socket.data.isSuperAdmin) return;
    const game = rooms[roomId];
    if (!game) return;
    if (game.phase !== "INVESTMENT") {
      socket.emit("error", "仅投资阶段可控制倒计时");
      return;
    }
    if (action === "pause") {
      const result = pauseInvestmentDeadline(game);
      if (!result.ok) {
        socket.emit("error", result.message);
        return;
      }
      game.logs.push("⏸ 主持人暂停了投资倒计时");
      appendSessionEvent(game, "investment_timer", {
        action: "pause",
        remainingMs: getInvestmentRemainingMs(game),
        globalRound: game.globalRound,
        currentEra: game.currentEra,
        roundInEra: game.roundInEra,
      });
    } else if (action === "resume") {
      const result = resumeInvestmentDeadline(game);
      if (!result.ok) {
        socket.emit("error", result.message);
        return;
      }
      game.logs.push("▶️ 主持人继续了投资倒计时");
      appendSessionEvent(game, "investment_timer", {
        action: "resume",
        remainingMs: getInvestmentRemainingMs(game),
        globalRound: game.globalRound,
        currentEra: game.currentEra,
        roundInEra: game.roundInEra,
      });
    } else if (action === "reset") {
      startInvestmentDeadline(game);
      game.logs.push(
        `🔄 主持人重置了投资倒计时（${formatActionDeadlineClock(game)}）`
      );
      appendSessionEvent(game, "investment_timer", {
        action: "reset",
        remainingMs: getInvestmentRemainingMs(game),
        globalRound: game.globalRound,
        currentEra: game.currentEra,
        roundInEra: game.roundInEra,
      });
    } else {
      socket.emit("error", "无效的倒计时操作");
      return;
    }
    broadcastUpdate(io, game);
  });

  socket.on("adminDissolveRoom", ({ roomId }) => {
    if (!socket.data.isSuperAdmin) return;
    if (rooms[roomId]) {
        const memberIds = io.sockets.adapter.rooms.get(roomId);
        if (memberIds) {
          for (const socketId of memberIds) {
            const s = io.sockets.sockets.get(socketId);
            if (s && s.data.gameRoomId === roomId) delete s.data.gameRoomId;
          }
        }
        io.to(roomId).emit("roomDissolved");
        delete rooms[roomId];
        broadcastRoomList(io);
    }
  });

  socket.on("adminSkipPhase", ({ roomId, targetPhase }) => {
    if (!socket.data.isSuperAdmin) return;
    const game = rooms[roomId];
    if (!game) return;

    if (targetPhase) {
        if (typeof targetPhase !== "string" || !JUMPABLE_PHASES.has(targetPhase)) {
          socket.emit("error", `阶段 ${targetPhase} 不可跳转`);
          return;
        }
        const nextPhase = targetPhase as Phase;
        const prevPhase = game.phase;
        if (nextPhase === "ERA_INTRO" && needsSessionReset(game)) {
          resetGameSession(game);
          game.phase = "ERA_INTRO";
          applyRoundEnergy(game, { relock: true });
          resetAllReady(game);
          game.logs.push(`⏭️ 上帝强制跳转至 [${nextPhase}]（已重置局内状态）`);
        } else if (nextPhase === "ROOM_WAITING") {
          resetGameSession(game);
          resetAllReady(game);
          game.logs.push(`⏭️ 上帝强制跳转至 [${nextPhase}]（已重置局内状态）`);
        } else {
          if (nextPhase === "INVESTMENT" || nextPhase === "BUFF_USAGE") {
            // 道具已并入投资阶段；旧「道具使用」跳转一并落到 INVESTMENT
            game.phase = "INVESTMENT";
            ensureProjectsDrawnForEra(game);
            clearActionDeadline(game);
            startInvestmentDeadline(game);
            resetAllReady(game);
            game.logs.push(
              nextPhase === "BUFF_USAGE"
                ? "⏭️ 上帝强制跳转至 [INVESTMENT]（道具已并入投资）"
                : "⏭️ 上帝强制跳转至 [INVESTMENT]"
            );
          } else {
            game.phase = nextPhase;
            if (nextPhase === "AUCTION") beginAuctionSession(game);
            if (nextPhase === "ERA_INTRO" && game.energyTableSize == null) {
              applyRoundEnergy(game, { relock: true });
            }
            game.logs.push(`⏭️ 上帝强制跳转至 [${nextPhase}]`);
          }
        }
        recordPhaseChange(game, prevPhase, game.phase, "adminSkipPhase");
        broadcastUpdate(io, game);
        return;
    }

    if (game.phase === "COMMUNITY_NAMING") {
      const fallback = sanitizeCommunityName(`社区-${game.roomId}`) || "未命名社区";
      finalizeCommunityName(io, game, fallback, "adminSkipPhase");
      return;
    }

    if (game.phase === "BUFF_USAGE") {
      clearActionDeadline(game);
    }
    if (game.phase === "INVESTMENT") {
      clearActionDeadline(game);
      forceSubmitPendingInvestments(game, "admin_force");
    } else {
      game.players.forEach((p) => {
        p.ready = true;
        game.readyPlayers.add(p.id);
      });
    }
    tryAdvancePhase(game);
    broadcastUpdate(io, game);
  });

  socket.on("adminForceSettle", ({ roomId }) => {
    if (!socket.data.isSuperAdmin) return;
    const game = rooms[roomId];
    if (game && game.phase === "INVESTMENT") {
       clearActionDeadline(game);
       forceSubmitPendingInvestments(game, "admin_force");
       tryAdvancePhase(game);
       broadcastUpdate(io, game);
    }
  });

  // 拍卖：改正在拍的卡 / 确认成交 / 跳过 / 玩家出价
  socket.on("adminSetAuctionFocus", ({ roomId, cardId }) => {
    if (!socket.data.isSuperAdmin) return;
    const game = rooms[roomId];
    if (!game || game.phase !== "AUCTION") {
      socket.emit("error", "现在不能改正在拍的卡");
      return;
    }
    const prev = game.auctionFocusCardId;
    const result = setAuctionFocusCard(game, cardId == null || cardId === "" ? null : cardId);
    if (!result.ok) {
      socket.emit("error", result.message);
      return;
    }
    if (game.auctionFocusCardId) {
      game.logs.push(`📌 改成正在拍：[${game.auctionFocusCardId}]`);
    } else {
      game.logs.push(`📌 已取消正在拍的卡`);
    }
    appendSessionEvent(game, "auction_lot_changed", {
      fromCardId: prev ?? null,
      toCardId: game.auctionFocusCardId ?? null,
    });
    broadcastUpdate(io, game);
  });

  socket.on("adminHammerAuction", ({ roomId, expectedBidId, expectedAmount, expectedPlayerId }) => {
    if (!socket.data.isSuperAdmin) return;
    const game = rooms[roomId];
    if (!game) {
      socket.emit("error", "房间不存在");
      return;
    }
    const result = hammerAuctionLot(game, {
      expectedBidId: typeof expectedBidId === "string" ? expectedBidId : undefined,
      expectedAmount: typeof expectedAmount === "number" ? expectedAmount : undefined,
      expectedPlayerId: typeof expectedPlayerId === "string" ? expectedPlayerId : undefined,
    });
    if (!result.ok) {
      socket.emit("error", result.message);
      return;
    }
    appendSessionEvent(game, "auction_lot_sold", {
      cardId: result.cardId,
      playerId: result.playerId,
      cost: result.cost,
      nextFocusId: game.auctionFocusCardId ?? null,
    });
    broadcastUpdate(io, game);
    io.to(game.roomId).emit("playerNotify", {
      type: "auction_sold",
      message: formatAuctionSoldMessage(game, {
        cardId: result.cardId,
        playerId: result.playerId,
        cost: result.cost,
        source: "hammer",
      }),
    });
  });

  socket.on("adminPassAuction", ({ roomId }) => {
    if (!socket.data.isSuperAdmin) return;
    const game = rooms[roomId];
    if (!game) {
      socket.emit("error", "房间不存在");
      return;
    }
    const result = passAuctionLot(game);
    if (!result.ok) {
      socket.emit("error", result.message);
      return;
    }
    appendSessionEvent(game, "auction_lot_passed", {
      cardId: result.cardId,
      nextFocusId: result.nextFocusId ?? null,
    });
    broadcastUpdate(io, game);
  });

  socket.on("adminProposeBuff", () => {
    socket.emit("error", "已改为玩家出价、主持确认成交，请使用「确认成交」");
  });

  socket.on("playerRespondAuction", () => {
    socket.emit("error", "已改为公开加价，无需再确认支付弹窗");
  });

  socket.on("playerPlaceAuctionBid", (payload?: { amount?: unknown }) => {
    const roomId = getRoomId(socket);
    if (!roomId || !rooms[roomId]) {
      socket.emit("error", "不在房间内，无法出价（请刷新后重新进入）");
      return;
    }
    const game = rooms[roomId];
    const player = game.players.find((p) => p.socketId === socket.id);
    if (!player) {
      socket.emit("error", "身份未绑定，无法出价（请刷新后重新进入）");
      return;
    }
    if (!allow(`auctionBid:${player.id}`, 30, 60_000)) {
      socket.emit("error", "出价过于频繁，请稍后再试");
      return;
    }
    const amount = payload?.amount;
    const result = placeAuctionBid(game, player.id, amount);
    if (!result.ok) {
      socket.emit("error", result.message);
      return;
    }
    appendSessionEvent(
      game,
      "auction_bid_placed",
      {
        bidId: result.bid.bidId,
        cardId: result.bid.cardId,
        amount: result.bid.amount,
        availableWealthAtBid: result.bid.availableWealthAtBid,
        bidToAvailableRatio: result.bid.bidToAvailableRatio,
      },
      player.id
    );
    if (result.outbidPlayerId) {
      const target = game.players.find((p) => p.id === result.outbidPlayerId);
      if (target?.socketId) {
        io.to(target.socketId).emit("playerNotify", {
          type: "auction",
          message: `有人出得比你高：现在最高价 ${result.bid.amount}`,
        });
      }
    }
    broadcastUpdate(io, game);
  });

  socket.on("adminRevokeAuctionCard", ({ roomId, cardId }) => {
    if (!socket.data.isSuperAdmin) return;
    const game = rooms[roomId];
    if (!game || game.phase !== "AUCTION") {
      socket.emit("error", "仅拍卖阶段可撤销发放");
      return;
    }
    if (typeof cardId !== "string" || !cardId) {
      socket.emit("error", "道具无效");
      return;
    }
    const result = revokeAuctionGrant(game, cardId);
    if (!result.ok) {
      socket.emit("error", result.message);
      return;
    }
    const target = game.players.find((p) => p.id === result.playerId);
    if (result.kind === "pending") {
      if (target?.socketId) {
        io.to(target.socketId).emit("auctionOfferCancelled", {
          offerId: result.offerId,
          cardId,
        });
      }
      game.logs.push(
        `↩️ 上帝撤回了 [${cardId}] 的待确认报价（${target?.name ?? result.playerId}）`
      );
      appendSessionEvent(game, "auction_offer_cancelled", {
        cardId,
        playerId: result.playerId,
        offerId: result.offerId,
      });
    } else {
      game.logs.push(
        `↩️ 上帝撤销了 [${cardId}] 的成交（${target?.name ?? result.playerId}，退还 ${result.cost} 财富）`
      );
      appendSessionEvent(game, "auction_revoked", {
        cardId,
        playerId: result.playerId,
        costRefunded: result.cost,
      });
    }
    broadcastUpdate(io, game);
  });

  socket.on("adminEndAuction", ({ roomId }) => {
      if (!socket.data.isSuperAdmin) return;
      const game = rooms[roomId];
      if (game && game.phase === "AUCTION") {
          const prevPhase = game.phase;
          clearAuctionOffers(game);
          // 保留 auctionBids / auctionCompletedDeals 供导出；仅作废未落槌出价
          voidAllOpenAuctionBids(game, "void_lot_changed");
          game.auctionFocusCardId = undefined;
          game.phase = "ERA_INTRO";
          recordPhaseChange(game, prevPhase, game.phase, "adminEndAuction");
          io.to(game.roomId).emit("auctionOffersCleared");
          broadcastUpdate(io, game);
      }
  });

  socket.on("adminRateSocial", ({ roomId, targetPlayerId, rank }) => {
      if (!socket.data.isSuperAdmin) return;
      const game = rooms[roomId];
      if (!game) return;
      const player = game.players.find(p => p.id === targetPlayerId);
      if (player) {
          const ratedAt = Date.now();
          player.socialRank = rank;
          game.logs.push(`📝 上帝给 ${player.name} 社交评分: ${rank}`);
          appendSessionEvent(game, "social_rated", {
            targetPlayerId,
            rank,
            ratedAt,
          });
          broadcastUpdate(io, game);
      }
  });

  // 上帝提议彩票开奖（待玩家确认后才入账）
  socket.on("adminSettleLottery", ({ roomId, targetPlayerId, amount }) => {
      if (!socket.data.isSuperAdmin) return;
      const game = rooms[roomId];
      if (!game) return;

      const proposed = proposeLotterySettle(game, targetPlayerId, amount);
      if (!proposed.ok) {
          socket.emit("error", proposed.message);
          return;
      }
      const { offer, replaced, player } = proposed;
      if (replaced && player.socketId) {
        io.to(player.socketId).emit("lotteryOfferCancelled", { offerId: replaced.offerId });
      }
      if (player.socketId) {
        io.to(player.socketId).emit("lotterySettleRequest", {
          offerId: offer.offerId,
          amount: offer.amount,
        });
      }
      game.logs.push(`🎲 上帝向 ${player.name} 发起彩票开奖确认：${offer.amount} 财富`);
      appendSessionEvent(game, "lottery_offered", {
        targetPlayerId,
        amount: offer.amount,
        offerId: offer.offerId,
      });
      broadcastUpdate(io, game);
  });

  socket.on("playerRespondLottery", (data) => {
      const roomId = getRoomId(socket);
      if (!roomId || !rooms[roomId]) return;
      const game = rooms[roomId];
      const player = game.players.find(p => p.socketId === socket.id);
      if (!player) return;

      const accept = data?.accept === true;
      const claimed = claimLotteryResponse(game, player.id, data?.offerId, accept);
      if (!claimed.ok) {
          socket.emit("error", claimed.message);
          return;
      }

      if (accept) {
          const settled = applyLotteryAccept(game, player, claimed.amount);
          game.logs.push(`🎲 彩票开奖！${player.name} 确认领取 ${settled.creditedAmount} 财富`);
          appendSessionEvent(
            game,
            "lottery_settled",
            {
              targetPlayerId: player.id,
              enteredAmount: settled.enteredAmount,
              creditedAmount: settled.creditedAmount,
              goldApplied: settled.goldApplied,
              accepted: true,
            },
            player.id
          );
      } else {
          game.logs.push(`🚫 ${player.name} 拒绝了彩票开奖金额 ${claimed.amount}`);
          appendSessionEvent(
            game,
            "lottery_offer_cancelled",
            { playerId: player.id, amount: claimed.amount, declined: true },
            player.id
          );
      }
      broadcastUpdate(io, game);
  });

  socket.on("adminRevokeLottery", ({ roomId, targetPlayerId }) => {
      if (!socket.data.isSuperAdmin) return;
      const game = rooms[roomId];
      if (!game) return;
      if (typeof targetPlayerId !== "string" || !targetPlayerId) {
          socket.emit("error", "玩家无效");
          return;
      }
      const result = revokeLotteryGrant(game, targetPlayerId);
      if (!result.ok) {
          socket.emit("error", result.message);
          return;
      }
      const target = game.players.find((p) => p.id === result.playerId);
      if (result.kind === "pending") {
          if (target?.socketId) {
              io.to(target.socketId).emit("lotteryOfferCancelled", { offerId: result.offerId });
          }
          game.logs.push(
            `↩️ 上帝撤回了 ${target?.name ?? result.playerId} 的彩票待确认开奖`
          );
          appendSessionEvent(game, "lottery_offer_cancelled", {
            playerId: result.playerId,
            offerId: result.offerId,
          });
      } else {
          game.logs.push(
            `↩️ 上帝撤回了 ${target?.name ?? result.playerId} 的彩票开奖（回滚 ${result.amount} 财富）`
          );
          appendSessionEvent(game, "lottery_revoked", {
            playerId: result.playerId,
            amountReversed: result.amount,
          });
      }
      broadcastUpdate(io, game);
  });

  socket.on("adminAdjustWealth", ({ roomId, targetPlayerId, delta }) => {
    if (!socket.data.isSuperAdmin) return;
    const game = rooms[roomId];
    if (!game) return;
    const proposed = proposeWealthAdjust(game, targetPlayerId, delta);
    if (!proposed.ok) {
      socket.emit("error", proposed.message);
      return;
    }
    const { offer, replaced, player } = proposed;
    if (replaced && player.socketId) {
      io.to(player.socketId).emit("wealthAdjustCancelled", { offerId: replaced.offerId });
    }
    const signed = offer.delta > 0 ? `+${offer.delta}` : String(offer.delta);
    game.logs.push(`💰 上帝向 ${player.name} 发起财富调整确认：${signed}`);
    appendSessionEvent(game, "admin_wealth_offered", {
      targetPlayerId: player.id,
      delta: offer.delta,
      offerId: offer.offerId,
    });
    broadcastUpdate(io, game);
  });

  socket.on("playerRespondWealthAdjust", (data) => {
    const roomId = getRoomId(socket);
    if (!roomId || !rooms[roomId]) return;
    const game = rooms[roomId];
    const player = game.players.find((p) => p.socketId === socket.id);
    if (!player) return;

    const accept = data?.accept === true;
    const claimed = claimWealthAdjustResponse(game, player.id, data?.offerId, accept);
    if (!claimed.ok) {
      socket.emit("error", claimed.message);
      return;
    }
    const signed = claimed.delta > 0 ? `+${claimed.delta}` : String(claimed.delta);
    if (accept) {
      game.logs.push(
        `💰 ${player.name} 确认财富调整 ${signed}（当前 ${claimed.wealthAfter}）`
      );
      appendSessionEvent(
        game,
        "admin_wealth_adjust",
        {
          playerId: player.id,
          delta: claimed.delta,
          wealthAfter: claimed.wealthAfter,
          accepted: true,
        },
        player.id
      );
    } else {
      game.logs.push(`🚫 ${player.name} 拒绝了财富调整 ${signed}`);
      appendSessionEvent(
        game,
        "admin_wealth_offer_cancelled",
        { playerId: player.id, delta: claimed.delta, declined: true },
        player.id
      );
    }
    broadcastUpdate(io, game);
  });

  socket.on("adminRevokeWealthAdjust", ({ roomId, targetPlayerId }) => {
    if (!socket.data.isSuperAdmin) return;
    const game = rooms[roomId];
    if (!game) return;
    const result = revokeWealthAdjustOffer(game, targetPlayerId);
    if (!result.ok) {
      socket.emit("error", result.message);
      return;
    }
    const target = game.players.find((p) => p.id === result.playerId);
    if (target?.socketId) {
      io.to(target.socketId).emit("wealthAdjustCancelled", { offerId: result.offerId });
    }
    game.logs.push(
      `↩️ 上帝撤回了 ${target?.name ?? result.playerId} 的财富调整待确认`
    );
    appendSessionEvent(game, "admin_wealth_offer_cancelled", {
      playerId: result.playerId,
      offerId: result.offerId,
      delta: result.delta,
    });
    broadcastUpdate(io, game);
  });

  socket.on("adminAdjustPlayerCard", ({ roomId, targetPlayerId, cardId, action, inventoryIndex }) => {
    if (!socket.data.isSuperAdmin) return;
    const game = rooms[roomId];
    if (!game) return;
    const result = adminAdjustPlayerCard(
      game,
      targetPlayerId,
      cardId,
      action,
      inventoryIndex
    );
    if (!result.ok) {
      socket.emit("error", result.message);
      return;
    }
    const { player, cardName, action: act, cardId: resolvedCardId } = result;
    if (act === "add") {
      game.logs.push(
        `🎴 上帝补发「${cardName}」给 ${player.name}（未经过拍卖，不扣财富）`
      );
    } else {
      game.logs.push(
        `🎴 上帝从 ${player.name} 手牌收回「${cardName}」（拍卖记录不变）`
      );
    }
    appendSessionEvent(game, "admin_card_adjust", {
      targetPlayerId: player.id,
      cardId: resolvedCardId,
      action: act,
    });
    broadcastUpdate(io, game);
  });

  // === Agent 玩家注册 ===
  // 外部 agents 运行时加入后调用，把该连接标记为 Agent，供观察端与导出识别。
  // 注意：不设置 isAI，isAI 仅表示「由服务端自动托管的旧 Bot」；Agent 玩家照常参与
  // ready / 投资 / 拍卖等全部玩家流程。
  socket.on("agentRegister", ({ agentIndex, persona, model }: { agentIndex?: number; persona?: string; model?: string }) => {
    const roomId = getRoomId(socket);
    if (!roomId || !rooms[roomId]) return;
    const game = rooms[roomId];
    const player = game.players.find((p) => p.socketId === socket.id);
    if (!player) return;
    player.isAgent = true;
    if (typeof agentIndex === "number" && Number.isFinite(agentIndex)) {
      player.agentIndex = Math.trunc(agentIndex);
    }
    if (typeof persona === "string") player.agentPersona = persona.slice(0, 40);
    if (typeof model === "string") player.agentModel = model.slice(0, 80);
    broadcastUpdate(io, game);
  });

  // === Player ===
  socket.on("playerReady", () => {
    const roomId = getRoomId(socket);
    if (!roomId || !rooms[roomId]) return;
    const game = rooms[roomId];
    if (game.phase === "ROOM_WAITING") return;
    const player = game.players.find(p => p.socketId === socket.id);
    if (!player) return;
    if (!togglePlayerReady(game, player.id)) return;
    appendSessionEvent(
      game,
      "player_ready",
      {
        phase: game.phase,
        globalRound: game.globalRound,
        currentEra: game.currentEra,
        roundInEra: game.roundInEra,
      },
      player.id
    );
    tryAdvancePhase(game);
    broadcastUpdate(io, game);
  });

  socket.on("syncInvestmentDraft", ({ investment }) => {
    const roomId = getRoomId(socket);
    if (!roomId || !rooms[roomId]) return;
    const game = rooms[roomId];
    if (game.phase !== "BUFF_USAGE" && game.phase !== "INVESTMENT") return;
    const player = game.players.find((p) => p.socketId === socket.id);
    if (!player) return;
    if (game.phase === "INVESTMENT" && player.ready) return;
    player.investmentDraft = sanitizeInvestments(game, player, investment ?? {});
  });

  socket.on("submitInvestment", ({ investment }) => {
    const roomId = getRoomId(socket);
    if (!roomId || !rooms[roomId]) return;
    const game = rooms[roomId];
    if (game.phase !== "INVESTMENT") return;
    const player = game.players.find(p => p.socketId === socket.id);
    if (!player || player.ready) return;
    const sanitized = sanitizeInvestments(game, player, investment ?? {});
    if (!applyInvestments(game, player.id, sanitized, "player")) {
      socket.emit("error", "投资方案无效（精力不足或超出限制）");
      return;
    }
    togglePlayerReady(game, player.id);
    tryAdvancePhase(game);
    broadcastUpdate(io, game);
  });

  socket.on("unlockOwnInvestment", () => {
    const roomId = getRoomId(socket);
    if (!roomId || !rooms[roomId]) return;
    const game = rooms[roomId];
    const player = game.players.find((p) => p.socketId === socket.id);
    if (!player) return;

    const result = unlockSubmittedInvestment(game, player.id);
    if (!result.ok) {
      const messages: Record<typeof result.reason, string> = {
        not_found: "解锁失败：玩家不存在",
        not_ready: "你尚未锁定投资",
        wrong_phase: "当前阶段无法解锁",
        timer_closed: "倒计时已结束，无法解锁",
        ai_player: "无法解锁",
      };
      socket.emit("error", messages[result.reason]);
      return;
    }

    socket.emit("playerNotify", {
      type: "investment",
      message: "已解锁投资方案，精力已退回，请调整后重新提交。",
    });
    broadcastUpdate(io, game);
  });

  socket.on("createTransaction", ({ toId, amount, note, clientTempId }) => {
    const roomId = getRoomId(socket);
    if (!roomId || !rooms[roomId]) return;
    const game = rooms[roomId];
    if (game.phase === "ROOM_WAITING" || game.phase === "ERA_INTRO" || game.phase === "TUTORIAL") {
      socket.emit("error", "当前阶段无法发送私信或转账");
      return;
    }
    const sender = game.players.find(p => p.socketId === socket.id);
    const receiver = game.players.find(p => p.id === toId);
    // 严格一对一：单条记录仅绑定发送方与唯一接收方
    if (!sender || !receiver || sender.id === receiver.id) {
      socket.emit("error", "无法发送：目标玩家无效");
      return;
    }
    if (!allow(`tx:${sender.id}`, 20, 60_000)) {
      socket.emit("error", "发送过于频繁，请稍后再试");
      return;
    }
    pruneSettledTransactions(game);
    if (pendingCountFrom(game, sender.id) >= MAX_PENDING_PER_SENDER) {
      socket.emit("error", "未完成的转账过多，请等待对方确认");
      return;
    }

    const amt = Math.floor(Number(amount) || 0);
    const trimmed = normalizeNoteInput(note);
    const message = sanitizeTransactionNote(note);
    const tempId =
      typeof clientTempId === "string" && clientTempId.length > 0 && clientTempId.length <= 64
        ? clientTempId
        : undefined;

    if (amt === 0) {
      if (!trimmed) {
        socket.emit("error", "私信内容不能为空");
        return;
      }
      const tx = {
        id: Math.random().toString(),
        fromId: sender.id,
        fromName: sender.name,
        toId: receiver.id,
        toName: receiver.name,
        amount: 0,
        note: message,
        status: "accepted" as const,
        timestamp: Date.now(),
        clientTempId: tempId,
      };
      game.transactions.push(tx);
      appendSessionEvent(game, "transaction_created", { txId: tx.id, ...tx }, sender.id);
      pruneSettledTransactions(game);
      broadcastUpdate(io, game);
      if (receiver.socketId) {
        const preview = truncateNotePreview(message, 48);
        io.to(receiver.socketId).emit("playerNotify", {
          type: "chat",
          message: `${sender.name}：${preview}`,
        });
      }
      return;
    }

    if (amt <= 0) {
      socket.emit("error", "转账金额无效");
      return;
    }
    const available = playerAvailableWealth(game, sender);
    if (amt > available) {
      socket.emit(
        "error",
        `可用财富不足，无法转账（可用 ${available}${formatPlayerHoldSuffix(game, sender.id)}）`
      );
      return;
    }

    const tx = {
      id: Math.random().toString(),
      fromId: sender.id,
      fromName: sender.name,
      toId: receiver.id,
      toName: receiver.name,
      amount: amt,
      note: message,
      status: "pending" as const,
      timestamp: Date.now(),
      clientTempId: tempId,
    };
    game.transactions.push(tx);
    appendSessionEvent(game, "transaction_created", { txId: tx.id, ...tx }, sender.id);
    pruneSettledTransactions(game);
    broadcastUpdate(io, game);
    if (receiver.socketId) {
      io.to(receiver.socketId).emit("playerNotify", {
        type: "transfer",
        message: `${sender.name} 向你转账 ${amt}（待确认）`,
      });
    }
  });

  socket.on("createChatGroup", ({ memberIds, name }) => {
    if (!GROUP_CHAT_ENABLED) {
      socket.emit("error", GROUP_CHAT_DISABLED_MESSAGE);
      return;
    }
    const roomId = getRoomId(socket);
    if (!roomId || !rooms[roomId]) return;
    const game = rooms[roomId];
    const player = game.players.find((p) => p.socketId === socket.id);
    if (!player) return;
    if (!allow(`cg:${player.id}`, 5, 60_000)) {
      socket.emit("error", "操作过于频繁，请稍后再试");
      return;
    }
    const ids = Array.isArray(memberIds) ? memberIds.filter((id) => typeof id === "string") : [];
    const result = createCustomChatGroup(game, player.id, ids, name);
    if (!result.ok) {
      socket.emit("error", result.error);
      return;
    }
    appendSessionEvent(game, "chat_group_created", { groupId: result.group.id, name: result.group.name }, player.id);
    broadcastUpdate(io, game);
  });

  socket.on("addChatGroupMembers", ({ groupId, memberIds }) => {
    if (!GROUP_CHAT_ENABLED) {
      socket.emit("error", GROUP_CHAT_DISABLED_MESSAGE);
      return;
    }
    const roomId = getRoomId(socket);
    if (!roomId || !rooms[roomId]) return;
    const game = rooms[roomId];
    const player = game.players.find((p) => p.socketId === socket.id);
    if (!player) return;
    if (typeof groupId !== "string") return;
    const ids = Array.isArray(memberIds) ? memberIds.filter((id) => typeof id === "string") : [];
    const result = addChatGroupMembers(game, player.id, groupId, ids);
    if (!result.ok) {
      socket.emit("error", result.error);
      return;
    }
    broadcastUpdate(io, game);
  });

  socket.on("leaveChatGroup", ({ groupId }) => {
    if (!GROUP_CHAT_ENABLED) {
      socket.emit("error", GROUP_CHAT_DISABLED_MESSAGE);
      return;
    }
    const roomId = getRoomId(socket);
    if (!roomId || !rooms[roomId]) return;
    const game = rooms[roomId];
    const player = game.players.find((p) => p.socketId === socket.id);
    if (!player || typeof groupId !== "string") return;
    const result = leaveChatGroup(game, player.id, groupId);
    if (!result.ok) {
      socket.emit("error", result.error);
      return;
    }
    broadcastUpdate(io, game);
  });

  socket.on("sendGroupMessage", ({ groupId, text, clientTempId }) => {
    if (!GROUP_CHAT_ENABLED) {
      socket.emit("error", GROUP_CHAT_DISABLED_MESSAGE);
      return;
    }
    const roomId = getRoomId(socket);
    if (!roomId || !rooms[roomId]) return;
    const game = rooms[roomId];
    const sender = game.players.find((p) => p.socketId === socket.id);
    if (!sender || typeof groupId !== "string") return;
    if (!allow(`grp:${sender.id}`, 20, 60_000)) {
      socket.emit("error", "发送过于频繁，请稍后再试");
      return;
    }
    const result = sendGroupChatMessage(game, sender.id, groupId, text, clientTempId);
    if (!result.ok) {
      socket.emit("error", result.error);
      return;
    }
    const group = game.chatGroups?.find((g) => g.id === groupId);
    appendSessionEvent(
      game,
      "group_message",
      { groupId, messageId: result.message.id, fromId: sender.id },
      sender.id
    );
    broadcastUpdate(io, game);
    for (const targetId of result.notifyTargets) {
      const target = game.players.find((p) => p.id === targetId);
      if (!target?.socketId) continue;
      io.to(target.socketId).emit("playerNotify", {
        type: "chat",
        message: `${group?.name ?? "群聊"} · ${sender.name}：${result.preview}`,
      });
    }
  });

  socket.on("respondTransaction", ({ txId, accept }) => {
    const roomId = getRoomId(socket);
    if (!roomId || !rooms[roomId]) return;
    const game = rooms[roomId];
    const tx = game.transactions.find(t => t.id === txId);
    const player = game.players.find(p => p.socketId === socket.id);
    if (!tx || !player) return;
    const resolved = resolvePendingTransfer(game, txId, player.id, accept === true);
    if (!resolved.ok) return;
    appendSessionEvent(
      game,
      "transaction_resolved",
      { txId, accept, status: resolved.status, amount: resolved.amount },
      player.id
    );
    pruneSettledTransactions(game);
    broadcastUpdate(io, game);

    const sender = game.players.find((p) => p.id === tx.fromId);
    if (sender?.socketId && tx.amount > 0) {
      const verb =
        resolved.status === "accepted" ? "已接收你的转账" : "已退回你的转账";
      io.to(sender.socketId).emit("playerNotify", {
        type: "transfer",
        message: `${player.name} ${verb} ${resolved.amount}`,
      });
    }
  });

  socket.on(
    "fetchTransactionHistory",
    ({ roomId: reqRoomId, beforeTimestamp, beforeId, limit, viewAsPlayerId }) => {
      const roomId = getRoomId(socket);
      if (!roomId || !rooms[roomId] || reqRoomId !== roomId) return;
      const game = rooms[roomId];
      const isSuperAdmin = socket.data.isSuperAdmin === true;
      let viewerPlayerId: string | null = null;
      let isGodView = false;
      if (isSuperAdmin) {
        const raw =
          typeof viewAsPlayerId === "string" ? viewAsPlayerId.trim() : "";
        if (raw && isValidHumanPerspectiveTarget(game, raw)) {
          viewerPlayerId = raw;
          isGodView = false;
        } else {
          isGodView = true;
        }
      } else {
        const player = game.players.find((p) => p.socketId === socket.id);
        if (!player) return;
        viewerPlayerId = player.id;
      }

      const ts = Number(beforeTimestamp);
      const id = typeof beforeId === "string" ? beforeId : "";
      if (!Number.isFinite(ts) || !id) {
        socket.emit("error", "无效的历史游标");
        return;
      }

      const visible = visibleTransactionsForViewer(
        game.transactions,
        viewerPlayerId,
        isGodView
      );
      const pageLimit = clampHistoryPageLimit(limit);
      const { transactions, hasMore } = fetchTransactionHistoryPage(
        visible,
        { timestamp: ts, id },
        pageLimit
      );
      socket.emit("transactionHistoryPage", {
        roomId,
        transactions,
        hasMore,
        total: visible.length,
      });
    }
  );

  socket.on("performCoffee", () => {
    const roomId = getRoomId(socket);
    if (!roomId || !rooms[roomId]) return;
    const game = rooms[roomId];
    const player = game.players.find(p => p.socketId === socket.id);
    if (!player) return;
    if (game.phase !== "BUFF_USAGE" && game.phase !== "INVESTMENT") {
      socket.emit("error", "当前阶段无法购买咖啡");
      return;
    }
    if (player.ready && game.phase === "INVESTMENT") {
      socket.emit("error", "已提交投资，无法购买咖啡");
      return;
    }
    const result = purchaseCoffee(game, player);
    if (!result.ok) {
      socket.emit("error", result.message);
      return;
    }
    broadcastUpdate(io, game);
    const cups = player.coffeePurchasesThisRound ?? 1;
    socket.emit("playerNotify", {
      type: "coffee",
      message: `咖啡购买成功（本轮第 ${cups} 杯） · -${COFFEE_WEALTH_COST}💰 +${COFFEE_ENERGY_GAIN}⚡`,
    });
  });

  socket.on("cancelCoffee", ({ count }: { count?: number }) => {
    const roomId = getRoomId(socket);
    if (!roomId || !rooms[roomId]) return;
    const game = rooms[roomId];
    const player = game.players.find((p) => p.socketId === socket.id);
    if (!player) return;
    if (game.phase !== "BUFF_USAGE" && game.phase !== "INVESTMENT") {
      socket.emit("error", "当前阶段无法退订咖啡");
      return;
    }
    if (player.ready && game.phase === "INVESTMENT") {
      socket.emit("error", "已提交投资，无法退订咖啡");
      return;
    }
    const n = Math.floor(Number(count));
    const result = refundCoffee(game, player, n);
    if (!result.ok) {
      socket.emit("error", result.message);
      return;
    }
    broadcastUpdate(io, game);
    const remaining = player.coffeePurchasesThisRound ?? 0;
    socket.emit("playerNotify", {
      type: "coffee",
      message: `咖啡退订成功（${n} 杯） · +${n * COFFEE_WEALTH_COST}💰 −${n * COFFEE_ENERGY_GAIN}⚡ · 本轮剩余 ${remaining} 杯`,
    });
  });

  socket.on("useBuffCard", (data) => {
    const roomId = getRoomId(socket);
    if (!roomId || !rooms[roomId]) return;
    const game = rooms[roomId];
    const player = game.players.find(p => p.socketId === socket.id);
    if (!player) return;

    const cardId = typeof data?.cardId === "string" ? data.cardId : "";
    if (!cardId) {
      socket.emit("error", "未指定道具卡");
      return;
    }

    // 强买强卖：仅拍卖阶段
    if (cardId === FORCE_BUY_CARD_ID) {
      if (game.phase !== "AUCTION") {
        socket.emit("error", "强买强卖仅可在拍卖阶段使用");
        return;
      }
      const result = useForceBuyCard(game, player.id);
      if (result.success) {
        for (const cancelled of result.cancelledOffers ?? []) {
          const target = game.players.find((p) => p.id === cancelled.playerId);
          if (target?.socketId) {
            io.to(target.socketId).emit("auctionOfferCancelled", {
              offerId: cancelled.offerId,
              cardId: cancelled.cardId,
            });
          }
        }
        broadcastUpdate(io, game);
        socket.emit("playerNotify", { type: "buff", message: result.msg });
        if (result.auctionSold) {
          socket.to(roomId).emit("playerNotify", {
            type: "auction_sold",
            message: formatAuctionSoldMessage(game, result.auctionSold),
          });
        }
      } else {
        socket.emit("error", result.msg);
      }
      return;
    }

    // 道具可在投资阶段使用（未锁定前）；兼容遗留 BUFF_USAGE
    if (game.phase !== "BUFF_USAGE" && game.phase !== "INVESTMENT") {
      socket.emit("error", "当前阶段不能使用道具卡");
      return;
    }
    if (player.ready) {
      socket.emit("error", "已锁定投资，无法再使用道具卡");
      return;
    }
    if (isInvestmentBuffLockoutActive(game)) {
      socket.emit("error", "最后 2 分钟不能使用道具卡");
      return;
    }
    const result = useBuffCard(game, player.id, cardId, data);
    if (result.success) {
      if (!player.usedCards) player.usedCards = [];
      player.usedCards.push(cardId);
      broadcastUpdate(io, game);
      socket.emit("playerNotify", { type: "buff", message: result.msg });
      if (result.notifyTargetId && result.notifyTargetMsg) {
        const target = game.players.find((p) => p.id === result.notifyTargetId);
        if (target?.socketId && target.id !== player.id) {
          io.to(target.socketId).emit("playerNotify", {
            type: result.investmentAutoUnlocked ? "investment" : "buff_hit",
            message: result.notifyTargetMsg,
          });
        }
      }
    } else {
      socket.emit("error", result.msg);
    }
  });

  socket.on("ackSlackHit", (payload?: { hitId?: unknown }) => {
    const roomId = getRoomId(socket);
    if (!roomId || !rooms[roomId]) return;
    const game = rooms[roomId];
    const player = game.players.find((p) => p.socketId === socket.id);
    if (!player) return;
    if (!ackSlackHit(game, player.id, payload?.hitId)) {
      socket.emit("error", "摸鱼提示已失效，请刷新后重试");
      return;
    }
    broadcastUpdate(io, game);
  });

  socket.on("ackLighterBurn", (payload?: { noticeId?: unknown }) => {
    const roomId = getRoomId(socket);
    if (!roomId || !rooms[roomId]) return;
    const game = rooms[roomId];
    const player = game.players.find((p) => p.socketId === socket.id);
    if (!player) return;
    if (!ackLighterBurnNotice(game, player.id, payload?.noticeId)) {
      socket.emit("error", "打火机烧毁提示已失效，请刷新后重试");
      return;
    }
    broadcastUpdate(io, game);
  });

  socket.on("submitCommunityName", ({ name }) => {
    const roomId = getRoomId(socket);
    if (!roomId || !rooms[roomId]) return;
    const game = rooms[roomId];

    if (game.phase !== "COMMUNITY_NAMING") {
      socket.emit("error", "当前阶段不能为社区命名");
      return;
    }
    if (game.communityName) {
      socket.emit("error", "社区已命名，请勿重复提交");
      return;
    }

    const player = game.players.find((p) => p.socketId === socket.id);
    if (!player) return;

    const namer = getCommunityNamer(game);
    if (!namer || player.id !== namer.id) {
      socket.emit("error", "仅当前在线的首富可为社区命名");
      return;
    }

    const communityName = sanitizeCommunityName(name);
    if (!communityName) {
      socket.emit("error", "请输入有效的社区名称");
      return;
    }

    finalizeCommunityName(io, game, communityName, "player");
  });

  socket.on("adminSubmitCommunityName", ({ roomId, name }) => {
    if (!socket.data.isSuperAdmin) return;
    const game = rooms[roomId];
    if (!game) return;
    if (game.phase !== "COMMUNITY_NAMING") {
      socket.emit("error", "当前阶段不能为社区命名");
      return;
    }
    if (game.communityName) {
      socket.emit("error", "社区已命名，请勿重复提交");
      return;
    }
    const communityName = sanitizeCommunityName(name);
    if (!communityName) {
      socket.emit("error", "请输入有效的社区名称");
      return;
    }
    finalizeCommunityName(io, game, communityName, "admin");
  });

  socket.on("disconnect", () => {
    for (const game of Object.values(rooms)) {
      if (removeDeviceClaimBySocket(game, socket.id)) {
        delete socket.data.pendingDeviceClaim;
        broadcastUpdate(io, game);
      }
    }
    const boundRoom = socket.data.gameRoomId as string | undefined;
    if (boundRoom && rooms[boundRoom]) {
      const game = rooms[boundRoom];
      const player = game.players.find((p) => p.socketId === socket.id);
      if (player) {
        player.connected = false;
        syncEnergyAfterRosterChange(game);
        appendSessionEvent(
          game,
          "presence",
          presencePayload(game, "disconnect", player.id),
          player.id
        );
        broadcastUpdate(io, game);
      }
      return;
    }
    for (const game of Object.values(rooms)) {
      const player = game.players.find((p) => p.socketId === socket.id);
      if (player) {
        player.connected = false;
        syncEnergyAfterRosterChange(game);
        appendSessionEvent(
          game,
          "presence",
          presencePayload(game, "disconnect", player.id),
          player.id
        );
        broadcastUpdate(io, game);
      }
    }
  });
}

function getRoomId(socket: Socket): string | undefined {
  const bound = socket.data.gameRoomId;
  if (typeof bound === "string" && bound) return bound;
  return undefined;
}