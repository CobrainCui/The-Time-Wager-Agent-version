import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GameState, Player, Transaction } from "../../types";
import { socket } from "../../socket";
import type { ChatMessage, ChatThread } from "./types";
import {
  formatBadge,
  isOptimisticMatchForTx,
  msgFromTx,
  newClientTempId,
  sortMessages,
} from "./chatMessageUtils";
import {
  ChatSeenSnapshot,
  isGroupMessageUnread,
  isTxUnreadForViewer,
  loadChatSeen,
  markGroupMessagesSeen,
  markTransactionsSeen,
  saveChatSeen,
} from "./chatSeenStorage";
import { playerAvailableWealth } from "../../utils/availableWealth";
import { normalizeNoteInput, sanitizeTransactionNote } from "../../utils/transactionNoteFilter";
import {
  archiveLoadIncomplete,
  mergeTransactionLog,
  oldestTransactionCursor,
  sortedTransactionsFromMap,
} from "../../utils/transactionLogMerge";
import type { ComposerDraft } from "./chatComposerDraft";
import {
  buildDisplayOrder,
  bumpCollapsedRecency,
  mergePeerListIntoRecency,
  promoteExpandedStack,
  removeFromExpandedStack,
} from "./chatDockOrder";
import { ExpandedChatDockPanel } from "./ExpandedChatDockPanel";
import { GroupChatPanel } from "./GroupChatPanel";
import { CreateGroupModal } from "./CreateGroupModal";
import { groupThreadId, isGroupThreadId, parseGroupThreadId } from "./groupChatIds";
import { mergeServerGroupMessageIntoThread } from "./groupMessageUtils";
import { PLAYER_GROUP_CHAT_ENABLED } from "../../config/playerChatFeatures";
import {
  peerDockAttention,
  peerMinibarAriaLabel,
  pickLatestDockAction,
  sortCollapsedPeerIds,
  summarizeDockAttention,
} from "./chatDockAttention";

/** 乐观气泡超时未对账则标为发送失败 */
const OPTIMISTIC_TIMEOUT_MS = 8_000;
const ATTENTION_FLASH_MS = 2_500;
const DOCK_PREVIEW_HINT_MS = 4_000;

function txInvolvesMe(tx: Transaction, myId: string): boolean {
  return tx.fromId === myId || tx.toId === myId;
}

function optimisticMessage(peerId: string, amount: number, note: string, clientTempId: string): ChatMessage {
  return {
    id: clientTempId,
    clientTempId,
    direction: "out",
    amount,
    note: note.trim(),
    status: "pending",
    timestamp: Date.now(),
    peerId,
  };
}

