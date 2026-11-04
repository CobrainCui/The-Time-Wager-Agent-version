import React, { useState, useEffect, useMemo, useRef, Suspense, lazy } from "react";
import { GameState, Player } from "./types";
import { EraIntro } from "./views/EraIntro";
import { Investment } from "./views/Investment";
import { Settlement } from "./views/Settlement";
import { CommunityNaming } from "./views/CommunityNaming";
import { TutorialView } from "./views/TutorialView";
import { BuffUsage } from "./views/BuffUsage";
import { AuctionView } from "./views/AuctionView";
import { RoomWaiting } from "./views/RoomWaiting";
import { PlayerChatSystem } from "./components/playerChat/PlayerChatSystem";
import { AuctionConfirmModal } from "./components/AuctionConfirmModal";
import { LotteryConfirmModal } from "./components/LotteryConfirmModal";
import { WealthAdjustConfirmModal } from "./components/WealthAdjustConfirmModal";
import { SlackHitConfirmModal } from "./components/SlackHitConfirmModal";
import { LighterBurnConfirmModal } from "./components/LighterBurnConfirmModal";
import { PlayerGameHelp, PlayerSidebarPanel } from "./components/PlayerGameHelp";
import { LeaveGameButton } from "./components/LeaveGameButton";
import { BuffInvestmentSplit } from "./components/BuffInvestmentSplit";
import { useMediaQuery } from "./hooks/useMediaQuery";
import { setPlayerDeferAppReload } from "./bootstrapAppUpdate";
import { PERSONA_IMAGE_SLUGS } from "./config/personaConfig";
import {
  getPersonaDefaultImageSrc,
  getPersonaImageDisplay,
} from "./utils/gameImageDisplay";

const GameOver = lazy(() =>
  import("./views/GameOver").then((m) => ({ default: m.GameOver }))
);

const EMBED_VIEWER_ID = "__admin_board__";

/** 主持预览用空座位：接近玩家刚进本轮时的空表 */
function makeBlankBoardSeat(game: GameState): Player {
  let energy = 0;
  for (const p of game.players) {
    if (p.isAI) continue;
    const spent = Object.values(p.investment ?? {}).reduce(
      (a, b) => a + (Number(b) || 0),
      0
    );
    energy = Math.max(energy, (Number(p.energy) || 0) + spent);
  }
  return {
    id: EMBED_VIEWER_ID,
    name: "观战",
    energy,
    wealth: 0,
    connected: true,
    ready: false,
    rank: 0,
    investment: {},
    longTerm: {},
    inventory: [],
    usedCards: [],
    activeBuffs: [],
    slackedBy: [],
    totalEnergyConsumed: 0,
    wealthHistory: [],
    investedRiskEnergy: 0,
    investedLongEnergy: 0,
    socialRank: null,
  };
}

interface Props {
  game: GameState;
  myPlayerId?: string;
  onExit?: () => void;
  projectImages?: Record<number, number>;
  eraImages?: Record<string, number>;
  buffImages?: Record<string, number>;
  personaImages?: Record<string, number>;
  /** 主持嵌入观战：空座位公共页，不跟真实玩家 */
  embed?: boolean;
  /** 主持查看某玩家只读视角：真实玩家数据，禁止操作 */
  readOnly?: boolean;
  /** 嵌入/预览时不展示右下角玩家私信浮层（主持用独立私信面板） */
  hidePlayerChat?: boolean;
}

