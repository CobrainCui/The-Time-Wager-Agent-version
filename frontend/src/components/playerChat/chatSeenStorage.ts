import { Transaction } from "../../types";

/** txId -> last seen status while viewing the peer thread */
export type ChatSeenSnapshot = Record<string, string>;

export function chatSeenStorageKey(roomId: string, playerId: string): string {
  return `chat-seen:${roomId}:${playerId}`;
}

export function loadChatSeen(roomId: string, playerId: string): ChatSeenSnapshot {
  try {
    const raw = sessionStorage.getItem(chatSeenStorageKey(roomId, playerId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as ChatSeenSnapshot;
  } catch {
    return {};
  }
}

export function saveChatSeen(roomId: string, playerId: string, snapshot: ChatSeenSnapshot): void {
  try {
    sessionStorage.setItem(chatSeenStorageKey(roomId, playerId), JSON.stringify(snapshot));
  } catch {
    /* quota / private mode */
  }
}

export function markTransactionsSeen(
  snapshot: ChatSeenSnapshot,
  txs: Array<{ id: string; status: string }>
): ChatSeenSnapshot {
  let next = snapshot;
  for (const t of txs) {
    if (next[t.id] === t.status) continue;
    if (next === snapshot) next = { ...snapshot };
    next[t.id] = t.status;
  }
  return next;
}

/**
 * Whether a server transaction should increase collapsed-thread unread.
 * - Incoming: not yet seen at this status (e.g. new DM or new pending transfer).
 * - Outgoing: only when status changed since last view (transfer receipt).
 */
export function isTxUnreadForViewer(tx: Transaction, myId: string, seen: ChatSeenSnapshot): boolean {
  if (seen[tx.id] === tx.status) return false;

  if (tx.toId === myId) {
    return seen[tx.id] === undefined || seen[tx.id] !== tx.status;
  }

  if (tx.fromId === myId) {
    if (seen[tx.id] === undefined) return tx.status !== "pending";
    return seen[tx.id] !== tx.status;
  }

  return false;
}

const GROUP_SEEN = "1";

export function isGroupMessageUnread(messageId: string, seen: ChatSeenSnapshot): boolean {
  return seen[messageId] !== GROUP_SEEN;
}

export function markGroupMessagesSeen(
  snapshot: ChatSeenSnapshot,
  messageIds: string[]
): ChatSeenSnapshot {
  let next = snapshot;
  for (const id of messageIds) {
    if (next[id] === GROUP_SEEN) continue;
    if (next === snapshot) next = { ...snapshot };
    next[id] = GROUP_SEEN;
  }
  return next;
}
