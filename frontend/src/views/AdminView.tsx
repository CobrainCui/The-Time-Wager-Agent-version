import { uiRem } from "../utils/typography";
import React, { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { GameState, Player, Transaction } from "../types";
import { AdminPrivateChatPanel } from "../components/admin/AdminPrivateChatPanel";
import type { GeneratePdfResult } from "../utils/pdfGenerator";
import { AdminPdfCaptureJob, freezeGameForPdfExport } from "../admin/adminPdfSnapshot";
import { socket } from "../socket";
import { adminApiUrl, adminAuthHeaders } from "../admin/adminFetch";
import {
  findAuctionDealForSession,
  getAuctionCardsForEra,
  getAuctionRound,
  BUFF_CARD_DEFS,
} from "../config/buffCards";
import { FATE_SKETCH_PERSONA_COLORS } from "../config/personaConfig";
import { AdminTutorialHostSection } from "../components/admin/AdminTutorialHostSection";
import { GavelIcon } from "../components/icons/GavelIcon";
import { isAiPlayer } from "../utils/isAiPlayer";
import { useActionCountdown } from "../hooks/useActionCountdown";
import { useServerClockSkewRef } from "../hooks/useServerClockSkewRef";
import { getRemainingMs, getRemainingSeconds } from "../utils/actionCountdown";
import { formatInvestmentDeadlineClock } from "../utils/investmentDeadline";
import { playerAvailableWealth } from "../utils/availableWealth";
import {
  archiveLoadIncomplete,
  mergeTransactionLog,
  oldestTransactionCursor,
  sortedTransactionsFromMap,
} from "../utils/transactionLogMerge";
import { filterGameForPlayerView } from "../utils/filterGameForPlayerView";
import { PLAYER_GROUP_CHAT_ENABLED } from "../config/playerChatFeatures";
import { visibleTransactionsForViewer } from "../utils/transactionVisibility";
import { AdminSectionPerspectiveSelect } from "../components/admin/AdminSectionPerspectiveSelect";
import { AdminProjectAdjustPanel } from "../components/admin/AdminProjectAdjustPanel";
import GameRoom from "../GameRoom";
import { BuffDescText } from "../utils/buffDescEmphasis";

const AdminPlayerPdfCapture = lazy(() =>
  import("../admin/AdminPlayerPdfCapture").then((m) => ({ default: m.AdminPlayerPdfCapture }))
);

const CARD_NAME_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(BUFF_CARD_DEFS).map(([id, d]) => [id, d.name])
);

interface Props {
  game: GameState;
  onExit?: () => void;
  projectImages?: Record<number, number>;
  eraImages?: Record<string, number>;
  buffImages?: Record<string, number>;
  personaImages?: Record<string, number>;
}

const PHASE_NAMES: Record<string, string> = {
  ROOM_WAITING: "等候开局",
  ERA_INTRO: "时代介绍", TUTORIAL: "新手教程",
  INVESTMENT: "投资与道具", BUFF_USAGE: "投资与道具(旧)", SETTLEMENT: "本轮结算",
  AUCTION: "拍卖会", GAME_OVER: "游戏结束", COMMUNITY_NAMING: "社区命名",
};