export default function GameRoom({
  game,
  myPlayerId,
  onExit,
  projectImages = {},
  eraImages = {},
  buffImages = {},
  personaImages = {},
  embed = false,
  readOnly = false,
  hidePlayerChat = false,
}: Props) {
  const uiLocked = embed || readOnly;
  const [sidebarPanel, setSidebarPanel] = useState<PlayerSidebarPanel>(null);
  const [investmentPrefill, setInvestmentPrefill] = useState<Record<number, number>>({});
  const prefillRoundRef = useRef(game.globalRound);
  const prevInvestmentReadyRef = useRef(false);
  const blankSeat = useMemo(
    () => (embed ? makeBlankBoardSeat(game) : null),
    // 精力随对局更新；其它字段恒空
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [embed, game.players, game.globalRound, game.phase]
  );
  const me = embed
    ? blankSeat
    : game.players.find((p) => p.id === myPlayerId);

  /** 命名/终局前提前预热立绘，避免 lazy 终局首屏才请求被中断 */
  useEffect(() => {
    if (embed) return;
    if (game.phase !== "COMMUNITY_NAMING" && game.phase !== "GAME_OVER") return;
    if (game.phase === "COMMUNITY_NAMING") {
      void import("./views/GameOver");
    }
    for (const slug of PERSONA_IMAGE_SLUGS) {
      const img = new Image();
      img.src = getPersonaDefaultImageSrc(slug);
    }
    const persona = me?.analysisResult?.primaryPersona;
    if (persona) {
      const display = getPersonaImageDisplay(persona, personaImages);
      const img = new Image();
      img.src = display.src;
    }
  }, [embed, game.phase, me?.analysisResult?.primaryPersona, personaImages]);

  useEffect(() => {
    if (embed || readOnly) {
      setPlayerDeferAppReload(false);
      return;
    }
    const defer =
      game.phase === "INVESTMENT" ||
      game.phase === "TUTORIAL" ||
      game.phase === "BUFF_USAGE" ||
      game.phase === "AUCTION";
    setPlayerDeferAppReload(defer);
    return () => setPlayerDeferAppReload(false);
  }, [embed, readOnly, game.phase]);

  /** 第二时代起：投资阶段内分段切换道具 / 投资（默认投资） */
  const useSplit =
    game.currentEra >= 2 &&
    (game.phase === "INVESTMENT" || game.phase === "BUFF_USAGE");

  useEffect(() => {
    if (embed) {
      setInvestmentPrefill({});
      return;
    }
    if (game.phase !== "BUFF_USAGE" && game.phase !== "INVESTMENT") {
      setInvestmentPrefill({});
    }
  }, [embed, game.phase]);

  useEffect(() => {
    if (embed) return;
    if (!myPlayerId) return;
    if (prefillRoundRef.current !== game.globalRound) {
      prefillRoundRef.current = game.globalRound;
      const player = game.players.find((p) => p.id === myPlayerId);
      setInvestmentPrefill(player?.investmentDraft ? { ...player.investmentDraft } : {});
      return;
    }
    const player = game.players.find((p) => p.id === myPlayerId);
    if (!player) return;
    const book =
      typeof player.energy === "number" && Number.isFinite(player.energy) ? player.energy : 0;
    const serverDraft = player.investmentDraft;
    const hasServerDraft = !!serverDraft && Object.keys(serverDraft).length > 0;
    if (!hasServerDraft) {
      if (book < 0) setInvestmentPrefill({});
      return;
    }
    setInvestmentPrefill((prev) => {
      if (Object.keys(prev).length > 0) return prev;
      return { ...serverDraft };
    });
  }, [embed, game.globalRound, game.players, myPlayerId]);

  useEffect(() => {
    if (embed) return;
    const wasReady = prevInvestmentReadyRef.current;
    prevInvestmentReadyRef.current = me?.ready ?? false;
    if (game.phase !== "INVESTMENT" || !wasReady || me?.ready) return;
    const draft = game.players.find((p) => p.id === myPlayerId)?.investmentDraft;
    setInvestmentPrefill(draft ? { ...draft } : {});
  }, [embed, game.phase, me?.ready, game.players, myPlayerId]);

  useEffect(() => {
    if (embed) return;
    if (game.phase !== "INVESTMENT" || me?.ready) return;
    const player = game.players.find((p) => p.id === myPlayerId);
    if (!player) return;
    const book =
      typeof player.energy === "number" && Number.isFinite(player.energy) ? player.energy : 0;
    const draft = player.investmentDraft;
    const hasServerDraft = !!draft && Object.keys(draft).length > 0;
    if (!hasServerDraft) {
      if (book < 0) setInvestmentPrefill({});
      return;
    }
    setInvestmentPrefill((prev) => {
      if (Object.keys(prev).length > 0) return prev;
      return { ...draft };
    });
  }, [embed, game.phase, me?.ready, game.players, myPlayerId]);

  const isDesktopLayout = useMediaQuery("(min-width: 1024px)", true);

  if (!me) {
    return (
      <div className="page-center" style={{ flexDirection: "column", gap: "1rem" }}>
        {onExit && <LeaveGameButton phase={game.phase} onExit={onExit} />}
        <div style={{ fontSize: "3rem" }}>❌</div>
        <div style={{ color: "#f87171", fontWeight: 700 }}>未识别玩家身份，请刷新重试</div>
      </div>
    );
  }

  const isIntro = game.phase === "ERA_INTRO";
  const isRoomWaiting = game.phase === "ROOM_WAITING";
  const showTransactionOverlay =
    !embed && !hidePlayerChat && !isIntro && !isRoomWaiting && game.phase !== "TUTORIAL";

  const renderSplitView = () => (
    <BuffInvestmentSplit
      game={game}
      left={
        <BuffUsage
          game={game}
          me={me}
          buffImages={buffImages}
          hideDock
          readOnly={uiLocked || !!me.ready}
          onOpenBuffHelp={(panel) => setSidebarPanel(panel)}
        />
      }
      right={
        <Investment
          game={game}
          me={me}
          mode="investment"
          projectImages={projectImages}
          draft={investmentPrefill}
          onDraftChange={setInvestmentPrefill}
          hideCountdown
          embed={uiLocked}
        />
      }
    />
  );

  const renderMainView = () => {
    if (useSplit) return renderSplitView();

    switch (game.phase) {
      case "ROOM_WAITING":  return <RoomWaiting game={game} me={me} embed={uiLocked} />;
      case "ERA_INTRO":       return <EraIntro game={game} me={me} eraImages={eraImages} embed={uiLocked} />;
      case "TUTORIAL":        return <TutorialView game={game} me={me} />;
      case "BUFF_USAGE":
        // 遗留阶段：无分屏时仍给投资页，避免卡在旧闸门
        return (
          <Investment
            game={game}
            me={me}
            mode="investment"
            projectImages={projectImages}
            draft={investmentPrefill}
            onDraftChange={setInvestmentPrefill}
            embed={uiLocked}
          />
        );
      case "INVESTMENT":      return (
        <Investment
          game={game}
          me={me}
          mode="investment"
          projectImages={projectImages}
          draft={investmentPrefill}
          onDraftChange={setInvestmentPrefill}
          embed={uiLocked}
        />
      );
      case "SETTLEMENT":      return <Settlement game={game} me={me} embed={uiLocked} />;
      case "AUCTION":         return <AuctionView game={game} me={me} buffImages={buffImages} embed={uiLocked} />;
      case "COMMUNITY_NAMING":return <CommunityNaming game={game} me={me} embed={uiLocked} />;
      case "GAME_OVER":       return (
        <Suspense fallback={<div className="page-center" style={{ minHeight: "40vh", color: "var(--color-text-muted)" }}>加载终局…</div>}>
          <GameOver game={game} me={me} personaImages={personaImages} embed={uiLocked} />
        </Suspense>
      );
      default:
        return (
          <div className="page-center" style={{ minHeight: "100vh", color: "var(--color-text-muted)" }}>
            未知阶段：{game.phase}，请刷新或联系主持
          </div>
        );
    }
  };

  const showHelpSidebar =
    !embed &&
    game.phase !== "TUTORIAL" &&
    game.phase !== "ROOM_WAITING" &&
    (!readOnly || sidebarPanel !== null);
  const helpOverlayOnOpen = isIntro && isDesktopLayout;

  return (
    <div
      style={{
        display: "flex",
        minHeight: embed ? undefined : "100vh",
        width: "100%",
      }}
    >
      {onExit && <LeaveGameButton phase={game.phase} onExit={onExit} />}
      {showHelpSidebar && (
        <PlayerGameHelp
          panel={sidebarPanel}
          onPanelChange={setSidebarPanel}
          game={game}
          me={me}
          overlayWhenOpen={helpOverlayOnOpen}
        />
      )}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          position: "relative",
          ...(embed ? undefined : { minHeight: "100vh" }),
        }}
      >
        {renderMainView()}
        {!embed && showTransactionOverlay && (
          <PlayerChatSystem game={game} me={me} readOnly={readOnly} />
        )}
        {!embed && (
          <>
            <AuctionConfirmModal
              phase={game.phase}
              pending={game.pendingAuctionOffer ?? null}
              pendingOffers={game.myPendingAuctionOffers ?? null}
              wealth={me?.wealth ?? 0}
              readOnly={readOnly}
            />
            <LotteryConfirmModal
              pending={game.pendingLotteryOffer ?? null}
              wealth={me?.wealth ?? 0}
              hasGoldBuff={!!me?.activeBuffs?.some((b) => b.cardId === "buff_gold")}
              readOnly={readOnly}
            />
            <WealthAdjustConfirmModal
              pending={game.pendingWealthAdjustment ?? null}
              wealth={me?.wealth ?? 0}
              readOnly={readOnly}
            />
            <SlackHitConfirmModal hits={me.pendingSlackHits} readOnly={readOnly} />
            <LighterBurnConfirmModal notices={me.pendingLighterBurnNotices} readOnly={readOnly} />
          </>
        )}
      </div>
    </div>
  );
}
