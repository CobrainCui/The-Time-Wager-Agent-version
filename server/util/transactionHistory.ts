import { Transaction } from "../state/gameState.js";

export const TRANSACTION_HOT_TAIL_SETTLED = 80;
export const TRANSACTION_HISTORY_PAGE_DEFAULT = 80;
export const TRANSACTION_HISTORY_PAGE_MAX = 100;

export interface TransactionLogMeta {
  total: number;
  hasMore: boolean;
}

export interface TransactionHistoryCursor {
  timestamp: number;
  id: string;
}

export function visibleTransactionsForViewer(
  transactions: Transaction[],
  viewerPlayerId: string | null | undefined,
  isGodView: boolean
): Transaction[] {
  if (isGodView) return transactions;
  if (!viewerPlayerId) return [];
  return transactions.filter(
    (t) => t.fromId === viewerPlayerId || t.toId === viewerPlayerId
  );
}

export function compareTransactionsChronological(a: Transaction, b: Transaction): number {
  if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
  return a.id.localeCompare(b.id);
}

export function buildTransactionHotTail(
  visible: Transaction[],
  settledTailCount = TRANSACTION_HOT_TAIL_SETTLED
): Transaction[] {
  const pending = visible.filter((t) => t.status === "pending");
  const settled = visible
    .filter((t) => t.status !== "pending")
    .sort(compareTransactionsChronological);
  const settledTail = settled.slice(-settledTailCount);
  const hot = [...pending, ...settledTail];
  hot.sort(compareTransactionsChronological);
  return hot;
}

export function transactionLogMeta(visible: Transaction[], hotTail: Transaction[]): TransactionLogMeta {
  return {
    total: visible.length,
    hasMore: visible.length > hotTail.length,
  };
}

export function transactionsForViewerPayload(
  allTransactions: Transaction[],
  viewerPlayerId: string | null | undefined,
  isGodView: boolean
): { transactions: Transaction[]; transactionLog: TransactionLogMeta } {
  const visible = visibleTransactionsForViewer(allTransactions, viewerPlayerId, isGodView);
  const hotTail = buildTransactionHotTail(visible);
  return {
    transactions: hotTail,
    transactionLog: transactionLogMeta(visible, hotTail),
  };
}

export function isTransactionOlderThan(tx: Transaction, cursor: TransactionHistoryCursor): boolean {
  if (tx.timestamp < cursor.timestamp) return true;
  if (tx.timestamp > cursor.timestamp) return false;
  return tx.id < cursor.id;
}

export function clampHistoryPageLimit(limit: unknown): number {
  const n = typeof limit === "number" ? limit : Number(limit);
  if (!Number.isFinite(n)) return TRANSACTION_HISTORY_PAGE_DEFAULT;
  return Math.min(
    TRANSACTION_HISTORY_PAGE_MAX,
    Math.max(1, Math.floor(n))
  );
}

/** 返回按时间从旧到新排序的一页（便于客户端 prepend） */
export function fetchTransactionHistoryPage(
  visible: Transaction[],
  cursor: TransactionHistoryCursor,
  limit: number
): { transactions: Transaction[]; hasMore: boolean } {
  const older = visible
    .filter((t) => isTransactionOlderThan(t, cursor))
    .sort((a, b) => compareTransactionsChronological(b, a));
  const pageDesc = older.slice(0, limit);
  const hasMore = older.length > limit;
  pageDesc.reverse();
  return { transactions: pageDesc, hasMore };
}
