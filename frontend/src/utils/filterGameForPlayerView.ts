import { GameState, Phase, Player, Transaction } from "../types";
import {
  buildTransactionHotTail,
  transactionLogMeta,
} from "./transactionHotTail";
import { visibleTransactionsForViewer } from "./transactionVisibility";

const HIDDEN_INVESTMENT_PHASES = new Set<Phase>(["INVESTMENT", "BUFF_USAGE"]);

function mapPlayerForViewer(
  p: Player,
  viewerPlayerId: string,
  hideInvestments: boolean,
  isGodView: boolean
): Player {
  const visibleToViewer = isGodView || p.id === viewerPlayerId;
  const { energy, ...peerWithoutEnergy } = p;
  const energyField = isGodView || visibleToViewer ? { energy } : {};
  const slackAttribution = isGodView
    ? {
        slackedBy: p.slackedBy ?? [],
        slackEnergyLost: (p as Player & { slackEnergyLost?: number[] }).slackEnergyLost ?? [],
      }
    : { slackedBy: [] as string[], slackEnergyLost: [] as number[] };

  if (visibleToViewer) {
    return {
      ...peerWithoutEnergy,
      ...energyField,
      ...slackAttribution,
      buffRoundNotes: p.buffRoundNotes ?? [],
      pendingSlackHits: p.pendingSlackHits ?? [],
      pendingLighterBurnNotices: p.pendingLighterBurnNotices ?? [],
      investmentDraft: p.investmentDraft,
      investment: p.investment,
      coffeePurchasesThisRound: p.coffeePurchasesThisRound ?? 0,
    } as Player;
  }

  const {
    longTerm: _lt,
    totalEnergyConsumed: _tec,
    investedRiskEnergy: _ire,
    investedLongEnergy: _ile,
    ...peerPublic
  } = peerWithoutEnergy;

  return {
    ...peerPublic,
    ...energyField,
    ...slackAttribution,
    inventory: [] as string[],
    activeBuffs: [] as Player["activeBuffs"],
    usedCards: [] as string[],
    buffRoundNotes: undefined,
    pendingSlackHits: undefined,
    pendingLighterBurnNotices: undefined,
    investmentDraft: undefined,
    investment: hideInvestments ? {} : p.investment,
    // 咖啡杯数会间接暴露本轮精力操作，只给本人
    coffeePurchasesThisRound: undefined,
    ...(hideInvestments
      ? {}
      : {
          longTerm: p.longTerm,
          totalEnergyConsumed: p.totalEnergyConsumed,
          investedRiskEnergy: p.investedRiskEnergy,
          investedLongEnergy: p.investedLongEnergy,
        }),
  } as Player;
}

function filterProjectForViewer(
  project: GameState["activeProjects"][number],
  viewerPlayerId: string
): GameState["activeProjects"][number] {
  const ownRecord = project.investorRecords?.[viewerPlayerId];
  const ownSlices = project.investorRoundSlices?.[viewerPlayerId];
  return {
    ...project,
    investorRecords: ownRecord != null ? { [viewerPlayerId]: ownRecord } : {},
    investorRoundSlices: ownSlices ? { [viewerPlayerId]: ownSlices } : {},
    earningRecords: {},
  };
}

/** 主持台已有上帝全量 state 时，本地裁成某玩家可见画面（与 server serialize 玩家视角一致） */
export function filterGameForPlayerView(
  game: GameState,
  viewerPlayerId: string
): GameState {
  if (!game.players.some((p) => p.id === viewerPlayerId)) {
    return game;
  }

  const isGodView = false;
  const hideInvestments = HIDDEN_INVESTMENT_PHASES.has(game.phase);
  const visibleAll = visibleTransactionsForViewer(
    game.transactions ?? [],
    viewerPlayerId,
    isGodView
  );
  const hotTail = buildTransactionHotTail(visibleAll);
  const transactionLog = transactionLogMeta(visibleAll, hotTail);

  const ownLotteryOffer = (game.pendingLotteryOffers ?? []).find(
    (o) => o.playerId === viewerPlayerId
  );
  const ownWealthAdjust = (game.pendingWealthAdjustments ?? []).find(
    (o) => o.playerId === viewerPlayerId
  );
  const myPendingAuctionOffers = (game.pendingAuctionOffers ?? []).filter(
    (o) => o.playerId === viewerPlayerId
  );

  const {
    pendingAuctionOffers: _a,
    pendingLotteryOffers: _l,
    lotteryCompletedDeals: _lc,
    pendingWealthAdjustments: _w,
    pendingDeviceClaims: _d,
    auctionCompletedDeals: _ac,
    auctionBids: _b,
    pendingLotteryOffer: _plo,
    pendingWealthAdjustment: _pwa,
    isGodView: _g,
    adminPerspectivePlayerId: _ap,
    // 道具/打火机内部流水只供上帝视图
    roundBuffPlays: _rb,
    lighterBurnDeclarations: _lb,
    playerLogs: _pl,
    ...rest
  } = game;

  const lastSettlement = rest.lastSettlement
    ? (() => {
        const { lighterResolve: _lr, ...settlement } = rest.lastSettlement as typeof rest.lastSettlement & {
          lighterResolve?: unknown;
        };
        return settlement;
      })()
    : rest.lastSettlement;

  return {
    ...rest,
    lastSettlement,
    activeProjects: game.activeProjects.map((p) =>
      filterProjectForViewer(p, viewerPlayerId)
    ),
    uncompletedProjects: game.uncompletedProjects.map((p) =>
      filterProjectForViewer(p, viewerPlayerId)
    ),
    completedProjects: game.completedProjects.map((p) =>
      filterProjectForViewer(p, viewerPlayerId)
    ),
    players: game.players.map((p) =>
      mapPlayerForViewer(p, viewerPlayerId, hideInvestments, isGodView)
    ),
    transactions: hotTail,
    transactionLog,
    chatGroups: (game.chatGroups ?? []).filter((g) => g.memberIds.includes(viewerPlayerId)),
    groupMessages: (() => {
      const visibleIds = new Set(
        (game.chatGroups ?? [])
          .filter((g) => g.memberIds.includes(viewerPlayerId))
          .map((g) => g.id)
      );
      return (game.groupMessages ?? []).filter((m) => visibleIds.has(m.groupId));
    })(),
    ...(ownLotteryOffer ? { pendingLotteryOffer: ownLotteryOffer } : {}),
    ...(ownWealthAdjust ? { pendingWealthAdjustment: ownWealthAdjust } : {}),
    ...(myPendingAuctionOffers.length > 0
      ? { myPendingAuctionOffers }
      : {}),
  };
}