export const PlayerChatSystem: React.FC<{
  game: GameState;
  me: Player;
  readOnly?: boolean;
}> = ({ game, me, readOnly = false }) => {
  const gameRef = useRef(game);
  gameRef.current = game;

  const [threads, setThreads] = useState<Record<string, ChatThread>>({});
  const [expandedStack, setExpandedStack] = useState<string[]>([]);
  const [collapsedRecency, setCollapsedRecency] = useState<string[]>([]);
  const [respondingTxIds, setRespondingTxIds] = useState<Set<string>>(() => new Set());
  const respondingTxRef = useRef<Set<string>>(new Set());

  const knownTxIdsRef = useRef<Set<string>>(new Set());
  const seenRef = useRef<ChatSeenSnapshot>(loadChatSeen(game.roomId, me.id));
  const pendingOutRef = useRef<Map<string, { peerId: string; sentAt: number }>>(new Map());
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const dockRef = useRef<HTMLDivElement>(null);
  const draftsRef = useRef<Record<string, ComposerDraft>>({});
  const activeComposerPeerRef = useRef<string | null>(null);
  const composerImeActiveRef = useRef(false);
  const deferredDockWorkRef = useRef<(() => void)[]>([]);
  const txMergeRef = useRef<Map<string, Transaction>>(new Map());
  const [playerTxMerged, setPlayerTxMerged] = useState<Transaction[]>([]);
  const [txLogTotal, setTxLogTotal] = useState(0);
  const [txLoadingOlder, setTxLoadingOlder] = useState(false);
  const txLoadingOlderRef = useRef(false);
  const [flashPeerId, setFlashPeerId] = useState<string | null>(null);
  const [inboxFlash, setInboxFlash] = useState(false);
  const [dockPreviewHint, setDockPreviewHint] = useState<string | null>(null);
  const attentionFlashTimerRef = useRef<number | null>(null);
  const previewHintTimerRef = useRef<number | null>(null);
  const inboxNotifyFlashTimerRef = useRef<number | null>(null);
  const [seenRevision, setSeenRevision] = useState(0);

  const peerSignature = useMemo(
    () =>
      game.players
        .filter((p) => p.id !== me.id)
        .map((p) => `${p.id}\t${p.name}`)
        .join("\n"),
    [game.players, me.id]
  );

  const peerPlayers = useMemo(
    () => game.players.filter((p) => p.id !== me.id),
    [peerSignature]
  );

  const myTransactions = useMemo(
    () => playerTxMerged.filter((t) => txInvolvesMe(t, me.id)),
    [playerTxMerged, me.id]
  );

  const maxWealth = useMemo(
    () => playerAvailableWealth(gameRef.current, me),
    [
      me.id,
      me.wealth,
      me.ready,
      game.auctionHighBidderId,
      game.auctionCurrentBid,
      game.transactions,
      playerTxMerged.length,
    ]
  );

  useEffect(() => {
    txMergeRef.current = new Map();
    setPlayerTxMerged([]);
    setTxLogTotal(0);
    txLoadingOlderRef.current = false;
    setTxLoadingOlder(false);
  }, [game.roomId, me.id]);

  useEffect(() => {
    const merged = mergeTransactionLog(txMergeRef.current, game.transactions ?? []);
    txMergeRef.current = merged;
    setPlayerTxMerged(sortedTransactionsFromMap(merged));
    if (typeof game.transactionLog?.total === "number") {
      setTxLogTotal(game.transactionLog.total);
    } else {
      setTxLogTotal(merged.size);
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
      const merged = mergeTransactionLog(txMergeRef.current, payload.transactions ?? []);
      txMergeRef.current = merged;
      const sorted = sortedTransactionsFromMap(merged);
      setPlayerTxMerged(sorted);
      if (typeof payload.total === "number") setTxLogTotal(payload.total);
      txLoadingOlderRef.current = false;
      setTxLoadingOlder(false);
    };
    const onError = () => {
      if (!txLoadingOlderRef.current) return;
      txLoadingOlderRef.current = false;
      setTxLoadingOlder(false);
    };
    socket.on("transactionHistoryPage", onPage);
    socket.on("error", onError);
    return () => {
      socket.off("transactionHistoryPage", onPage);
      socket.off("error", onError);
    };
  }, [game.roomId]);

  const loadOlderTransactions = useCallback(() => {
    if (txLoadingOlderRef.current) return;
    const cursor = oldestTransactionCursor(myTransactions);
    if (!cursor) return;
    txLoadingOlderRef.current = true;
    setTxLoadingOlder(true);
    socket.emit("fetchTransactionHistory", {
      roomId: game.roomId,
      beforeTimestamp: cursor.timestamp,
      beforeId: cursor.id,
      limit: 80,
    });
  }, [game.roomId, myTransactions]);

  const showLoadOlderTx = archiveLoadIncomplete(myTransactions.length, txLogTotal);

  const hasExpandedPanel = useMemo(() => Object.values(threads).some((t) => t.expanded), [threads]);

  const hasExpandedPeerPanel = useMemo(
    () =>
      Object.entries(threads).some(
        ([id, t]) => t.expanded && t.threadKind !== "group" && !isGroupThreadId(id)
      ),
    [threads]
  );

  const dockSummary = useMemo(
    () => summarizeDockAttention(peerPlayers, threads, myTransactions, me.id, seenRef.current),
    [peerPlayers, threads, myTransactions, me.id, seenRevision]
  );

  const pulsePeerAttention = useCallback((peerId: string) => {
    setFlashPeerId(peerId);
    setInboxFlash(true);
    if (attentionFlashTimerRef.current != null) {
      window.clearTimeout(attentionFlashTimerRef.current);
    }
    attentionFlashTimerRef.current = window.setTimeout(() => {
      setFlashPeerId(null);
      setInboxFlash(false);
      attentionFlashTimerRef.current = null;
    }, ATTENTION_FLASH_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (attentionFlashTimerRef.current != null) {
        window.clearTimeout(attentionFlashTimerRef.current);
      }
      if (previewHintTimerRef.current != null) {
        window.clearTimeout(previewHintTimerRef.current);
      }
      if (inboxNotifyFlashTimerRef.current != null) {
        window.clearTimeout(inboxNotifyFlashTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const onPlayerNotify = (
      payload: { type?: string; message?: string; msg?: string } | string
    ) => {
      if (typeof payload === "string") return;
      const t = payload?.type;
      if (t !== "chat" && t !== "transfer") return;
      const text = payload?.message || payload?.msg || "";
      if (!text) return;
      if (t === "transfer" && !text.includes("向你转账")) return;
      setDockPreviewHint(text);
      setInboxFlash(true);
      if (inboxNotifyFlashTimerRef.current != null) {
        window.clearTimeout(inboxNotifyFlashTimerRef.current);
      }
      inboxNotifyFlashTimerRef.current = window.setTimeout(() => {
        setInboxFlash(false);
        inboxNotifyFlashTimerRef.current = null;
      }, ATTENTION_FLASH_MS);
      if (previewHintTimerRef.current != null) {
        window.clearTimeout(previewHintTimerRef.current);
      }
      previewHintTimerRef.current = window.setTimeout(() => {
        setDockPreviewHint(null);
        previewHintTimerRef.current = null;
      }, DOCK_PREVIEW_HINT_MS);
    };
    socket.on("playerNotify", onPlayerNotify);
    return () => {
      socket.off("playerNotify", onPlayerNotify);
    };
  }, []);

  const persistSeen = useCallback(
    (snapshot: ChatSeenSnapshot) => {
      seenRef.current = snapshot;
      saveChatSeen(game.roomId, me.id, snapshot);
      setSeenRevision((v) => v + 1);
    },
    [game.roomId, me.id]
  );

  const markPeerSeenFromTxs = useCallback(
    (peerId: string) => {
      const txs = myTransactions.filter((t) => {
        const peer = t.fromId === me.id ? t.toId : t.fromId;
        return peer === peerId;
      });
      const next = markTransactionsSeen(seenRef.current, txs);
      if (next !== seenRef.current) persistSeen(next);
    },
    [myTransactions, persistSeen, me.id]
  );

  const collapseAllExpanded = useCallback(() => {
    setThreads((prev) => {
      let changed = false;
      const next: Record<string, ChatThread> = { ...prev };
      for (const id of Object.keys(next)) {
        if (next[id].expanded) {
          if (isGroupThreadId(id)) {
            const ids = next[id].messages.map((m) => m.id);
            persistSeen(markGroupMessagesSeen(seenRef.current, ids));
          } else {
            markPeerSeenFromTxs(id);
          }
          changed = true;
          next[id] = { ...next[id], expanded: false };
        }
      }
      return changed ? next : prev;
    });
    setExpandedStack([]);
  }, [markPeerSeenFromTxs, persistSeen]);

  useEffect(() => {
    if (!hasExpandedPanel) return;

    const onPointerDown = (e: PointerEvent) => {
      const dock = dockRef.current;
      if (!dock || !(e.target instanceof Node)) return;
      if (dock.contains(e.target)) return;
      collapseAllExpanded();
    };

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [hasExpandedPanel, collapseAllExpanded]);

  useEffect(() => {
    seenRef.current = loadChatSeen(game.roomId, me.id);
    knownTxIdsRef.current = new Set();
    pendingOutRef.current.clear();
    respondingTxRef.current.clear();
    draftsRef.current = {};
    activeComposerPeerRef.current = null;
    composerImeActiveRef.current = false;
    setRespondingTxIds(new Set());
    setThreads({});
    setExpandedStack([]);
    setCollapsedRecency([]);
  }, [game.roomId, me.id]);

  useEffect(() => {
    const peerIds = peerPlayers.map((p) => p.id);
    setThreads((prev) => {
      let next = prev;
      for (const p of peerPlayers) {
        const existing = next[p.id];
        if (!existing) {
          if (next === prev) next = { ...prev };
          next[p.id] = {
            playerId: p.id,
            playerName: p.name,
            messages: [],
            expanded: false,
            unread: 0,
            threadKind: "peer",
          };
        } else if (existing.playerName !== p.name) {
          if (next === prev) next = { ...prev };
          next[p.id] = { ...existing, playerName: p.name };
        }
      }
      return next;
    });
    setCollapsedRecency((order) => mergePeerListIntoRecency(order, peerIds));
  }, [peerPlayers]);

  const myCustomChatGroups = useMemo(() => {
    if (!PLAYER_GROUP_CHAT_ENABLED) return [];
    return (game.chatGroups ?? []).filter((g) => g.kind === "custom");
  }, [game.chatGroups]);

  const groupDockOrder = useMemo(() => {
    if (!PLAYER_GROUP_CHAT_ENABLED) return [];
    const groups = myCustomChatGroups;
    const lastByGroup = new Map<string, number>();
    for (const m of game.groupMessages ?? []) {
      if (!groups.some((g) => g.id === m.groupId)) continue;
      lastByGroup.set(m.groupId, Math.max(lastByGroup.get(m.groupId) ?? 0, m.timestamp));
    }
    return [...groups]
      .sort(
        (a, b) =>
          (lastByGroup.get(b.id) ?? b.createdAt) - (lastByGroup.get(a.id) ?? a.createdAt) ||
          a.id.localeCompare(b.id)
      )
      .map((g) => groupThreadId(g.id));
  }, [myCustomChatGroups, game.groupMessages]);

  const dockIds = useMemo(
    () => [...groupDockOrder, ...peerPlayers.map((p) => p.id)],
    [groupDockOrder, peerPlayers]
  );

  const displayOrder = useMemo(() => {
    const raw = buildDisplayOrder(dockIds, expandedStack, collapsedRecency, (id) => threads[id]?.expanded === true);
    const expandedIds = raw.filter((id) => threads[id]?.expanded === true);
    const collapsedIds = raw.filter((id) => !threads[id]?.expanded);
    const peerCollapsed = collapsedIds.filter((id) => !isGroupThreadId(id));
    const groupCollapsed = collapsedIds.filter((id) => isGroupThreadId(id));
    const sortedPeers = sortCollapsedPeerIds(
      peerCollapsed,
      threads,
      myTransactions,
      me.id,
      collapsedRecency
    );
    return [...expandedIds, ...sortedPeers, ...groupCollapsed];
  }, [dockIds, expandedStack, collapsedRecency, threads, myTransactions, me.id]);

  const flushDeferredDockWork = useCallback(() => {
    if (composerImeActiveRef.current) return;
    const queue = deferredDockWorkRef.current.splice(0);
    for (const fn of queue) fn();
  }, []);

  const bumpCollapsedOnly = useCallback((peerId: string) => {
    const run = () => setCollapsedRecency((order) => bumpCollapsedRecency(order, peerId));
    if (activeComposerPeerRef.current) {
      deferredDockWorkRef.current.push(run);
      return;
    }
    run();
  }, []);

  const activateThread = useCallback(
    (
      playerId: string,
      playerName: string,
      patch: {
        messages?: ChatMessage[];
        expanded?: boolean;
        bumpUnread?: boolean;
      }
    ) => {
      setThreads((prev) => {
        const existing = prev[playerId];
        const expanded = patch.expanded ?? existing?.expanded ?? false;
        const bump = patch.bumpUnread ?? false;
        const unread = expanded ? 0 : (existing?.unread ?? 0) + (bump ? 1 : 0);

        return {
          ...prev,
          [playerId]: {
            playerId,
            playerName,
            messages: patch.messages ?? existing?.messages ?? [],
            expanded,
            unread,
            threadKind: existing?.threadKind ?? (isGroupThreadId(playerId) ? "group" : "peer"),
            groupId: existing?.groupId,
            groupKind: existing?.groupKind,
            ownerId: existing?.ownerId,
          },
        };
      });

      if (patch.expanded === true) {
        if (isGroupThreadId(playerId)) {
          setThreads((prev) => {
            const t = prev[playerId];
            if (!t?.messages.length) return prev;
            persistSeen(markGroupMessagesSeen(seenRef.current, t.messages.map((m) => m.id)));
            return prev;
          });
        } else {
          markPeerSeenFromTxs(playerId);
        }
        setExpandedStack((stack) => promoteExpandedStack(stack, playerId));
      } else if (patch.expanded === false) {
        setExpandedStack((stack) => removeFromExpandedStack(stack, playerId));
      }
    },
    [markPeerSeenFromTxs, persistSeen]
  );

  const openLatestAttention = useCallback(() => {
    const latest = pickLatestDockAction(peerPlayers, myTransactions, me.id, seenRef.current);
    if (!latest) return;
    activateThread(latest.peerId, latest.peerName, { expanded: true, bumpUnread: false });
  }, [peerPlayers, myTransactions, me.id, activateThread]);

  useEffect(() => {
    if (!PLAYER_GROUP_CHAT_ENABLED) {
      setThreads((prev) => {
        let next = prev;
        for (const key of Object.keys(next)) {
          if (!isGroupThreadId(key)) continue;
          if (next === prev) next = { ...prev };
          delete next[key];
        }
        return next;
      });
      setExpandedStack((stack) => stack.filter((id) => !isGroupThreadId(id)));
      setCollapsedRecency((order) => order.filter((id) => !isGroupThreadId(id)));
      return;
    }
    const groups = myCustomChatGroups;
    const groupMsgs = (game.groupMessages ?? []).filter((m) => groups.some((g) => g.id === m.groupId));
    const threadIds = groups.map((g) => groupThreadId(g.id));
    const mergeFx = { seenIds: [] as string[], bumpThreads: [] as string[] };

    setThreads((prev) => {
      let next = prev;
      for (const g of groups) {
        const tid = groupThreadId(g.id);
        const existing = next[tid];
        if (!existing) {
          if (next === prev) next = { ...prev };
          next[tid] = {
            playerId: tid,
            playerName: g.name,
            messages: [],
            expanded: false,
            unread: 0,
            threadKind: "group",
            groupId: g.id,
            groupKind: g.kind,
            ownerId: g.ownerId,
          };
        } else if (existing.playerName !== g.name || existing.ownerId !== g.ownerId) {
          if (next === prev) next = { ...prev };
          next[tid] = {
            ...existing,
            playerName: g.name,
            groupKind: g.kind,
            ownerId: g.ownerId,
          };
        }
      }
      for (const key of Object.keys(next)) {
        if (!isGroupThreadId(key)) continue;
        const gid = parseGroupThreadId(key);
        if (gid && !groups.some((g) => g.id === gid)) {
          if (next === prev) next = { ...prev };
          delete next[key];
        }
      }

      for (const gm of groupMsgs) {
        if (!groups.some((g) => g.id === gm.groupId)) continue;
        const tid = groupThreadId(gm.groupId);
        const existing = next[tid];
        if (!existing) continue;
        const { thread, effects } = mergeServerGroupMessageIntoThread(existing, gm, me.id, (id) =>
          isGroupMessageUnread(id, seenRef.current)
        );
        if (!effects.applied) continue;
        if (next === prev) next = { ...prev };
        next[tid] = thread;
        if (effects.seenIds.length) mergeFx.seenIds.push(...effects.seenIds);
        if (effects.bumpUnread && !effects.wasExpanded) mergeFx.bumpThreads.push(tid);
        if (gm.clientTempId && gm.fromId === me.id) {
          pendingOutRef.current.delete(gm.clientTempId);
        }
      }
      return next;
    });

    setCollapsedRecency((order) => mergePeerListIntoRecency(order, threadIds));

    const validGroupThreadIds = new Set(threadIds);
    setExpandedStack((stack) =>
      stack.filter((id) => !isGroupThreadId(id) || validGroupThreadIds.has(id))
    );

    if (mergeFx.seenIds.length) {
      persistSeen(markGroupMessagesSeen(seenRef.current, mergeFx.seenIds));
    }
    for (const tid of mergeFx.bumpThreads) {
      bumpCollapsedOnly(tid);
    }
  }, [myCustomChatGroups, game.groupMessages, me.id, bumpCollapsedOnly, persistSeen]);

  const knownCustomGroupIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    knownCustomGroupIdsRef.current = new Set();
  }, [game.roomId]);

  useEffect(() => {
    if (!PLAYER_GROUP_CHAT_ENABLED) return;
    const groups = myCustomChatGroups;
    for (const g of groups) {
      if (g.kind !== "custom" || g.createdById !== me.id) continue;
      if (knownCustomGroupIdsRef.current.has(g.id)) continue;
      knownCustomGroupIdsRef.current.add(g.id);
      activateThread(groupThreadId(g.id), g.name, { expanded: true });
    }
  }, [myCustomChatGroups, me.id, activateThread]);

  const appendOptimisticGroup = useCallback(
    (threadId: string, groupName: string, text: string, clientTempId: string) => {
      const msg: ChatMessage = {
        id: clientTempId,
        clientTempId,
        direction: "out",
        amount: 0,
        note: text,
        status: "pending",
        timestamp: Date.now(),
        peerId: parseGroupThreadId(threadId) ?? undefined,
      };
      pendingOutRef.current.set(clientTempId, { peerId: threadId, sentAt: Date.now() });
      setThreads((prev) => {
        const existing = prev[threadId];
        return {
          ...prev,
          [threadId]: {
            playerId: threadId,
            playerName: groupName,
            messages: sortMessages([...(existing?.messages ?? []), msg]),
            expanded: true,
            unread: 0,
            threadKind: "group",
            groupId: existing?.groupId ?? parseGroupThreadId(threadId) ?? undefined,
            groupKind: existing?.groupKind,
            ownerId: existing?.ownerId,
          },
        };
      });
      setExpandedStack((stack) => promoteExpandedStack(stack, threadId));
    },
    []
  );

  const ingestServerTx = useCallback(
    (tx: Transaction) => {
      if (!txInvolvesMe(tx, me.id)) return;
      if (knownTxIdsRef.current.has(tx.id)) return;
      knownTxIdsRef.current.add(tx.id);

      const peerId = tx.fromId === me.id ? tx.toId : tx.fromId;
      const peerName = tx.fromId === me.id ? tx.toName : tx.fromName;
      const serverMsg = msgFromTx(tx, me.id);

      if (tx.clientTempId) {
        pendingOutRef.current.delete(tx.clientTempId);
      }

      const ingestMeta = {
        seenMark: null as { id: string; status: string } | null,
        wasExpanded: false,
        bumpUnread: false,
      };

      setThreads((prev) => {
        const existing = prev[peerId];
        let messages = existing?.messages ?? [];

        if (messages.some((m) => m.txId === tx.id)) {
          return prev;
        }

        if (tx.fromId === me.id) {
          const idx = messages.findIndex((m) => isOptimisticMatchForTx(m, tx, me.id, peerId));
          if (idx >= 0) {
            const prevMsg = messages[idx];
            const upgraded: ChatMessage = {
              ...serverMsg,
              id: prevMsg.clientTempId || prevMsg.id,
              clientTempId: prevMsg.clientTempId || tx.clientTempId,
            };
            messages = messages.map((m, i) => (i === idx ? upgraded : m));
          } else {
            messages = [...messages, serverMsg];
          }
        } else {
          messages = [...messages, serverMsg];
        }

        ingestMeta.wasExpanded = existing?.expanded ?? false;
        const bumpUnread =
          !ingestMeta.wasExpanded && isTxUnreadForViewer(tx, me.id, seenRef.current);
        ingestMeta.bumpUnread = bumpUnread;
        const unread = (existing?.unread ?? 0) + (bumpUnread ? 1 : 0);

        if (ingestMeta.wasExpanded) {
          ingestMeta.seenMark = { id: tx.id, status: tx.status };
        }

        return {
          ...prev,
          [peerId]: {
            playerId: peerId,
            playerName: peerName,
            messages: sortMessages(messages),
            expanded: ingestMeta.wasExpanded,
            unread: ingestMeta.wasExpanded ? 0 : unread,
          },
        };
      });

      if (ingestMeta.seenMark) {
        persistSeen(markTransactionsSeen(seenRef.current, [ingestMeta.seenMark]));
      }

      if (!ingestMeta.wasExpanded) {
        bumpCollapsedOnly(peerId);
        if (ingestMeta.bumpUnread) pulsePeerAttention(peerId);
      }
    },
    [me.id, bumpCollapsedOnly, persistSeen, pulsePeerAttention]
  );

  const appendOptimisticOut = useCallback(
    (peerId: string, peerName: string, amount: number, note: string, clientTempId: string) => {
      const msg = optimisticMessage(peerId, amount, note, clientTempId);
      pendingOutRef.current.set(clientTempId, { peerId, sentAt: Date.now() });
      setThreads((prev) => {
        const existing = prev[peerId];
        return {
          ...prev,
          [peerId]: {
            playerId: peerId,
            playerName: peerName,
            messages: sortMessages([...(existing?.messages ?? []), msg]),
            expanded: true,
            unread: 0,
          },
        };
      });
      setExpandedStack((stack) => promoteExpandedStack(stack, peerId));
    },
    []
  );

  const markOptimisticFailed = useCallback((clientTempId: string) => {
    const pending = pendingOutRef.current.get(clientTempId);
    pendingOutRef.current.delete(clientTempId);
    if (!pending) return;
    const { peerId } = pending;
    setThreads((prev) => {
      const thread = prev[peerId];
      if (!thread) return prev;
      let changed = false;
      const messages = thread.messages.map((m) => {
        if (!m.txId && m.clientTempId === clientTempId && m.status === "pending") {
          changed = true;
          return { ...m, status: "failed" as const };
        }
        return m;
      });
      if (!changed) return prev;
      return { ...prev, [peerId]: { ...thread, messages } };
    });
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      const now = Date.now();
      for (const [tempId, meta] of [...pendingOutRef.current.entries()]) {
        if (now - meta.sentAt >= OPTIMISTIC_TIMEOUT_MS) {
          markOptimisticFailed(tempId);
        }
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [markOptimisticFailed]);

  useEffect(() => {
    const onError = () => {
      let latest: { tempId: string; sentAt: number } | null = null;
      for (const [tempId, meta] of pendingOutRef.current.entries()) {
        if (!latest || meta.sentAt > latest.sentAt) {
          latest = { tempId, sentAt: meta.sentAt };
        }
      }
      if (latest) markOptimisticFailed(latest.tempId);
    };
    socket.on("error", onError);
    return () => {
      socket.off("error", onError);
    };
  }, [markOptimisticFailed]);

  useEffect(() => {
    for (const tx of myTransactions) {
      if (tx.status !== "pending" && respondingTxRef.current.has(tx.id)) {
        respondingTxRef.current.delete(tx.id);
        setRespondingTxIds(new Set(respondingTxRef.current));
      }

      if (!knownTxIdsRef.current.has(tx.id)) {
        ingestServerTx(tx);
        continue;
      }

      const peerId = tx.fromId === me.id ? tx.toId : tx.fromId;
      let shouldBumpCollapsed = false;
      setThreads((prev) => {
        const thread = prev[peerId];
        if (!thread) return prev;

        let changed = false;
        let unreadBump = false;
        let messages = thread.messages;
        let hasServerCopy = messages.some((m) => m.txId === tx.id);
        if (!hasServerCopy) {
          changed = true;
          messages = sortMessages([...messages, msgFromTx(tx, me.id)]);
          hasServerCopy = true;
          if (!thread.expanded && isTxUnreadForViewer(tx, me.id, seenRef.current)) {
            unreadBump = true;
          }
        }
        messages = messages.flatMap((m) => {
          if (m.txId === tx.id) {
            if (m.status !== tx.status) {
              changed = true;
              if (!thread.expanded && isTxUnreadForViewer(tx, me.id, seenRef.current)) {
                unreadBump = true;
              }
              return [{ ...m, status: tx.status, clientTempId: m.clientTempId || tx.clientTempId }];
            }
            return [m];
          }
          if (isOptimisticMatchForTx(m, tx, me.id, peerId)) {
            changed = true;
            if (hasServerCopy) return [];
            return [
              {
                ...msgFromTx(tx, me.id),
                id: m.clientTempId || m.id,
                clientTempId: m.clientTempId || tx.clientTempId,
              },
            ];
          }
          return [m];
        });

        if (!changed) return prev;

        let unread = thread.unread + (unreadBump ? 1 : 0);
        if (thread.expanded) {
          unread = 0;
          const nextSeen = markTransactionsSeen(seenRef.current, [{ id: tx.id, status: tx.status }]);
          if (nextSeen !== seenRef.current) {
            seenRef.current = nextSeen;
            saveChatSeen(game.roomId, me.id, nextSeen);
            setSeenRevision((v) => v + 1);
          }
        } else if (unreadBump) {
          shouldBumpCollapsed = true;
        }

        return {
          ...prev,
          [peerId]: { ...thread, messages: sortMessages(messages), unread },
        };
      });
      if (shouldBumpCollapsed) {
        bumpCollapsedOnly(peerId);
        pulsePeerAttention(peerId);
      }
    }
  }, [myTransactions, ingestServerTx, me.id, game.roomId, bumpCollapsedOnly, pulsePeerAttention]);

  const handleRespond = useCallback(
    (txId: string, accept: boolean) => {
      if (readOnly) return;
      if (respondingTxRef.current.has(txId)) return;
      const tx = myTransactions.find((t) => t.id === txId && t.status === "pending");
      if (!tx || tx.toId !== me.id) return;

      respondingTxRef.current.add(txId);
      setRespondingTxIds(new Set(respondingTxRef.current));

      const peerId = tx.fromId;
      setThreads((prev) => {
        const t = prev[peerId];
        if (!t) return prev;
        return {
          ...prev,
          [peerId]: {
            ...t,
            expanded: true,
            unread: 0,
            messages: sortMessages(
              t.messages.map((m) =>
                m.txId === txId ? { ...m, status: accept ? "accepted" : "rejected" } : m
              )
            ),
          },
        };
      });
      const nextSeen = markTransactionsSeen(seenRef.current, [
        { id: txId, status: accept ? "accepted" : "rejected" },
      ]);
      persistSeen(nextSeen);
      setExpandedStack((stack) => promoteExpandedStack(stack, peerId));
      socket.emit("respondTransaction", { txId, accept });
    },
    [me.id, myTransactions, persistSeen, readOnly]
  );

  const sendToPeer = useCallback(
    (peerId: string, peerName: string, amount: number, note: string) => {
      if (readOnly) return false;
      if (amount === 0 && !normalizeNoteInput(note)) return false;
      const message = sanitizeTransactionNote(note);
      const clientTempId = newClientTempId();
      const g = gameRef.current;
      const available = playerAvailableWealth(g, me);
      if (amount === 0) {
        appendOptimisticOut(peerId, peerName, 0, message, clientTempId);
        socket.emit("createTransaction", { toId: peerId, amount: 0, note: message, clientTempId });
        return true;
      }
      if (amount <= 0 || amount > available) return false;
      appendOptimisticOut(peerId, peerName, amount, message, clientTempId);
      socket.emit("createTransaction", { toId: peerId, amount, note: message, clientTempId });
      return true;
    },
    [appendOptimisticOut, me, readOnly]
  );

  const sendGroupMessage = useCallback(
    (threadId: string, text: string) => {
      if (!PLAYER_GROUP_CHAT_ENABLED || readOnly) return false;
      const groupId = parseGroupThreadId(threadId);
      if (!groupId || !normalizeNoteInput(text)) return false;
      const message = sanitizeTransactionNote(text);
      const group = gameRef.current.chatGroups?.find((g) => g.id === groupId);
      const clientTempId = newClientTempId();
      appendOptimisticGroup(threadId, group?.name ?? "群聊", message, clientTempId);
      socket.emit("sendGroupMessage", { groupId, text: message, clientTempId });
      return true;
    },
    [appendOptimisticGroup, readOnly]
  );

  const sendGroupMessageRef = useRef(sendGroupMessage);
  sendGroupMessageRef.current = sendGroupMessage;
  const onSendGroupStable = useCallback(
    (threadId: string, text: string) => sendGroupMessageRef.current(threadId, text),
    []
  );

  const handleCreateGroup = useCallback((memberIds: string[], name: string) => {
    if (!PLAYER_GROUP_CHAT_ENABLED) return;
    socket.emit("createChatGroup", { memberIds, name: name || undefined });
  }, []);

  const handleLeaveGroup = useCallback((groupId: string | undefined) => {
    if (!PLAYER_GROUP_CHAT_ENABLED) return;
    if (!groupId) return;
    socket.emit("leaveChatGroup", { groupId });
  }, []);

  const sendToPeerRef = useRef(sendToPeer);
  sendToPeerRef.current = sendToPeer;
  const onSendStable = useCallback(
    (peerId: string, peerName: string, amount: number, note: string) =>
      sendToPeerRef.current(peerId, peerName, amount, note),
    []
  );

  const handleRespondRef = useRef(handleRespond);
  handleRespondRef.current = handleRespond;
  const onRespondStable = useCallback((txId: string, accept: boolean) => {
    handleRespondRef.current(txId, accept);
  }, []);

  const onComposerFocus = useCallback((peerId: string) => {
    activeComposerPeerRef.current = peerId;
  }, []);

  const onComposerImeChange = useCallback((active: boolean) => {
    composerImeActiveRef.current = active;
    if (!active) flushDeferredDockWork();
  }, [flushDeferredDockWork]);

  const onComposerBlur = useCallback(
    (peerId: string) => {
      if (activeComposerPeerRef.current === peerId) {
        activeComposerPeerRef.current = null;
      }
      flushDeferredDockWork();
    },
    [flushDeferredDockWork]
  );

  const respondingTxKey = useMemo(
    () => [...respondingTxIds].sort().join(","),
    [respondingTxIds]
  );

  const collapseHandlersRef = useRef<Record<string, { name: string; fn: () => void }>>({});
  const getCollapseHandler = useCallback(
    (playerId: string, playerName: string) => {
      const cached = collapseHandlersRef.current[playerId];
      if (!cached || cached.name !== playerName) {
        collapseHandlersRef.current[playerId] = {
          name: playerName,
          fn: () => activateThread(playerId, playerName, { expanded: false }),
        };
      }
      return collapseHandlersRef.current[playerId].fn;
    },
    [activateThread]
  );

  const showInboxHeader = dockSummary.totalAttention > 0 && !hasExpandedPeerPanel;
  const inboxPreview =
    dockPreviewHint ??
    (dockSummary.latestAction
      ? `${dockSummary.latestAction.peerName}：${dockSummary.latestAction.preview}`
      : null);
  const inboxBadgeLabel = formatBadge(dockSummary.totalAttention);

  return (
    <div
      ref={dockRef}
      className="player-chat-dock"
      aria-label={PLAYER_GROUP_CHAT_ENABLED ? "玩家私信、转账与群聊" : "玩家私信与转账"}
    >
      {PLAYER_GROUP_CHAT_ENABLED && !readOnly && (
        <button
          type="button"
          className={`player-chat-minibar player-chat-minibar--action${
            myCustomChatGroups.length === 0 ? " player-chat-minibar--create-group" : ""
          }`}
          title={myCustomChatGroups.length === 0 ? "建群聊（当前无群）" : "再建群聊"}
          aria-label={myCustomChatGroups.length === 0 ? "建群聊，当前无群" : "再建群聊"}
          onClick={() => setCreateGroupOpen(true)}
        >
          <span className="player-chat-avatar player-chat-avatar--label">
            {myCustomChatGroups.length === 0 ? "建群" : "+群"}
          </span>
        </button>
      )}
      {displayOrder.map((playerId) => {
        const thread = threads[playerId];
        if (!thread) return null;
        if (!PLAYER_GROUP_CHAT_ENABLED && (thread.threadKind === "group" || isGroupThreadId(playerId))) {
          return null;
        }

        if (thread.expanded) {
          if (thread.threadKind === "group" || isGroupThreadId(playerId)) {
            return (
              <GroupChatPanel
                key={playerId}
                thread={thread}
                displayMessages={thread.messages}
                draftsRef={draftsRef}
                onCollapse={getCollapseHandler(playerId, thread.playerName)}
                onLeaveGroup={
                  thread.groupKind === "custom" && thread.groupId
                    ? () => handleLeaveGroup(thread.groupId)
                    : undefined
                }
                onSend={onSendGroupStable}
                onComposerFocus={onComposerFocus}
                onComposerBlur={onComposerBlur}
                readOnly={readOnly}
              />
            );
          }
          return (
            <ExpandedChatDockPanel
              key={playerId}
              playerId={playerId}
              thread={thread}
              myId={me.id}
              myTransactions={myTransactions}
              respondingTxKey={respondingTxKey}
              maxWealth={maxWealth}
              draftsRef={draftsRef}
              hasMoreOlder={showLoadOlderTx}
              loadingOlder={txLoadingOlder}
              onLoadOlder={loadOlderTransactions}
              onCollapse={getCollapseHandler(playerId, thread.playerName)}
              onRespond={onRespondStable}
              onSend={onSendStable}
              onComposerFocus={onComposerFocus}
              onComposerBlur={onComposerBlur}
              onComposerImeChange={onComposerImeChange}
              readOnly={readOnly}
            />
          );
        }

        const attention = peerDockAttention(playerId, thread.unread, myTransactions, me.id);
        const badge = attention.total;
        const badgeLabel = formatBadge(badge);
        const minibarClass = [
          "player-chat-minibar",
          badge > 0 ? "player-chat-minibar--attention" : "",
          flashPeerId === playerId ? "player-chat-minibar--flash" : "",
        ]
          .filter(Boolean)
          .join(" ");

        return (
          <button
            key={playerId}
            type="button"
            className={minibarClass}
            title={
              badge > 0
                ? `${thread.playerName}（${badgeLabel} 条待查看${attention.pendingTransfers > 0 ? `，含 ${attention.pendingTransfers} 笔待确认转账` : ""}）`
                : thread.playerName
            }
            aria-label={peerMinibarAriaLabel(thread.playerName, attention)}
            onClick={() =>
              activateThread(playerId, thread.playerName, { expanded: true, bumpUnread: false })
            }
          >
            <span className="player-chat-avatar player-chat-avatar--label">
              {thread.threadKind === "group"
                ? thread.groupKind === "public"
                  ? "全"
                  : "群"
                : thread.playerName.length <= 3
                  ? thread.playerName
                  : thread.playerName.slice(0, 2)}
            </span>
            {badge > 0 && (
              <span className="player-chat-badge player-chat-badge--minibar player-chat-badge--attention">
                {badgeLabel}
              </span>
            )}
            {attention.pendingTransfers > 0 && (
              <span className="player-chat-minibar__pending-dot" aria-hidden title="有待确认转账" />
            )}
          </button>
        );
      })}
      {showInboxHeader && (
        <button
          type="button"
          className={`player-chat-inbox-header${inboxFlash ? " player-chat-inbox-header--flash" : ""}`}
          onClick={openLatestAttention}
          aria-live="polite"
          aria-label={`消息，${inboxBadgeLabel} 条待查看${dockSummary.totalPendingTransfers > 0 ? `，${dockSummary.totalPendingTransfers} 笔待确认转账` : ""}`}
        >
          <div className="player-chat-inbox-header__row">
            <span className="player-chat-inbox-header__title">消息</span>
            <span className="player-chat-inbox-header__count">{inboxBadgeLabel}</span>
            {dockSummary.totalPendingTransfers > 0 && (
              <span className="player-chat-inbox-header__pending">
                待确认 {formatBadge(dockSummary.totalPendingTransfers)}
              </span>
            )}
          </div>
          {inboxPreview ? (
            <div className="player-chat-inbox-header__preview">{inboxPreview}</div>
          ) : null}
        </button>
      )}
      {PLAYER_GROUP_CHAT_ENABLED && (
        <CreateGroupModal
          open={createGroupOpen}
          meId={me.id}
          players={game.players}
          onClose={() => setCreateGroupOpen(false)}
          onCreate={handleCreateGroup}
        />
      )}
    </div>
  );
};