export const AdminView: React.FC<Props> = ({
  game,
  onExit,
  projectImages = {},
  eraImages = {},
  buffImages = {},
  personaImages = {},
}) => {
  const timerPausedAt = game.investmentTimerPausedAt;
  const timerPaused = typeof timerPausedAt === "number";
  const showAdminTimer = game.phase === "INVESTMENT" && !!game.investmentEndsAt;
  const timeLeft = useActionCountdown(
    showAdminTimer,
    game.investmentEndsAt,
    game.serverNow,
    timerPausedAt
  );
  const clockSkewRef = useServerClockSkewRef(game.serverNow);
  const [communityNameDraft, setCommunityNameDraft] = useState("");
  const [unlockingPlayerId, setUnlockingPlayerId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  /** 浏览器常拦截同一次点击的第二次下载：先 JSON，再点一次导出 Excel */
  const [exportAwaitingXlsx, setExportAwaitingXlsx] = useState(false);
  const [exportHint, setExportHint] = useState<string | null>(null);
  const [pdfJob, setPdfJob] = useState<AdminPdfCaptureJob | null>(null);
  const [pdfExporting, setPdfExporting] = useState(false);
  const [pdfBatchProgress, setPdfBatchProgress] = useState<string | null>(null);
  const [pdfFeedback, setPdfFeedback] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [cardAdjustUi, setCardAdjustUi] = useState<{
    playerId: string;
    playerName: string;
  } | null>(null);
  const [cardAdjustPick, setCardAdjustPick] = useState<string | null>(null);
  /** 玩家界面预览：空=公共空座位总览 */
  const [uiViewAsPlayerId, setUiViewAsPlayerId] = useState("");
  /** 私信面板：空=全桌 */
  const [dmViewAsPlayerId, setDmViewAsPlayerId] = useState("");
  const dmViewAsPlayerIdRef = useRef("");
  dmViewAsPlayerIdRef.current = dmViewAsPlayerId;
  const [adminDmTxTotal, setAdminDmTxTotal] = useState(0);
  const adminTxMergeRef = useRef<Map<string, Transaction>>(new Map());
  const [adminTxList, setAdminTxList] = useState<Transaction[]>([]);
  const [adminTxTotal, setAdminTxTotal] = useState(0);
  const [adminTxLoadingOlder, setAdminTxLoadingOlder] = useState(false);
  const [adminTxAtBottom, setAdminTxAtBottom] = useState(true);
  const adminTxScrollRef = useRef<HTMLDivElement>(null);
  const adminTxLoadingOlderRef = useRef(false);
  const adminTxRestoreScrollRef = useRef<{ height: number; top: number } | null>(null);
  const pdfExportResolverRef = useRef<((result: GeneratePdfResult) => void) | null>(null);
  const gameRef = useRef(game);
  gameRef.current = game;

  const humanPlayers = [...game.players]
    .filter((p) => !isAiPlayer(p))
    .sort((a, b) => b.wealth - a.wealth);

  useEffect(() => {
    adminTxMergeRef.current = new Map();
    setAdminTxList([]);
    setAdminTxTotal(0);
    setAdminTxAtBottom(true);
    adminTxLoadingOlderRef.current = false;
    setAdminTxLoadingOlder(false);
    adminTxRestoreScrollRef.current = null;
    setUiViewAsPlayerId("");
    setDmViewAsPlayerId("");
    setAdminDmTxTotal(0);
  }, [game.roomId]);

  useEffect(() => {
    if (!dmViewAsPlayerId) return;
    const visible = visibleTransactionsForViewer(
      sortedTransactionsFromMap(adminTxMergeRef.current),
      dmViewAsPlayerId,
      false
    );
    setAdminDmTxTotal((prev) => Math.max(prev, visible.length));
  }, [dmViewAsPlayerId, game.transactions, game.transactionLog]);

  useEffect(() => {
    const merged = mergeTransactionLog(adminTxMergeRef.current, game.transactions ?? []);
    adminTxMergeRef.current = merged;
    setAdminTxList(sortedTransactionsFromMap(merged));
    if (typeof game.transactionLog?.total === "number") {
      setAdminTxTotal(game.transactionLog.total);
    } else {
      setAdminTxTotal(merged.size);
    }
  }, [game.transactions, game.transactionLog]);

  useEffect(() => {
    const onPage = (payload: {
      roomId?: string;
      transactions?: Transaction[];
      hasMore?: boolean;
      total?: number;
    }) => {
      if (payload.roomId !== game.roomId) return;
      const merged = mergeTransactionLog(adminTxMergeRef.current, payload.transactions ?? []);
      adminTxMergeRef.current = merged;
      const sorted = sortedTransactionsFromMap(merged);
      setAdminTxList(sorted);
      if (typeof payload.total === "number") {
        if (dmViewAsPlayerIdRef.current) setAdminDmTxTotal(payload.total);
        else setAdminTxTotal(payload.total);
      }
      adminTxLoadingOlderRef.current = false;
      setAdminTxLoadingOlder(false);
    };
    const onError = () => {
      if (!adminTxLoadingOlderRef.current) return;
      adminTxLoadingOlderRef.current = false;
      setAdminTxLoadingOlder(false);
      adminTxRestoreScrollRef.current = null;
    };
    socket.on("transactionHistoryPage", onPage);
    socket.on("error", onError);
    return () => {
      socket.off("transactionHistoryPage", onPage);
      socket.off("error", onError);
    };
  }, [game.roomId]);

  useEffect(() => {
    if (!adminTxLoadingOlder) return;
    const t = window.setTimeout(() => {
      if (!adminTxLoadingOlderRef.current) return;
      adminTxLoadingOlderRef.current = false;
      setAdminTxLoadingOlder(false);
      adminTxRestoreScrollRef.current = null;
    }, 20_000);
    return () => window.clearTimeout(t);
  }, [adminTxLoadingOlder]);

  useLayoutEffect(() => {
    const el = adminTxScrollRef.current;
    const saved = adminTxRestoreScrollRef.current;
    if (!el || !saved) return;
    const delta = el.scrollHeight - saved.height;
    el.scrollTop = saved.top + delta;
    adminTxRestoreScrollRef.current = null;
  }, [adminTxList]);

  useEffect(() => {
    if (!adminTxAtBottom) return;
    const el = adminTxScrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [adminTxList, adminTxAtBottom]);

  const loadOlderAdminTransactions = useCallback(() => {
    if (adminTxLoadingOlderRef.current) return;
    const cursor = oldestTransactionCursor(adminTxList);
    if (!cursor) return;
    const el = adminTxScrollRef.current;
    if (el) {
      adminTxRestoreScrollRef.current = { height: el.scrollHeight, top: el.scrollTop };
    }
    adminTxLoadingOlderRef.current = true;
    setAdminTxLoadingOlder(true);
    socket.emit("fetchTransactionHistory", {
      roomId: gameRef.current.roomId,
      beforeTimestamp: cursor.timestamp,
      beforeId: cursor.id,
      limit: 80,
      ...(dmViewAsPlayerIdRef.current
        ? { viewAsPlayerId: dmViewAsPlayerIdRef.current }
        : {}),
    });
  }, [adminTxList]);

  const pendingDeviceClaimPlayerIds = useMemo(
    () => new Set((game.pendingDeviceClaims ?? []).map((c) => c.playerId)),
    [game.pendingDeviceClaims]
  );

  /** 与 endsAt/serverNow/pausedAt 直接计算，不依赖 countdown hook 首帧 0 */
  const unlockRemainingSeconds =
    game.phase === "INVESTMENT" && typeof game.investmentEndsAt === "number"
      ? getRemainingSeconds(game.investmentEndsAt, clockSkewRef.current, timerPausedAt)
      : 0;
  const investmentUnlockOpen = unlockRemainingSeconds > 0;
  const lockedHumanCount = humanPlayers.filter((p) => p.ready).length;

  /** 与 investmentUnlockOpen 同源：含暂停冻结剩余 */
  const canUnlockInvestmentNow = () =>
    game.phase === "INVESTMENT" &&
    typeof game.investmentEndsAt === "number" &&
    getRemainingMs(game.investmentEndsAt, clockSkewRef.current, timerPausedAt) > 0;

  useEffect(() => {
    if (!unlockingPlayerId) return;
    const target = game.players.find((p) => p.id === unlockingPlayerId);
    if (!target || !target.ready || game.phase !== "INVESTMENT") {
      setUnlockingPlayerId(null);
      return;
    }
    // 失败时玩家仍 ready，用超时解开按钮防抖
    const t = window.setTimeout(() => setUnlockingPlayerId(null), 4000);
    return () => window.clearTimeout(t);
  }, [game.players, game.phase, unlockingPlayerId]);

  const reportPlayers = [...game.players]
    .filter((p) => !!p.analysisResult)
    .sort((a, b) => b.wealth - a.wealth);

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const reportsAvailable = game.phase === "GAME_OVER" && reportPlayers.length > 0;

  const handlePdfCaptureComplete = useCallback((result: GeneratePdfResult) => {
    setPdfJob(null);
    pdfExportResolverRef.current?.(result);
    pdfExportResolverRef.current = null;
  }, []);

  const runPlayerPdfExport = useCallback((player: Player): Promise<GeneratePdfResult> => {
    if (!player.analysisResult) {
      return Promise.resolve({ ok: false, message: "该玩家尚无人格分析数据" });
    }
    return new Promise((resolve) => {
      if (pdfExportResolverRef.current) {
        resolve({ ok: false, message: "正在生成其他报告，请稍候" });
        return;
      }
      pdfExportResolverRef.current = resolve;
      setPdfJob(freezeGameForPdfExport(gameRef.current, player));
    });
  }, []);

  const handleExportPlayerReport = async (player: Player) => {
    setPdfFeedback(null);
    setPdfExporting(true);
    try {
      const result = await runPlayerPdfExport(player);
      if (!result.ok) {
        setPdfFeedback({ type: "err", text: result.message });
      } else {
        const warn = result.warnings?.length ? `（${result.warnings.join("；")}）` : "";
        setPdfFeedback({ type: "ok", text: `已下载：${result.fileName}${warn}` });
      }
    } finally {
      setPdfExporting(false);
    }
  };

  const handleExportAllPlayerReports = async () => {
    const targets = [...game.players]
      .filter((p) => !!p.analysisResult)
      .sort((a, b) => b.wealth - a.wealth);
    if (targets.length === 0) {
      setPdfFeedback({
        type: "err",
        text: "暂无可导出的报告：请等待首富完成社区命名并进入「游戏结束」阶段。",
      });
      return;
    }
    if (!window.confirm(`将为 ${targets.length} 名玩家依次生成并下载《人生决策手册》PDF，是否继续？`)) {
      return;
    }
    setPdfFeedback(null);
    setPdfExporting(true);
    const failures: string[] = [];
    let success = 0;
    try {
      for (let i = 0; i < targets.length; i++) {
        const p = targets[i];
        setPdfBatchProgress(`正在生成 ${i + 1} / ${targets.length}：${p.name}`);
        const result = await runPlayerPdfExport(p);
        if (!result.ok) failures.push(`${p.name}: ${result.message}`);
        else {
          success += 1;
          await sleep(400);
        }
      }
      if (failures.length > 0) {
        setPdfFeedback({
          type: "err",
          text: `完成 ${success} 份，失败 ${failures.length} 份：${failures.join("；")}`,
        });
      } else {
        setPdfFeedback({ type: "ok", text: `已全部下载 ${success} 份玩家报告。` });
      }
    } finally {
      setPdfBatchProgress(null);
      setPdfExporting(false);
    }
  };

  const emit = (event: string, extra?: object) => socket.emit(event, { roomId: game.roomId, ...extra });

  const scrollAdminTxToLatest = useCallback(() => {
    const el = adminTxScrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    setAdminTxAtBottom(true);
  }, []);

  const onAdminTxMessageScroll = useCallback(() => {
    const el = adminTxScrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
    setAdminTxAtBottom(atBottom);
  }, []);

  const adminDirectAsTx = useMemo<Transaction[]>(() => {
    return (game.directMessages ?? []).map((m) => ({
      id: m.id,
      fromId: m.fromId,
      fromName: m.fromName,
      toId: m.toId,
      toName: m.toName,
      amount: 0,
      note: m.text,
      status: "accepted" as const,
      timestamp: m.timestamp,
    }));
  }, [game.directMessages]);

  const adminTxDisplayList = useMemo(() => {
    const merged = [...adminTxList, ...adminDirectAsTx]
      .filter((t, i, arr) => arr.findIndex((x) => x.id === t.id) === i)
      .sort((a, b) => a.timestamp - b.timestamp);
    if (!dmViewAsPlayerId) return merged;
    return merged.filter(
      (t) => t.fromId === dmViewAsPlayerId || t.toId === dmViewAsPlayerId
    );
  }, [adminTxList, adminDirectAsTx, dmViewAsPlayerId]);

  const adminChatGroups = useMemo(() => {
    if (!PLAYER_GROUP_CHAT_ENABLED) return [];
    const groups = game.chatGroups ?? [];
    if (!dmViewAsPlayerId) return groups;
    return groups.filter((g) => g.memberIds.includes(dmViewAsPlayerId));
  }, [game.chatGroups, dmViewAsPlayerId]);

  const adminGroupMessages = useMemo(() => {
    if (!PLAYER_GROUP_CHAT_ENABLED) return [];
    const visibleIds = new Set(adminChatGroups.map((g) => g.id));
    return (game.groupMessages ?? []).filter((m) => visibleIds.has(m.groupId));
  }, [game.groupMessages, adminChatGroups]);

  const showAdminLoadOlder = archiveLoadIncomplete(
    dmViewAsPlayerId ? adminTxDisplayList.length : adminTxList.length,
    dmViewAsPlayerId ? adminDmTxTotal : adminTxTotal
  );

  const playerPreviewGame = useMemo(() => {
    if (!uiViewAsPlayerId) return game;
    return filterGameForPlayerView(game, uiViewAsPlayerId);
  }, [game, uiViewAsPlayerId]);

  const uiPerspectivePlayer = uiViewAsPlayerId
    ? humanPlayers.find((p) => p.id === uiViewAsPlayerId)
    : null;

  const handleRevokeAuctionCard = (
    cardId: string,
    displayName: string,
    mode: "pending" | "completed"
  ) => {
    if (game.phase !== "AUCTION") {
      alert("仅本场拍卖环节可撤回");
      return;
    }
    const deal = findAuctionDealForSession(
      game.auctionCompletedDeals,
      cardId,
      game.currentEra,
      game.auctionDistributedCardIds ?? []
    );
    const message =
      mode === "pending"
        ? `撤回「${displayName}」的待确认报价？\n玩家将不再看到该确认弹窗，可重新发放。`
        : deal?.cost === 0
          ? `撤回「${displayName}」的强买成交？\n将收回该卡，并把【强买强卖】退回使用者，之后可以再使用。`
          : deal
            ? `撤回「${displayName}」的成交？\n将收回玩家手牌、退还 ${deal.cost} 财富，之后可重新发放。`
            : `撤回「${displayName}」的成交？\n将收回持卡人手牌并重新开放发放（无成交明细，不自动退款）。`;
    if (!window.confirm(message)) return;
    emit("adminRevokeAuctionCard", { cardId });
  };

  const handleSocialRate = (playerId: string, rank: string) => {
    if (!rank) return;
    emit("adminRateSocial", { targetPlayerId: playerId, rank });
  };

  const handleSettleLottery = (playerId: string, playerName: string) => {
    const amount = prompt("请输入彩票中奖金额（可负）:", "0");
    if (amount === null) return;
    const parsed = Number(String(amount).trim());
    if (!Number.isSafeInteger(parsed)) {
      alert("开奖金额必须为整数");
      return;
    }
    const target = game.players.find((p) => p.id === playerId);
    const goldApplied = !!target?.activeBuffs?.some((b) => b.cardId === "buff_gold") && parsed > 0;
    const credited = goldApplied ? Math.floor(parsed * 1.5) : parsed;
    const amountLabel = goldApplied
      ? `（${parsed}）的 1.5 倍 = ${credited} 财富（点石成金，向下取整）`
      : `${parsed} 财富`;
    if (!window.confirm(`向 ${playerName} 发送彩票开奖确认：${amountLabel}？\n确认后才会入账。`)) return;
    emit("adminSettleLottery", { targetPlayerId: playerId, amount: parsed });
  };

  const handleRevokeLottery = (
    playerId: string,
    playerName: string,
    mode: "pending" | "completed"
  ) => {
    const message =
      mode === "pending"
        ? `撤回 ${playerName} 的彩票待确认开奖？\n玩家将不再看到该确认弹窗，可重新开奖。`
        : `撤回 ${playerName} 的彩票开奖？\n将回滚已发放的财富并恢复彩票状态，之后可重新开奖。`;
    if (!window.confirm(message)) return;
    emit("adminRevokeLottery", { targetPlayerId: playerId });
  };

  const handleAdjustWealth = (playerId: string, playerName: string, currentWealth: number) => {
    const raw = prompt("调整金额（正数加钱，负数扣钱）:", "10");
    if (raw === null) return;
    const delta = Number(String(raw).trim());
    if (!Number.isSafeInteger(delta) || delta === 0) {
      alert("调整金额须为非零整数");
      return;
    }
    if (!Number.isSafeInteger(currentWealth + delta)) {
      alert("调整后财富超出范围");
      return;
    }
    const signed = delta > 0 ? `+${delta}` : String(delta);
    if (
      !window.confirm(
        `向 ${playerName} 发送财富调整确认：${currentWealth} ${signed} → ${currentWealth + delta}？\n玩家确认后才会入账。`
      )
    ) {
      return;
    }
    emit("adminAdjustWealth", { targetPlayerId: playerId, delta });
  };

  const handleRevokeWealthAdjust = (playerId: string, playerName: string) => {
    if (
      !window.confirm(
        `撤回 ${playerName} 的财富调整待确认？\n玩家将不再看到该确认弹窗，可重新发起。`
      )
    ) {
      return;
    }
    emit("adminRevokeWealthAdjust", { targetPlayerId: playerId });
  };

  const closeCardAdjustModal = () => {
    setCardAdjustUi(null);
    setCardAdjustPick(null);
  };

  const openCardAddModal = (playerId: string, playerName: string) => {
    setCardAdjustUi({ playerId, playerName });
    setCardAdjustPick(null);
  };

  const handleRemoveCardAt = (
    playerId: string,
    playerName: string,
    inventoryIndex: number,
    cardId: string
  ) => {
    const live = gameRef.current.players.find((p) => p.id === playerId);
    const liveId = live?.inventory?.[inventoryIndex];
    if (!liveId) {
      alert("手牌已变化，请重试");
      return;
    }
    if (liveId !== cardId) {
      alert("手牌已变化，请重试");
      return;
    }
    const cardName = CARD_NAME_MAP[liveId] || liveId;
    const message = `从 ${playerName} 收回「${cardName}」？\n只收回这一张未使用手牌，不退款、不重新上拍。`;
    if (!window.confirm(message)) return;
    emit("adminAdjustPlayerCard", {
      targetPlayerId: playerId,
      cardId: liveId,
      action: "remove",
      inventoryIndex,
    });
  };

  const confirmCardAdjust = () => {
    if (!cardAdjustUi || !cardAdjustPick) return;
    const cardName = CARD_NAME_MAP[cardAdjustPick] || cardAdjustPick;
    const message = `补发「${cardName}」给 ${cardAdjustUi.playerName}？\n补发到手牌，不扣财富，拍卖池不变。`;
    if (!window.confirm(message)) return;
    emit("adminAdjustPlayerCard", {
      targetPlayerId: cardAdjustUi.playerId,
      cardId: cardAdjustPick,
      action: "add",
    });
    closeCardAdjustModal();
  };

  useEffect(() => {
    if (!cardAdjustUi) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeCardAdjustModal();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cardAdjustUi]);

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const fetchSessionExport = async (format: "json" | "xlsx"): Promise<Blob | null> => {
    const q = `roomId=${encodeURIComponent(game.roomId)}`;
    const expectedType =
      format === "json"
        ? "application/json"
        : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    const res = await fetch(adminApiUrl(`/api/session-export?${q}&format=${format}`), {
      headers: adminAuthHeaders(),
    });
    if (res.status === 401) {
      alert("未授权：请重新登录管理后台");
      return null;
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(`导出失败 (${format}): ${(err as { error?: string }).error ?? res.statusText}`);
      return null;
    }
    const ct = res.headers.get("Content-Type") ?? "";
    if (!ct.includes(expectedType)) {
      alert(`导出失败 (${format})：服务器返回了非预期类型，请检查登录状态或房间是否仍存在`);
      return null;
    }
    return res.blob();
  };

  useEffect(() => {
    setExportAwaitingXlsx(false);
    setExportHint(null);
  }, [game.roomId]);

  const handleExportData = async () => {
    if (exporting) return;
    if (
      !exportAwaitingXlsx &&
      game.phase !== "GAME_OVER" &&
      game.phase !== "COMMUNITY_NAMING" &&
      !window.confirm("本局尚未结束，导出数据可能不完整。是否继续？")
    ) {
      return;
    }
    setExporting(true);
    const base = game.roomId.replace(/[^\w\u4e00-\u9fa5-]+/g, "_").slice(0, 64) || "room";
    try {
      if (!exportAwaitingXlsx) {
        const jsonBlob = await fetchSessionExport("json");
        if (!jsonBlob) return;
        downloadBlob(jsonBlob, `${base}_session.json`);
        setExportAwaitingXlsx(true);
        setExportHint("已下载 JSON。浏览器常拦截同一次点击的第二个文件，请再点一次导出 Excel。");
        return;
      }

      const xlsxBlob = await fetchSessionExport("xlsx");
      if (!xlsxBlob) return;
      downloadBlob(xlsxBlob, `${base}_session.xlsx`);
      setExportAwaitingXlsx(false);
      setExportHint("已下载 JSON 与 Excel 两份复盘文件。");
    } catch (e) {
      console.error(e);
      alert("导出出错，请检查网络与服务器状态");
    } finally {
      setExporting(false);
    }
  };

  const auctionRound = getAuctionRound(game.currentEra);
  const currentAuctionCards = getAuctionCardsForEra(game.currentEra);
  const distributedSet = new Set(game.auctionDistributedCardIds || []);
  const auctionDealByCardId = new Map(
    currentAuctionCards
      .map((card) => {
        const deal = findAuctionDealForSession(
          game.auctionCompletedDeals,
          card.id,
          game.currentEra,
          [...distributedSet]
        );
        return deal ? ([card.id, deal] as const) : null;
      })
      .filter((e): e is [string, NonNullable<typeof e>[1]] => e != null)
  );
  const playerNameById = new Map(game.players.map((p) => [p.id, p.name] as const));
  const focusId = game.auctionFocusCardId;
  const currentBid = game.auctionCurrentBid ?? 0;
  const highBidderId = game.auctionHighBidderId ?? null;
  const highBidderName = game.auctionHighBidderName;
  const highBidId = game.auctionHighBidId ?? null;
  const bidHistory = game.auctionBidHistory ?? [];
  const allBids = game.auctionBids ?? [];
  const focusDef = focusId ? BUFF_CARD_DEFS[focusId] : null;
  const highBidderPlayer = highBidderId
    ? game.players.find((p) => p.id === highBidderId)
    : undefined;
  const highBidderSpendable = highBidderPlayer
    ? playerAvailableWealth(game, highBidderPlayer, { exceptOwnLeading: true })
    : 0;
  const highBidderCanPay = !!highBidderPlayer && currentBid > 0 && currentBid <= highBidderSpendable;

  const mins = Math.floor(timeLeft / 60);
  const secs = (timeLeft % 60).toString().padStart(2, "0");
  const isUrgent = timeLeft < 60 && timeLeft > 0;

  return (
    <div className="admin-view" style={{ minHeight: "100vh", background: "#070b14", color: "white", fontFamily: "var(--font-sans)" }}>
      {/* 顶部控制栏 */}
      <div
        style={{
          background: "rgba(245,158,11,0.06)",
          borderBottom: "1px solid rgba(245,158,11,0.2)",
          padding: "1rem 1.5rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "1rem",
          position: "sticky",
          top: 0,
          zIndex: 40,
          backdropFilter: "blur(16px)",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <h1 style={{ fontSize: "1.2rem", fontWeight: 800, color: "#fbbf24" }}>👑 上帝控制台</h1>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: uiRem(0.8), color: "var(--color-text-muted)" }}>
              Room: {game.roomId}
            </span>
            {game.experiment && (
              <span style={{ fontFamily: "var(--font-mono)", fontSize: uiRem(0.72), color: "#a78bfa" }}>
                条件 {game.experiment.condition ?? "ad-hoc"} · seed {game.seed ?? "—"} · run {game.experiment.runId?.slice(0, 18) ?? "—"}
              </span>
            )}
          </div>
          <div style={{ display: "flex", gap: "1rem", alignItems: "center", marginTop: "0.25rem", flexWrap: "wrap", fontSize: uiRem(0.8) }}>
            <span>
              阶段:{" "}
              <span style={{ color: "#60a5fa", fontWeight: 700 }}>
                {PHASE_NAMES[game.phase] || game.phase}
              </span>
              {game.phase === "TUTORIAL" && (
                <span style={{ color: "var(--color-text-muted)", fontWeight: 500, marginLeft: "0.5rem" }}>
                  · 请在下方同步面板控场
                </span>
              )}
            </span>
            <span style={{ color: "var(--color-text-muted)" }}>Era {game.currentEra} · R{game.roundInEra}</span>
            {game.phase === "INVESTMENT" && humanPlayers.length > 0 && (
              <span style={{ color: lockedHumanCount === humanPlayers.length ? "#34d399" : "#fbbf24" }}>
                已锁定 {lockedHumanCount}/{humanPlayers.length}
              </span>
            )}
            {showAdminTimer && (
              <>
                <span
                  className="action-countdown-chip"
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontWeight: 700,
                    color: timerPaused ? "#fbbf24" : isUrgent ? "#ef4444" : "#34d399",
                    background: timerPaused
                      ? "#2a2210"
                      : isUrgent
                        ? "#321414"
                        : "#102218",
                    padding: "0.15rem 0.6rem",
                    borderRadius: "0.375rem",
                    border: `1px solid ${
                      timerPaused
                        ? "rgba(251,191,36,0.45)"
                        : isUrgent
                          ? "rgba(239,68,68,0.55)"
                          : "rgba(52,211,153,0.4)"
                    }`,
                    animation:
                      !timerPaused && isUrgent
                        ? "countdown-urgent 1s ease-in-out infinite"
                        : undefined,
                    isolation: "isolate",
                  }}
                >
                  ⏱ {mins}:{secs}
                  {timerPaused ? " 已暂停" : ""}
                </span>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() =>
                    emit("adminInvestmentTimer", { action: timerPaused ? "resume" : "pause" })
                  }
                  style={{ padding: "0.15rem 0.55rem", fontSize: uiRem(0.75) }}
                >
                  {timerPaused ? "继续" : "暂停"}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    if (
                      confirm(
                        `重置投资倒计时为 ${formatInvestmentDeadlineClock(game)}？`
                      )
                    ) {
                      emit("adminInvestmentTimer", { action: "reset" });
                    }
                  }}
                  style={{ padding: "0.15rem 0.55rem", fontSize: uiRem(0.75) }}
                >
                  重置
                </button>
              </>
            )}
          </div>
        </div>

        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          {(game.phase === "ROOM_WAITING" || game.phase === "ERA_INTRO") && (
            <>
              <button className="btn btn-primary btn-sm" onClick={() => emit("adminStartTutorial")}>🎓 教程</button>
              <button
                className="btn btn-success btn-sm"
                onClick={() => {
                  if (confirm(game.phase === "ROOM_WAITING" ? "确认开局并进入第 1 时代？" : "确认强制进入投资阶段？")) {
                    emit("adminStartGame");
                  }
                }}
              >
                ▶ 开局
              </button>
            </>
          )}
          {game.phase === "AUCTION" ? (
            <button
              type="button"
              className="btn btn-purple btn-sm animate-pulse"
              style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}
              onClick={() => {
                if (confirm("结束拍卖并进入下一阶段？")) emit("adminEndAuction");
              }}
            >
              <GavelIcon size={16} decorative style={{ color: "inherit" }} />
              结束拍卖
            </button>
          ) : (
            <button className="btn btn-sm" style={{ background: "rgba(168,85,247,0.15)", border: "1px solid rgba(168,85,247,0.4)", color: "#c084fc", display: "inline-flex", alignItems: "center", gap: "0.35rem" }} onClick={() => { if (confirm("开启拍卖阶段？")) emit("adminSkipPhase", { targetPhase: "AUCTION" }); }}><GavelIcon size={16} decorative style={{ color: "inherit" }} /> 拍卖</button>
          )}
          {game.phase === "COMMUNITY_NAMING" && (
            <form
              style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}
              onSubmit={(e) => {
                e.preventDefault();
                const name = communityNameDraft.trim();
                if (!name) return;
                emit("adminSubmitCommunityName", { name });
                setCommunityNameDraft("");
              }}
            >
              <input
                className="input"
                value={communityNameDraft}
                maxLength={20}
                placeholder="代为命名"
                onChange={(e) => setCommunityNameDraft(e.target.value)}
                style={{ width: "9rem", padding: "0.35rem 0.6rem" }}
              />
              <button type="submit" className="btn btn-gold btn-sm" disabled={!communityNameDraft.trim()}>
                代命名
              </button>
            </form>
          )}
          {game.phase !== "ERA_INTRO" && game.phase !== "TUTORIAL" && game.phase !== "ROOM_WAITING" && (
            <button className="btn btn-sm" style={{ background: "rgba(249,115,22,0.15)", border: "1px solid rgba(249,115,22,0.35)", color: "#fb923c" }} onClick={() => { if (confirm(`跳过 [${game.phase}]？`)) emit("adminSkipPhase"); }}>⏭ 跳过</button>
          )}
          <button
            type="button"
            className="btn btn-sm"
            style={{ background: "rgba(59,130,246,0.15)", border: "1px solid rgba(59,130,246,0.4)", color: "#93c5fd" }}
            onClick={handleExportData}
            disabled={exporting}
            title={
              exportAwaitingXlsx
                ? "继续下载 Excel（.xlsx）"
                : "先下载 JSON，再点一次下载 Excel，避免浏览器拦截双文件"
            }
          >
            {exporting
              ? "导出中…"
              : exportAwaitingXlsx
                ? "📥 继续导出 Excel"
                : "📥 导出数据"}
          </button>
          {reportsAvailable && (
            <button
              type="button"
              className="btn btn-sm"
              style={{
                background: "rgba(245,158,11,0.15)",
                border: "1px solid rgba(245,158,11,0.45)",
                color: "#fcd34d",
              }}
              onClick={handleExportAllPlayerReports}
              disabled={pdfExporting}
            >
              {pdfBatchProgress ?? (pdfExporting ? "报告生成中…" : "📄 导出全部玩家报告")}
            </button>
          )}
          <button className="btn btn-danger btn-sm" onClick={() => { if (confirm("警告：解散房间？")) emit("adminDissolveRoom"); }}>💣 解散</button>
          <button className="btn btn-ghost btn-sm" onClick={onExit}>← 返回</button>
        </div>
      </div>

      <div style={{ padding: "1.5rem", maxWidth: "1400px", margin: "0 auto" }}>

        {exportHint && (
          <div
            role="status"
            style={{
              background: exportAwaitingXlsx ? "rgba(59,130,246,0.1)" : "rgba(34,197,94,0.08)",
              border: exportAwaitingXlsx
                ? "1px solid rgba(59,130,246,0.35)"
                : "1px solid rgba(34,197,94,0.3)",
              borderRadius: "0.75rem",
              padding: "0.75rem 1rem",
              marginBottom: "1rem",
              color: exportAwaitingXlsx ? "#93c5fd" : "#86efac",
              fontSize: uiRem(0.85),
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "0.75rem",
              flexWrap: "wrap",
            }}
          >
            <span>{exportHint}</span>
            {!exportAwaitingXlsx && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setExportHint(null)}
                style={{ flexShrink: 0 }}
              >
                知道了
              </button>
            )}
          </div>
        )}

        {reportsAvailable && (
          <div
            style={{
              background: "rgba(245,158,11,0.06)",
              border: "1px solid rgba(245,158,11,0.25)",
              borderRadius: "1rem",
              padding: "1.25rem",
              marginBottom: "1.5rem",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "0.75rem",
                marginBottom: "1rem",
              }}
            >
              <div>
                <h2 style={{ margin: 0, fontSize: uiRem(1.05), fontWeight: 800, color: "#fbbf24" }}>
                  终局玩家报告
                </h2>
                <p
                  style={{
                    margin: "0.35rem 0 0",
                    fontSize: uiRem(0.8),
                    color: "var(--color-text-secondary)",
                    lineHeight: 1.5,
                  }}
                >
                  与玩家端相同的《人生决策手册》PDF，可逐人或批量下载。
                </p>
              </div>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={handleExportAllPlayerReports}
                disabled={pdfExporting}
              >
                {pdfBatchProgress ?? (pdfExporting ? "生成中…" : "导出全部")}
              </button>
            </div>
            {(pdfBatchProgress || pdfFeedback) && (
              <p
                style={{
                  margin: "0 0 0.75rem",
                  fontSize: uiRem(0.8),
                  color: pdfFeedback?.type === "err" ? "#fca5a5" : "#6ee7b7",
                  lineHeight: 1.5,
                }}
              >
                {pdfBatchProgress ?? pdfFeedback?.text}
              </p>
            )}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                gap: "0.75rem",
              }}
            >
              {reportPlayers.map((p) => (
                <div
                  key={p.id}
                  style={{
                    background: "rgba(0,0,0,0.25)",
                    border: "1px solid rgba(245,158,11,0.2)",
                    borderRadius: "0.75rem",
                    padding: "0.875rem 1rem",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "0.5rem",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: uiRem(0.9) }}>
                      {p.name}
                      {isAiPlayer(p) ? (
                        <span style={{ color: "var(--color-text-muted)", fontWeight: 500 }}> · AI</span>
                      ) : null}
                    </div>
                    {p.analysisResult && (
                      <div
                        style={{
                          fontSize: uiRem(0.72),
                          color: FATE_SKETCH_PERSONA_COLORS[p.analysisResult.primaryPersona] || "#60a5fa",
                          marginTop: "0.2rem",
                        }}
                      >
                        {p.analysisResult.primaryPersona}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={pdfExporting}
                    onClick={() => handleExportPlayerReport(p)}
                  >
                    PDF
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
        {game.phase === "GAME_OVER" && reportPlayers.length === 0 && (
          <div
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px dashed var(--color-border)",
              borderRadius: "1rem",
              padding: "1rem 1.25rem",
              marginBottom: "1.5rem",
              fontSize: uiRem(0.85),
              color: "var(--color-text-muted)",
            }}
          >
            终局报告将在首富完成社区命名、人格分析生成后可用。
          </div>
        )}

        {game.phase === "TUTORIAL" && (
          <AdminTutorialHostSection
            game={game}
            onPrev={() => emit("adminTutorialPrev")}
            onNext={() => emit("adminTutorialNext")}
            onFinish={() => emit("adminEndTutorial")}
          />
        )}

        {/* 拍卖面板 */}
        {game.phase === "AUCTION" && (
          <div
            style={{
              background: "rgba(168,85,247,0.08)",
              border: "2px solid rgba(168,85,247,0.4)",
              borderRadius: "1.25rem",
              padding: "1.5rem",
              marginBottom: "1.5rem",
              boxShadow: "0 0 30px rgba(168,85,247,0.15)",
            }}
          >
            <h2
              style={{
                fontSize: "1.2rem",
                fontWeight: 800,
                color: "#c084fc",
                marginBottom: "1rem",
                display: "flex",
                alignItems: "center",
                gap: "0.45rem",
              }}
            >
              <GavelIcon size={22} decorative style={{ color: "inherit" }} />
              拍卖控制台 · 第 {auctionRound} 场
            </h2>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 1.1fr) minmax(0, 1fr)",
                gap: "1rem",
                marginBottom: "1.25rem",
              }}
            >
              <div
                style={{
                  background: "rgba(0,0,0,0.35)",
                  border: "1px solid rgba(251,191,36,0.35)",
                  borderRadius: "1rem",
                  padding: "1rem 1.15rem",
                }}
              >
                <div style={{ color: "#fbbf24", fontWeight: 800, marginBottom: "0.5rem" }}>正在拍</div>
                <div style={{ fontSize: uiRem(1.15), fontWeight: 800, color: "#d8b4fe", marginBottom: "0.65rem" }}>
                  {focusDef?.name || focusId || "（还没选）"}
                </div>
                {!focusId && (
                  <div style={{ color: "#fbbf24", fontSize: uiRem(0.85), marginBottom: "0.75rem", fontWeight: 700 }}>
                    请在下方点「改成拍这张」，选手动开始拍哪一张。
                  </div>
                )}
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem 1.25rem", fontSize: uiRem(0.85) }}>
                  <span>
                    现在最高价{" "}
                    <strong style={{ color: "#fbbf24", fontFamily: "var(--font-mono)" }}>
                      {currentBid > 0 ? currentBid : "—"}
                    </strong>
                    {currentBid <= 0 ? (
                      <span style={{ color: "var(--color-text-muted)", marginLeft: "0.35rem" }}>还没有人出价</span>
                    ) : null}
                  </span>
                  <span>
                    出价最高的人{" "}
                    <strong>{highBidderName || "还没有人出价"}</strong>
                  </span>
                  <span>
                    至少要出到{" "}
                    <strong style={{ fontFamily: "var(--font-mono)" }}>
                      {game.auctionMinimumNextBid ?? 5}
                    </strong>
                  </span>
                  {highBidderPlayer && currentBid > 0 && (
                    <span style={{ color: highBidderCanPay ? "#86efac" : "#fca5a5" }}>
                      对方还能付{" "}
                      <strong style={{ fontFamily: "var(--font-mono)" }}>{highBidderSpendable}</strong>
                      {!highBidderCanPay ? "（不够，确认成交会失败）" : ""}
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginTop: "1rem" }}>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={!focusId || currentBid <= 0 || !highBidderCanPay}
                    onClick={() => {
                      if (
                        !window.confirm(
                          `确认成交？\n【${focusDef?.name || focusId}】将以 ${currentBid} 卖给 ${highBidderName}`
                        )
                      )
                        return;
                      emit("adminHammerAuction", {
                        expectedBidId: highBidId,
                        expectedAmount: currentBid,
                        expectedPlayerId: highBidderId,
                      });
                    }}
                  >
                    确认成交
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={!focusId}
                    onClick={() => {
                      const onlyOneLeft =
                        currentAuctionCards.filter((c) => !distributedSet.has(c.id)).length <= 1;
                      const name = focusDef?.name || focusId;
                      const message = onlyOneLeft
                        ? `这张先跳过？\n【${name}】是本场最后一张未成交的卡。当前出价会作废，并重新从起拍价开始。`
                        : `这张先跳过？\n【${name}】暂不成交，换下一张。当前出价作废。`;
                      if (!window.confirm(message)) return;
                      emit("adminPassAuction");
                    }}
                  >
                    这张先跳过
                  </button>
                </div>
              </div>

              <div
                style={{
                  background: "rgba(0,0,0,0.28)",
                  border: "1px solid rgba(168,85,247,0.25)",
                  borderRadius: "1rem",
                  padding: "1rem 1.15rem",
                  maxHeight: "240px",
                  overflowY: "auto",
                }}
              >
                <div style={{ fontWeight: 800, color: "#d8b4fe", marginBottom: "0.5rem", fontSize: uiRem(0.9) }}>
                  出价记录（正在拍）
                </div>
                {bidHistory.length === 0 ? (
                  <div style={{ color: "var(--color-text-muted)", fontSize: uiRem(0.8) }}>还没有出价</div>
                ) : (
                  bidHistory.map((row) => {
                    const full = allBids.find((b) => b.bidId === row.bidId);
                    const ratio =
                      full?.bidToAvailableRatio != null
                        ? `${Math.round(full.bidToAvailableRatio * 100)}%`
                        : "—";
                    return (
                      <div
                        key={row.bidId}
                        style={{
                          fontSize: uiRem(0.75),
                          padding: "0.35rem 0",
                          borderBottom: "1px solid rgba(255,255,255,0.06)",
                          display: "flex",
                          flexWrap: "wrap",
                          gap: "0.35rem 0.65rem",
                        }}
                      >
                        <span style={{ fontWeight: 700 }}>{row.playerName}</span>
                        <span style={{ color: "#fbbf24", fontFamily: "var(--font-mono)" }}>{row.amount}</span>
                        <span style={{ color: "var(--color-text-muted)" }}>
                          {row.status === "leading" ? "暂时领先" : "已被超过"}
                        </span>
                        {full && (
                          <span style={{ color: "var(--color-text-muted)" }}>
                            当时可用 {full.availableWealthAtBid} · 占比 {ratio}
                          </span>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                justifyContent: "center",
                gap: "1rem",
              }}
            >
              {currentAuctionCards.map((card) => {
                const def = BUFF_CARD_DEFS[card.id];
                const sold = distributedSet.has(card.id);
                const deal = auctionDealByCardId.get(card.id);
                const isFocus = focusId === card.id;
                const winnerName = deal ? playerNameById.get(deal.playerId) : undefined;
                return (
                  <div
                    key={card.id}
                    style={{
                      flex: "0 1 240px",
                      width: "min(100%, 240px)",
                      background: "rgba(0,0,0,0.3)",
                      border: `1px solid ${
                        sold
                          ? "rgba(100,100,100,0.3)"
                          : isFocus
                            ? "rgba(251,191,36,0.5)"
                            : "rgba(168,85,247,0.25)"
                      }`,
                      borderRadius: "0.875rem",
                      padding: "1rem",
                      opacity: sold ? 0.55 : 1,
                    }}
                  >
                    <div style={{ fontWeight: 700, color: "#d8b4fe", marginBottom: "0.35rem", fontSize: uiRem(0.95) }}>
                      {def?.name || card.name}
                      {isFocus && !sold && (
                        <span style={{ color: "#fbbf24", fontWeight: 600, marginLeft: "0.35rem" }}>（正在拍）</span>
                      )}
                      {sold && (
                        <span style={{ color: "var(--color-text-muted)", fontWeight: 600, marginLeft: "0.35rem" }}>
                          (已成交{winnerName ? ` · ${winnerName}` : ""}
                          {deal
                            ? deal.source === "force_buy" || (deal.source == null && deal.cost === 0)
                              ? " · 强买"
                              : ` · ${deal.cost}`
                            : ""}
                          )
                        </span>
                      )}
                    </div>
                    <div
                      style={{
                        fontSize: uiRem(0.75),
                        color: "var(--color-text-secondary)",
                        marginBottom: "0.875rem",
                        lineHeight: 1.45,
                      }}
                    >
                      {def?.desc ? <BuffDescText text={def.desc} /> : null}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                      {!sold && (
                        <button
                          type="button"
                          className="btn btn-sm btn-full"
                          style={{
                            borderColor: isFocus
                              ? "rgba(251,191,36,0.6)"
                              : "rgba(148,163,184,0.35)",
                            color: isFocus ? "#fbbf24" : "var(--color-text-secondary)",
                            background: isFocus ? "rgba(251,191,36,0.12)" : "transparent",
                          }}
                          onClick={() => {
                            const name = def?.name || card.name;
                            if (isFocus) {
                              if (
                                currentBid > 0 &&
                                !window.confirm(`取消正在拍【${name}】？\n当前出价会作废。`)
                              ) {
                                return;
                              }
                              emit("adminSetAuctionFocus", { cardId: "" });
                              return;
                            }
                            if (
                              focusId &&
                              currentBid > 0 &&
                              !window.confirm(
                                `改成拍【${name}】？\n正在拍的【${focusDef?.name || focusId}】出价会作废。`
                              )
                            ) {
                              return;
                            }
                            emit("adminSetAuctionFocus", { cardId: card.id });
                          }}
                        >
                          {isFocus ? "取消正在拍" : "改成拍这张"}
                        </button>
                      )}
                      {sold && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm btn-full"
                          style={{ color: "#fca5a5", borderColor: "rgba(248,113,113,0.35)" }}
                          onClick={() =>
                            handleRevokeAuctionCard(card.id, def?.name || card.name, "completed")
                          }
                        >
                          撤回成交
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {allBids.length > 0 && (
              <div style={{ marginTop: "1.25rem" }}>
                <div style={{ fontWeight: 800, color: "#c084fc", marginBottom: "0.5rem", fontSize: uiRem(0.9) }}>
                  本场出价摘要
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: uiRem(0.72) }}>
                    <thead>
                      <tr style={{ color: "var(--color-text-muted)", textAlign: "left" }}>
                        <th style={{ padding: "0.35rem" }}>道具</th>
                        <th style={{ padding: "0.35rem" }}>玩家</th>
                        <th style={{ padding: "0.35rem" }}>出价</th>
                        <th style={{ padding: "0.35rem" }}>当时可用</th>
                        <th style={{ padding: "0.35rem" }}>占比</th>
                        <th style={{ padding: "0.35rem" }}>结果</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allBids.map((b) => (
                        <tr key={b.bidId} style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                          <td style={{ padding: "0.35rem" }}>{BUFF_CARD_DEFS[b.cardId]?.name || b.cardId}</td>
                          <td style={{ padding: "0.35rem" }}>{b.playerName}</td>
                          <td style={{ padding: "0.35rem", fontFamily: "var(--font-mono)" }}>{b.amount}</td>
                          <td style={{ padding: "0.35rem", fontFamily: "var(--font-mono)" }}>
                            {b.availableWealthAtBid}
                          </td>
                          <td style={{ padding: "0.35rem" }}>
                            {b.bidToAvailableRatio != null
                              ? `${Math.round(b.bidToAvailableRatio * 100)}%`
                              : "—"}
                          </td>
                          <td style={{ padding: "0.35rem" }}>
                            {b.status === "leading"
                              ? "暂时领先"
                              : b.status === "outbid"
                                ? "已被超过"
                                : b.status === "won"
                                  ? "成交拿走"
                                  : b.status === "void_passed"
                                    ? "跳过作废"
                                    : b.status === "void_force_buy"
                                      ? "被强买打断"
                                      : b.status === "void_lot_changed"
                                        ? "换卡作废"
                                        : b.status}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "1.5rem" }}>
          {/* 玩家监控表 */}
          <div
            style={{
              background: "var(--color-bg-card)",
              border: "1px solid var(--color-border)",
              borderRadius: "1.25rem",
              overflow: "hidden",
            }}
          >
            <div style={{ padding: "1rem 1.25rem", borderBottom: "1px solid var(--color-border)" }}>
              <h2 style={{ fontWeight: 700, fontSize: uiRem(1) }}>👥 玩家实时监控</h2>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: uiRem(0.8) }}>
                <thead>
                  <tr style={{ background: "rgba(255,255,255,0.02)", color: "var(--color-text-muted)" }}>
                    {["#", "昵称", "状态", "社交", "人格", "手牌", "已用", "⚡", "💰", "操作"].map((h, i) => {
                      const isActions = h === "操作";
                      return (
                        <th
                          key={i}
                          style={{
                            padding: "0.75rem 0.875rem",
                            fontWeight: 700,
                            fontSize: uiRem(0.7),
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                            textAlign: "left",
                            whiteSpace: "nowrap",
                            ...(isActions
                              ? {
                                  position: "sticky",
                                  right: 0,
                                  zIndex: 2,
                                  // 与表格卡片底色一致，避免横滑时操作列发黑/透底
                                  background: "var(--color-bg-card)",
                                  boxShadow: "-6px 0 10px rgba(0,0,0,0.35)",
                                }
                              : null),
                          }}
                        >
                          {h}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {humanPlayers.map((p, idx) => {
                    const hasLottery = p.activeBuffs?.some((b) => b.cardId === "buff_lottery");
                    const hasGold = p.activeBuffs?.some((b) => b.cardId === "buff_gold");
                    const pendingLottery = (game.pendingLotteryOffers ?? []).find((o) => o.playerId === p.id);
                    const completedLottery = (game.lotteryCompletedDeals ?? []).find((d) => d.playerId === p.id);
                    const pendingWealth = (game.pendingWealthAdjustments ?? []).find((o) => o.playerId === p.id);
                    const pendingAmountLabel =
                      pendingLottery && hasGold && pendingLottery.amount > 0
                        ? `（${pendingLottery.amount}）的 1.5 倍`
                        : pendingLottery
                          ? String(pendingLottery.amount)
                          : "";
                    return (
                      <tr key={p.id} style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                        <td style={{ padding: "0.875rem", color: "var(--color-text-muted)" }}>{idx + 1}</td>
                        <td style={{ padding: "0.875rem", fontWeight: 700, color: "white" }}>{p.name}</td>
                        <td style={{ padding: "0.875rem" }}>
                          {game.phase === "ROOM_WAITING" ? (
                            p.connected ? (
                              <span style={{ color: "#34d399" }}>在线</span>
                            ) : (
                              <span style={{ color: "#f87171" }}>离线</span>
                            )
                          ) : p.connected ? (
                            p.ready ? (
                              <span style={{ color: "#34d399" }}>✅</span>
                            ) : (
                              <span style={{ color: "#fbbf24" }}>⏳</span>
                            )
                          ) : (
                            <span style={{ color: "#f87171" }}>❌</span>
                          )}
                        </td>
                        <td style={{ padding: "0.875rem" }}>
                          <select
                            style={{
                              background: "rgba(15, 20, 60, 0.85)",
                              border: `1px solid ${p.socialRank === "A" ? "rgba(212,175,55,0.6)" : "rgba(212,175,55,0.2)"}`,
                              borderRadius: "0.375rem",
                              color: p.socialRank === "A" ? "#d4af37" : "var(--color-text-secondary)",
                              padding: "0.35rem 0.65rem",
                              fontSize: uiRem(0.875),
                              outline: "none",
                              cursor: "pointer",
                            }}
                            value={p.socialRank || ""}
                            onChange={(e) => handleSocialRate(p.id, e.target.value)}
                          >
                            <option value="">待评</option>
                            {["A", "B", "C", "D", "E"].map((r) => (
                              <option key={r} value={r}>{r}</option>
                            ))}
                          </select>
                        </td>
                        <td style={{ padding: "0.875rem" }}>
                          {p.analysisResult ? (
                            <span style={{ fontSize: uiRem(0.7), color: FATE_SKETCH_PERSONA_COLORS[p.analysisResult.primaryPersona] || "#60a5fa" }}>
                              {p.analysisResult.primaryPersona}
                            </span>
                          ) : (
                            <span style={{ color: "var(--color-text-muted)", fontSize: uiRem(0.75) }}>尚未分析</span>
                          )}
                        </td>
                        <td style={{ padding: "0.875rem", minWidth: "9rem" }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", alignItems: "center" }}>
                              {(p.inventory || []).map((cid, invIdx) => (
                                <span
                                  key={`${cid}-${invIdx}`}
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "0.25rem",
                                    background: "rgba(168,85,247,0.2)",
                                    border: "1px solid rgba(168,85,247,0.4)",
                                    borderRadius: "0.25rem",
                                    padding: "0.1rem 0.35rem 0.1rem 0.5rem",
                                    color: "#d8b4fe",
                                    fontSize: uiRem(0.7),
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {CARD_NAME_MAP[cid] || cid}
                                  <button
                                    type="button"
                                    className="admin-inline-btn"
                                    title="收回这一张手牌（不退款）"
                                    onClick={() => handleRemoveCardAt(p.id, p.name, invIdx, cid)}
                                    style={{
                                      padding: "0.05rem 0.35rem",
                                      fontSize: uiRem(0.62),
                                      lineHeight: 1.2,
                                      background: "rgba(148,163,184,0.15)",
                                      border: "1px solid rgba(148,163,184,0.35)",
                                      color: "#cbd5e1",
                                    }}
                                  >
                                    收回
                                  </button>
                                </span>
                              ))}
                              {(!p.inventory || p.inventory.length === 0) && (
                                <span style={{ color: "var(--color-text-muted)", fontSize: uiRem(0.75) }}>无手牌</span>
                              )}
                            </div>
                            <button
                              type="button"
                              className="admin-inline-btn"
                              title="补发道具到手牌（不经过拍卖，不扣财富）"
                              onClick={() => openCardAddModal(p.id, p.name)}
                              style={{
                                alignSelf: "flex-start",
                                background: "rgba(168,85,247,0.18)",
                                border: "1px solid rgba(168,85,247,0.5)",
                                color: "#d8b4fe",
                                fontWeight: 700,
                              }}
                            >
                              补发
                            </button>
                          </div>
                        </td>
                        <td style={{ padding: "0.875rem" }}>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.25rem" }}>
                            {(p.usedCards || []).map((cid, i) => (
                              <span key={i} style={{ color: "var(--color-text-muted)", textDecoration: "line-through", fontSize: uiRem(0.7) }}>
                                {CARD_NAME_MAP[cid] || cid}
                              </span>
                            ))}
                            {(!p.usedCards || p.usedCards.length === 0) && <span style={{ color: "var(--color-text-muted)", fontSize: uiRem(0.7) }}>—</span>}
                          </div>
                        </td>
                        <td style={{ padding: "0.875rem", fontFamily: "var(--font-mono)", fontWeight: 700, color: "#34d399" }}>{p.energy}</td>
                        <td style={{ padding: "0.875rem", fontFamily: "var(--font-mono)", fontWeight: 700, color: "#fbbf24" }}>{p.wealth}</td>
                        <td
                          style={{
                            padding: "0.875rem",
                            position: "sticky",
                            right: 0,
                            zIndex: 1,
                            background: "var(--color-bg-card)",
                            boxShadow: "-6px 0 10px rgba(0,0,0,0.35)",
                          }}
                        >
                          <div style={{ display: "flex", gap: "0.375rem", flexWrap: "wrap", minWidth: "11rem" }}>
                            {pendingDeviceClaimPlayerIds.has(p.id) && (
                              <button
                                type="button"
                                className="admin-inline-btn animate-pulse"
                                title="新设备正在等待认领，批准后该玩家将同步当前进度进入"
                                onClick={() => {
                                  if (
                                    confirm(
                                      `允许 ${p.name} 用新设备进入并同步当前进度？\n原设备连接将被替换。`
                                    )
                                  ) {
                                    emit("adminReleasePlayerClaim", { targetPlayerId: p.id });
                                  }
                                }}
                                style={{
                                  background: "rgba(59,130,246,0.2)",
                                  border: "1px solid rgba(59,130,246,0.45)",
                                  color: "#93c5fd",
                                }}
                              >
                                认领
                              </button>
                            )}
                            <button
                              type="button"
                              className="admin-inline-btn"
                              onClick={() => { if (confirm(`踢出 ${p.name}？`)) emit("adminKickPlayer", { targetPlayerId: p.id }); }}
                              style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.35)", color: "#f87171" }}
                            >踢</button>
                            {investmentUnlockOpen && p.ready && (
                              <button
                                type="button"
                                className="admin-inline-btn"
                                disabled={unlockingPlayerId === p.id}
                                title="解锁后该玩家可修改投资并重新锁定（倒计时仍继续）"
                                onClick={() => {
                                  if (!canUnlockInvestmentNow()) {
                                    alert("倒计时已结束，无法解锁");
                                    return;
                                  }
                                  if (
                                    !confirm(
                                      `允许 ${p.name} 修改已提交的投资方案（退回已扣精力，保留原填写），确认？`
                                    )
                                  ) {
                                    return;
                                  }
                                  // confirm 阻塞期间倒计时可能已结束
                                  if (!canUnlockInvestmentNow()) {
                                    alert("倒计时已结束，无法解锁");
                                    return;
                                  }
                                  setUnlockingPlayerId(p.id);
                                  emit("adminUnlockPlayer", { targetPlayerId: p.id });
                                }}
                                style={{
                                  background: "rgba(245,158,11,0.15)",
                                  border: "1px solid rgba(245,158,11,0.35)",
                                  color: "#fbbf24",
                                  opacity: unlockingPlayerId === p.id ? 0.55 : 1,
                                }}
                              >
                                {unlockingPlayerId === p.id ? "…" : "解"}
                              </button>
                            )}
                            {hasLottery && (
                              <button
                                type="button"
                                onClick={() => handleSettleLottery(p.id, p.name)}
                                className={`admin-inline-btn${pendingLottery ? "" : " animate-pulse"}`}
                                title={
                                  pendingLottery
                                    ? `重新发送开奖确认（当前 ${pendingAmountLabel}）`
                                    : "开奖"
                                }
                                style={{ background: "rgba(16,185,129,0.2)", border: "1px solid rgba(16,185,129,0.4)", color: "#34d399" }}
                              >🎲</button>
                            )}
                            {pendingLottery && (
                              <button
                                type="button"
                                className="admin-inline-btn"
                                title={`撤回待确认开奖（${pendingAmountLabel}）`}
                                onClick={() => handleRevokeLottery(p.id, p.name, "pending")}
                                style={{ background: "rgba(248,113,113,0.12)", border: "1px solid rgba(248,113,113,0.35)", color: "#fca5a5" }}
                              >撤回待确认</button>
                            )}
                            <button
                              type="button"
                              className="admin-inline-btn"
                              title={
                                pendingWealth
                                  ? `重新发送财富调整（当前待确认 ${pendingWealth.delta > 0 ? `+${pendingWealth.delta}` : pendingWealth.delta}）`
                                  : "给钱 / 扣钱（需玩家确认）"
                              }
                              onClick={() => handleAdjustWealth(p.id, p.name, p.wealth)}
                              style={{
                                background: pendingWealth
                                  ? "rgba(251,191,36,0.28)"
                                  : "rgba(251,191,36,0.18)",
                                border: "1px solid rgba(251,191,36,0.5)",
                                color: "#fbbf24",
                                fontWeight: 700,
                              }}
                            >
                              {pendingWealth
                                ? `给钱/扣钱（${pendingWealth.delta > 0 ? `+${pendingWealth.delta}` : pendingWealth.delta}）`
                                : "给钱/扣钱"}
                            </button>
                            {pendingWealth && (
                              <button
                                type="button"
                                className="admin-inline-btn"
                                title={`撤回财富调整待确认（${pendingWealth.delta > 0 ? `+${pendingWealth.delta}` : pendingWealth.delta}）`}
                                onClick={() => handleRevokeWealthAdjust(p.id, p.name)}
                                style={{ background: "rgba(248,113,113,0.12)", border: "1px solid rgba(248,113,113,0.35)", color: "#fca5a5" }}
                              >
                                撤回财富
                              </button>
                            )}
                            {completedLottery && (
                              <button
                                type="button"
                                className="admin-inline-btn"
                                title={`撤回已开奖（${completedLottery.amount}）`}
                                onClick={() => handleRevokeLottery(p.id, p.name, "completed")}
                                style={{ background: "rgba(248,113,113,0.12)", border: "1px solid rgba(248,113,113,0.35)", color: "#fca5a5" }}
                              >撤回开奖</button>
                            )}
                            {reportsAvailable && (
                              <button
                                type="button"
                                className="admin-inline-btn"
                                disabled={!p.analysisResult || pdfExporting}
                                title={
                                  p.analysisResult
                                    ? "导出《人生决策手册》PDF"
                                    : "需完成社区命名后生成分析"
                                }
                                onClick={() => handleExportPlayerReport(p)}
                                style={{
                                  background: "rgba(245,158,11,0.15)",
                                  border: "1px solid rgba(245,158,11,0.35)",
                                  color: p.analysisResult ? "#fcd34d" : "var(--color-text-muted)",
                                }}
                              >
                                报告
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <AdminProjectAdjustPanel game={game} />

          {/* 实验室记录：预测 + Agent 决策（仅上帝视角下发） */}
          <div
            style={{
              background: "var(--color-bg-card)",
              border: "1px solid var(--color-border)",
              borderRadius: "1.25rem",
              padding: "1rem 1.25rem",
              marginBottom: "1rem",
            }}
          >
            <h2 style={{ fontWeight: 700, fontSize: uiRem(1), marginBottom: "0.5rem" }}>
              🧪 实验记录
            </h2>
            <div style={{ fontSize: uiRem(0.72), color: "var(--color-text-muted)", marginBottom: "0.5rem" }}>
              预测 {game.predictions?.length ?? 0} 条 · Agent 决策 {game.agentDecisions?.length ?? 0} 条
            </div>
            {(game.predictions?.length ?? 0) > 0 && (
              <div style={{ maxHeight: "180px", overflowY: "auto", marginBottom: "0.75rem" }}>
                {game.predictions!.slice(-12).map((p) => (
                  <div key={p.id} style={{ fontSize: uiRem(0.7), padding: "0.25rem 0", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                    <span style={{ color: "#fbbf24" }}>{p.playerName}</span>
                    <span style={{ color: "var(--color-text-muted)" }}> 时代 {p.era} </span>
                    <span>
                      {p.ranking
                        .map((id) => game.players.find((x) => x.id === id)?.name ?? id)
                        .join(" > ")}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {(game.agentDecisions?.length ?? 0) > 0 && (
              <div style={{ maxHeight: "220px", overflowY: "auto" }}>
                {game.agentDecisions!.slice(-40).reverse().map((d) => (
                  <div key={d.id} style={{ fontSize: uiRem(0.7), padding: "0.3rem 0", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                    <span style={{ color: "#60a5fa" }}>{d.playerName}</span>
                    <span style={{ color: "var(--color-text-muted)" }}>
                      {" "}
                      {d.kind} · R{d.globalRound} · {d.model ?? ""} {d.totalTokens ? `· ${d.totalTokens} tok` : ""}
                    </span>
                    <div style={{ color: "var(--color-text-secondary)" }}>{d.reasoning}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 日志 */}
          <div
            style={{
              background: "var(--color-bg-card)",
              border: "1px solid var(--color-border)",
              borderRadius: "1.25rem",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
              height: "600px",
            }}
          >
            <div style={{ padding: "1rem 1.25rem", borderBottom: "1px solid var(--color-border)", flexShrink: 0 }}>
              <h2 style={{ fontWeight: 700, fontSize: uiRem(1) }}>📜 游戏日志</h2>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "0.875rem" }}>
              {[...game.logs].reverse().map((log, i) => (
                <div
                  key={i}
                  style={{
                    borderLeft: "2px solid rgba(255,255,255,0.06)",
                    paddingLeft: "0.75rem",
                    paddingTop: "0.375rem",
                    paddingBottom: "0.375rem",
                    fontSize: uiRem(0.75),
                    color: "var(--color-text-secondary)",
                    lineHeight: 1.5,
                  }}
                >
                  {log}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ marginTop: "1.5rem" }}>
          <AdminPrivateChatPanel
            roomId={game.roomId}
            transactions={adminTxDisplayList}
            chatGroups={adminChatGroups}
            groupMessages={adminGroupMessages}
            total={dmViewAsPlayerId ? adminDmTxTotal : adminTxTotal}
            showLoadOlder={showAdminLoadOlder}
            loadingOlder={adminTxLoadingOlder}
            onLoadOlder={loadOlderAdminTransactions}
            messageScrollRef={adminTxScrollRef}
            onMessageScroll={onAdminTxMessageScroll}
            atBottom={adminTxAtBottom}
            onScrollToLatest={scrollAdminTxToLatest}
            perspectivePlayers={humanPlayers}
            viewAsPlayerId={dmViewAsPlayerId}
            onViewAsPlayerIdChange={(id) => {
              setDmViewAsPlayerId(id);
              setAdminDmTxTotal(0);
            }}
          />
        </div>

        <div
          style={{
            marginTop: "1.5rem",
            background: "var(--color-bg-card)",
            border: "1px solid var(--color-border)",
            borderRadius: "1rem",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "0.75rem",
              flexWrap: "wrap",
              padding: "0.85rem 1.25rem",
              borderBottom: "1px solid var(--color-border)",
            }}
          >
            <h2 style={{ fontWeight: 700, fontSize: uiRem(1), margin: 0 }}>📱 玩家界面</h2>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.75rem",
                flexWrap: "wrap",
              }}
            >
              {humanPlayers.length > 0 && (
                <AdminSectionPerspectiveSelect
                  label="视角"
                  value={uiViewAsPlayerId}
                  onChange={setUiViewAsPlayerId}
                  players={humanPlayers}
                  overviewLabel="总览（公共空座位）"
                />
              )}
              <span style={{ fontSize: uiRem(0.8), color: "var(--color-text-muted)" }}>
                {uiViewAsPlayerId
                  ? `${uiPerspectivePlayer?.name ?? uiViewAsPlayerId} · 只读`
                  : "公共预览（不可操作）"}
              </span>
            </div>
          </div>
          <div
            style={{
              maxHeight: "70vh",
              overflow: "auto",
              background: "#070b14",
              transform: "translateZ(0)",
            }}
          >
            <div style={{ pointerEvents: "none" }}>
              {uiViewAsPlayerId ? (
                <GameRoom
                  game={playerPreviewGame}
                  myPlayerId={uiViewAsPlayerId}
                  readOnly
                  hidePlayerChat
                  projectImages={projectImages}
                  eraImages={eraImages}
                  buffImages={buffImages}
                  personaImages={personaImages}
                />
              ) : (
                <GameRoom
                  game={game}
                  embed
                  projectImages={projectImages}
                  eraImages={eraImages}
                  buffImages={buffImages}
                  personaImages={personaImages}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {cardAdjustUi && (
        <div
          className="modal-overlay"
          role="presentation"
          onClick={closeCardAdjustModal}
          style={{ zIndex: 200 }}
        >
          <div
            className="modal-box animate-bounce-in"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-card-adjust-title"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: "28rem", width: "calc(100% - 2rem)" }}
          >
            <h3 id="admin-card-adjust-title" style={{ fontWeight: 800, marginBottom: "0.5rem" }}>
              补发道具 · {cardAdjustUi.playerName}
            </h3>
            <p style={{ color: "var(--color-text-muted)", fontSize: uiRem(0.85), marginBottom: "1rem" }}>
              补发到手牌，不扣财富，拍卖池与成交记录不变。
            </p>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.4rem",
                maxHeight: "16rem",
                overflowY: "auto",
                marginBottom: "1rem",
              }}
            >
              {Object.entries(BUFF_CARD_DEFS).map(([cardId, def]) => {
                const selected = cardAdjustPick === cardId;
                return (
                  <button
                    key={cardId}
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => setCardAdjustPick(cardId)}
                    style={{
                      justifyContent: "flex-start",
                      textAlign: "left",
                      border: selected
                        ? "1px solid rgba(168,85,247,0.55)"
                        : "1px solid var(--color-border)",
                      background: selected ? "rgba(168,85,247,0.12)" : undefined,
                    }}
                  >
                    {def.name}
                  </button>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: "0.75rem" }}>
              <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={closeCardAdjustModal}>
                取消
              </button>
              <button
                type="button"
                className="btn btn-primary"
                style={{ flex: 1 }}
                disabled={!cardAdjustPick}
                onClick={confirmCardAdjust}
              >
                确认
              </button>
            </div>
          </div>
        </div>
      )}

      <Suspense fallback={null}>
        <AdminPlayerPdfCapture job={pdfJob} onComplete={handlePdfCaptureComplete} />
      </Suspense>
    </div>
  );
};
