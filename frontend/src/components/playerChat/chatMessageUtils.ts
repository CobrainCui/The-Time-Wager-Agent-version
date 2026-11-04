import { Transaction } from "../../types";
import type { ChatMessage } from "./types";

export function msgFromTx(tx: Transaction, myId: string): ChatMessage {
  return {
    id: tx.id,
    txId: tx.id,
    clientTempId: tx.clientTempId,
    peerId: tx.fromId === myId ? tx.toId : tx.fromId,
    direction: tx.fromId === myId ? "out" : "in",
    amount: tx.amount,
    note: tx.note || "",
    status: tx.status,
    timestamp: tx.timestamp,
  };
}

export function sortMessages(messages: ChatMessage[]): ChatMessage[] {
  return [...messages].sort((a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id));
}

/** 乐观气泡是否对应某条服务端交易（优先 clientTempId） */
export function isOptimisticMatchForTx(
  m: ChatMessage,
  tx: Transaction,
  meId: string,
  peerId: string
): boolean {
  if (m.txId || m.direction !== "out" || tx.fromId !== meId) return false;
  if (m.peerId != null && m.peerId !== peerId) return false;
  if (tx.clientTempId && m.clientTempId) {
    return m.clientTempId === tx.clientTempId;
  }
  return m.amount === tx.amount && m.note === (tx.note || "");
}

/**
 * 合并本地会话与尚未写入 thread 的服务端记录。
 * - 按 txId / clientTempId 去重
 * - 己方发出的孤儿交易若仍有匹配乐观气泡，不叠第二份（交由 ingest 升级）
 */
export function mergeThreadMessages(
  threadMessages: ChatMessage[],
  orphanTxs: Transaction[],
  myId: string
): ChatMessage[] {
  const seenTx = new Set<string>();
  const seenTemp = new Set<string>();
  const merged: ChatMessage[] = [];

  for (const m of threadMessages) {
    if (m.txId) {
      if (seenTx.has(m.txId)) continue;
      seenTx.add(m.txId);
    }
    if (m.clientTempId) {
      if (seenTemp.has(m.clientTempId) && m.txId) {
        // 同 clientTempId 已有带 txId 的，跳过纯乐观残留
        continue;
      }
      seenTemp.add(m.clientTempId);
    }
    merged.push(m);
  }

  for (const tx of orphanTxs) {
    if (seenTx.has(tx.id)) continue;
    if (tx.clientTempId && seenTemp.has(tx.clientTempId)) continue;

    const peerId = tx.fromId === myId ? tx.toId : tx.fromId;
    if (tx.fromId === myId) {
      const hasOptimisticTwin = merged.some((m) => isOptimisticMatchForTx(m, tx, myId, peerId));
      if (hasOptimisticTwin) continue;
    }

    merged.push(msgFromTx(tx, myId));
    seenTx.add(tx.id);
    if (tx.clientTempId) seenTemp.add(tx.clientTempId);
  }

  return sortMessages(merged);
}

export function formatBubbleText(m: ChatMessage): string {
  if (m.amount === 0) return m.note || "（私信）";
  const prefix = m.amount > 0 ? `💰 ${m.amount}` : "";
  return m.note ? `${prefix} · ${m.note}` : prefix;
}

/** 微信式状态：收发方向区分文案 */
export function messageStatusMeta(m: ChatMessage): string | null {
  if (m.status === "failed") return "发送失败";
  if (m.amount === 0) {
    if (m.direction === "out" && !m.txId && m.status === "pending") return "发送中…";
    return null;
  }
  if (m.status === "pending") {
    if (m.direction === "out" && !m.txId) return "发送中…";
    if (m.direction === "out") return "等待对方确认";
    return null;
  }
  if (m.direction === "out") {
    if (m.status === "accepted") return "对方已收款";
    return "对方已退回";
  }
  if (m.status === "accepted") return "已收款";
  return "已退回";
}

export function badgeCount(unread: number, pending: number): number {
  return Math.max(unread, pending);
}

export function formatBadge(n: number): string {
  if (n <= 0) return "";
  return n > 99 ? "99+" : String(n);
}

export function newClientTempId(): string {
  return `ct-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}
