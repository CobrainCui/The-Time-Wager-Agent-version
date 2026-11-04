import { Server } from "socket.io";

import { GameState, Transaction } from "../state/gameState.js";
import { getPublicCommunityLeaderboard } from "../state/communityLeaderboard.js";
import { peekNextRoundEnergy } from "../logic/energySchedule.js";
import { buildAuctionLotPublicView, getAuctionCardIdsForGame, publicSessionAuctionWins } from "../logic/auctionCards.js";
import { pendingDeviceClaimsForGodView } from "../logic/deviceClaim.js";
import { transactionsForViewerPayload, visibleTransactionsForViewer } from "../util/transactionHistory.js";
import { chatGroupsForViewer, groupMessagesForViewer } from "../logic/chatGroups.js";
import { directMessagesForViewer } from "../logic/directMessages.js";
import { GROUP_CHAT_ENABLED } from "../config/playerChatFeatures.js";
import { serializationForMemberSocket } from "./adminPerspective.js";
import type { SettlementBaseline } from "../logic/settlementBaseline.js";
import type { Socket } from "socket.io";

const HIDDEN_INVESTMENT_PHASES = new Set<GameState["phase"]>(["INVESTMENT", "BUFF_USAGE"]);

/** 他人精力不对玩家 payload 暴露（仅本人或上帝可见） */
function energyVisibleToViewer(
  isGodView: boolean,
  visibleToViewer: boolean
): boolean {
  return isGodView || visibleToViewer;
}

export function transactionsForViewer(
  transactions: Transaction[],
  viewerPlayerId: string | null | undefined,
  isGodView: boolean
): Transaction[] {
  return visibleTransactionsForViewer(transactions, viewerPlayerId, isGodView);
}

