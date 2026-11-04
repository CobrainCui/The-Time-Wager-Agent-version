import { Player, Transaction } from "../../types";
import { badgeCount } from "./chatMessageUtils";
import { ChatSeenSnapshot, isTxUnreadForViewer } from "./chatSeenStorage";
import type { ChatThread } from "./types";

export type PeerDockAttention = {
  total: number;
  unreadMessages: number;
  pendingTransfers: number;
};

export type DockLatestAction = {
  peerId: string;
  peerName: string;
  kind: "transfer" | "dm";
  preview: string;
  timestamp: number;
};

export type DockAttentionSummary = {
  totalAttention: number;
  totalUnreadMessages: number;
  totalPendingTransfers: number;
  latestAction: DockLatestAction | null;
};

function pendingIncomingFromPeer(transactions: Transaction[], peerId: string, myId: string): number {
  return transactions.filter(
    (t) =>
      t.fromId === peerId &&
      t.toId === myId &&
      t.status === "pending" &&
      t.amount > 0
  ).length;
}

export function peerDockAttention(
  peerId: string,
  threadUnread: number,
  transactions: Transaction[],
  myId: string
): PeerDockAttention {
  const pendingTransfers = pendingIncomingFromPeer(transactions, peerId, myId);
  const unreadMessages = threadUnread;
  return {
    unreadMessages,
    pendingTransfers,
    total: badgeCount(unreadMessages, pendingTransfers),
  };
}


function transferPreview(tx: Transaction): string {
  return `向你转账 ${tx.amount}（待确认）`;
}

function dmPreview(tx: Transaction, maxLen = 48): string {
  const note = (tx.note || "").trim();
  if (!note) return "（私信）";
  return note.length <= maxLen ? note : `${note.slice(0, maxLen)}…`;
}

/** Priority: pending transfer > unread DM; then newest timestamp. */
export function pickLatestDockAction(
  peers: Player[],
  transactions: Transaction[],
  myId: string,
  seen: ChatSeenSnapshot
): DockLatestAction | null {
  const nameById = new Map(peers.map((p) => [p.id, p.name]));
  let best: DockLatestAction | null = null;

  const consider = (candidate: DockLatestAction, priority: number) => {
    if (!best) {
      best = { ...candidate, timestamp: candidate.timestamp };
      (best as DockLatestAction & { _p?: number })._p = priority;
      return;
    }
    const bestP = (best as DockLatestAction & { _p?: number })._p ?? 0;
    if (priority > bestP || (priority === bestP && candidate.timestamp > best.timestamp)) {
      best = { ...candidate };
      (best as DockLatestAction & { _p?: number })._p = priority;
    }
  };

  for (const t of transactions) {
    if (t.toId !== myId) continue;
    const peerId = t.fromId;
    const peerName = t.fromName || nameById.get(peerId) || "玩家";

    if (t.status === "pending" && t.amount > 0) {
      consider(
        {
          peerId,
          peerName,
          kind: "transfer",
          preview: transferPreview(t),
          timestamp: t.timestamp,
        },
        2
      );
      continue;
    }

    if (t.amount === 0 && isTxUnreadForViewer(t, myId, seen)) {
      consider(
        {
          peerId,
          peerName,
          kind: "dm",
          preview: dmPreview(t),
          timestamp: t.timestamp,
        },
        1
      );
    }
  }

  if (best) {
    delete (best as DockLatestAction & { _p?: number })._p;
  }
  return best;
}

export function summarizeDockAttention(
  peers: Player[],
  threads: Record<string, ChatThread>,
  transactions: Transaction[],
  myId: string,
  seen: ChatSeenSnapshot = {}
): DockAttentionSummary {
  let totalAttention = 0;
  let totalUnreadMessages = 0;
  let totalPendingTransfers = 0;

  for (const p of peers) {
    const thread = threads[p.id];
    const att = peerDockAttention(p.id, thread?.unread ?? 0, transactions, myId);
    totalAttention += att.total;
    totalUnreadMessages += att.unreadMessages;
    totalPendingTransfers += att.pendingTransfers;
  }

  const latestAction = pickLatestDockAction(peers, transactions, myId, seen);

  return {
    totalAttention,
    totalUnreadMessages,
    totalPendingTransfers,
    latestAction,
  };
}

/** Sort key for collapsed peers: higher = earlier in list. */
export function peerAttentionSortKey(
  peerId: string,
  threadUnread: number,
  transactions: Transaction[],
  myId: string
): number {
  const att = peerDockAttention(peerId, threadUnread, transactions, myId);
  if (att.pendingTransfers > 0) return 2_000_000_000 + att.pendingTransfers;
  if (att.total > 0) return 1_000_000_000 + att.total;
  return 0;
}

export function sortCollapsedPeerIds(
  collapsedIds: string[],
  threads: Record<string, ChatThread>,
  transactions: Transaction[],
  myId: string,
  recencyOrder: string[]
): string[] {
  const recencyIndex = new Map(recencyOrder.map((id, i) => [id, i]));
  return [...collapsedIds].sort((a, b) => {
    const ka = peerAttentionSortKey(a, threads[a]?.unread ?? 0, transactions, myId);
    const kb = peerAttentionSortKey(b, threads[b]?.unread ?? 0, transactions, myId);
    if (kb !== ka) return kb - ka;
    return (recencyIndex.get(a) ?? 999) - (recencyIndex.get(b) ?? 999);
  });
}

export function peerMinibarAriaLabel(
  peerName: string,
  attention: PeerDockAttention
): string {
  if (attention.total <= 0) return peerName;
  const parts: string[] = [`${peerName}，${attention.total} 条待查看`];
  if (attention.pendingTransfers > 0) {
    parts.push(`含 ${attention.pendingTransfers} 笔待确认转账`);
  }
  return parts.join("，");
}