/** 与 broadcastUpdate 一致，供观战首包等单独 emit 使用 */
export function serializeGameForClient(
  game: GameState,
  extra: Record<string, unknown> = {},
  viewerPlayerId?: string | null
) {
  const isGodView = extra.isGodView === true;
  const { transactions, transactionLog } = transactionsForViewerPayload(
    game.transactions,
    viewerPlayerId ?? null,
    isGodView
  );
  const {
    sessionTelemetry,
    sessionStartedAt,
    pendingAuctionOffers,
    pendingLotteryOffers,
    lotteryCompletedDeals,
    pendingWealthAdjustments,
    auctionBids,
    auctionCompletedDeals: _auctionCompletedDeals,
    createdByIp: _createdByIp,
    settlementBaseline: _settlementBaseline,
    adminProjectAdjustments: _adminProjectAdjustments,
    hostRevision: _hostRevision,
    seedBase: _seedBase,
    seed: _seed,
    rngState: _rngState,
    sessionOrdinal: _sessionOrdinal,
    experiment: _experiment,
    predictions,
    agentDecisions,
    chatUsage: _chatUsage,
    ...gamePublic
  } = game;
  const hideInvestments = HIDDEN_INVESTMENT_PHASES.has(game.phase);
  const ownLotteryOffer =
    !isGodView && viewerPlayerId
      ? (pendingLotteryOffers ?? []).find((o) => o.playerId === viewerPlayerId)
      : undefined;
  const ownWealthAdjust =
    !isGodView && viewerPlayerId
      ? (pendingWealthAdjustments ?? []).find((o) => o.playerId === viewerPlayerId)
      : undefined;
  const lotView = buildAuctionLotPublicView(game);

  const chatGroups = GROUP_CHAT_ENABLED
    ? chatGroupsForViewer(game, viewerPlayerId ?? null, isGodView)
    : [];
  const groupMessages = GROUP_CHAT_ENABLED
    ? groupMessagesForViewer(game, viewerPlayerId ?? null, isGodView)
    : [];
  const directMessages = directMessagesForViewer(game, viewerPlayerId ?? null, isGodView);
  const ownPredictions = isGodView
    ? predictions ?? []
    : (predictions ?? []).filter((p) => p.playerId === viewerPlayerId);

  return {
    ...gamePublic,
    chatGroups,
    groupMessages,
    directMessages,
    predictions: ownPredictions,
    ...lotView,
    auctionSessionWins: publicSessionAuctionWins(game),
    ...(isGodView
      ? {
          hostRevision: game.hostRevision ?? 0,
          ...(game.settlementBaseline
            ? {
                settlementBaselineActiveProjects: (
                  game.settlementBaseline as SettlementBaseline
                ).activeProjects,
              }
            : {}),
          pendingAuctionOffers: pendingAuctionOffers ?? [],
          pendingLotteryOffers: pendingLotteryOffers ?? [],
          lotteryCompletedDeals: lotteryCompletedDeals ?? [],
          pendingWealthAdjustments: pendingWealthAdjustments ?? [],
          pendingDeviceClaims: pendingDeviceClaimsForGodView(game),
          auctionCompletedDeals: game.auctionCompletedDeals ?? [],
          auctionBids: auctionBids ?? [],
          /** 实验元数据与主持专用：玩家视图不下发 */
          experiment: _experiment ?? null,
          seed: _seed ?? null,
          seedBase: _seedBase ?? null,
          sessionOrdinal: _sessionOrdinal ?? 0,
          auctionPoolCardIds: getAuctionCardIdsForGame(game),
          agentDecisions: agentDecisions ?? [],
        }
      : {
          ...(ownLotteryOffer ? { pendingLotteryOffer: ownLotteryOffer } : {}),
          ...(ownWealthAdjust ? { pendingWealthAdjustment: ownWealthAdjust } : {}),
        }),
    readyPlayers: Array.from(game.readyPlayers),
    phaseFinished: Array.from(game.phaseFinished),
    drawnProjects: Array.from(game.drawnProjects),
    players: game.players.map((p) => {
      const {
        socketId: _socketId,
        reconnectToken: _reconnectToken,
        preSubmitInvestmentDraft: _preSubmit,
        receivedRoundEnergy: _receivedRoundEnergy,
        buffRoundNotes,
        pendingSlackHits,
        pendingLighterBurnNotices,
        slackedBy: _slackedBy,
        slackEnergyLost: _slackEnergyLost,
        inventory,
        activeBuffs,
        usedCards,
        // 实验盲区：非上帝视角不暴露其他 Agent 的序号 / 人格 / 模型 / 供应商
        agentPersona,
        agentModel,
        agentProvider,
        agentIndex,
        // 旧局内存可能仍带幽灵字段，避免漏进玩家 payload
        lighterBurnGhostIds: _lighterBurnGhostIds,
        ...rest
      } = p as typeof p & { lighterBurnGhostIds?: string[] };
      const agentMeta = isGodView ? { agentPersona, agentModel, agentProvider, agentIndex } : {};
      const slackAttribution =
        isGodView
          ? { slackedBy: p.slackedBy ?? [], slackEnergyLost: p.slackEnergyLost ?? [] }
          : { slackedBy: [] as string[], slackEnergyLost: [] as number[] };
      const visibleToViewer = isGodView || p.id === viewerPlayerId;
      const { energy, ...restWithoutEnergy } = rest;
      const energyField = energyVisibleToViewer(isGodView, visibleToViewer)
        ? { energy }
        : {};
      if (visibleToViewer) {
        return {
          ...restWithoutEnergy,
          ...energyField,
          ...agentMeta,
          ...slackAttribution,
          inventory,
          activeBuffs,
          usedCards,
          // 本轮道具短记录仅本人（或上帝）可见
          buffRoundNotes: buffRoundNotes ?? [],
          pendingSlackHits: pendingSlackHits ?? [],
          pendingLighterBurnNotices: pendingLighterBurnNotices ?? [],
          investmentDraft: p.investmentDraft,
          investment: p.investment,
          coffeePurchasesThisRound: p.coffeePurchasesThisRound ?? 0,
        };
      }
      return {
        ...restWithoutEnergy,
        ...energyField,
        ...agentMeta,
        ...slackAttribution,
        // 他人手牌 / 已发动 / 已用对玩家隐藏
        buffRoundNotes: undefined,
        pendingSlackHits: undefined,
        pendingLighterBurnNotices: undefined,
        investmentDraft: undefined,
        investment: hideInvestments ? {} : p.investment,
        coffeePurchasesThisRound: p.coffeePurchasesThisRound ?? 0,
      };
    }),
    transactions,
    transactionLog,
    serverNow: Date.now(),
    nextRoundEnergy: peekNextRoundEnergy(game),
    // 倒计时控场：显式下发，避免后续序列化改动漏字段导致 Admin/玩家不同步
    investmentEndsAt: game.investmentEndsAt,
    investmentTimerPausedAt: game.investmentTimerPausedAt,
    settlementHistory: sessionTelemetry?.settlementHistory ?? [],
    ...extra,
    globalLeaderboard: getPublicCommunityLeaderboard(),
  };
}

export function emitSerializedGameUpdate(
  socket: Socket,
  game: GameState
): void {
  const player = game.players.find((p) => p.socketId === socket.id);
  const isSuperAdmin = socket.data.isSuperAdmin === true;
  if (isSuperAdmin) {
    socket.emit("gameUpdate", serializeGameForClient(game, { isGodView: true }, null));
    return;
  }
  const { extra, viewerPlayerId } = serializationForMemberSocket(
    game,
    false,
    undefined,
    player?.id ?? null
  );
  socket.emit("gameUpdate", serializeGameForClient(game, extra, viewerPlayerId));
}

export function broadcastUpdate(io: Server, game: GameState) {
  const memberIds = io.sockets.adapter.rooms.get(game.roomId);
  if (!memberIds) return;

  for (const socketId of memberIds) {
    const socket = io.sockets.sockets.get(socketId);
    if (!socket) continue;
    emitSerializedGameUpdate(socket, game);
  }
}
