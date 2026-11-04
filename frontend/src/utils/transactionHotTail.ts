import { Transaction } from "../types";

export const TRANSACTION_HOT_TAIL_SETTLED = 80;

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

export function transactionLogMeta(
  visible: Transaction[],
  hotTail: Transaction[]
): { total: number; hasMore: boolean } {
  return {
    total: visible.length,
    hasMore: visible.length > hotTail.length,
  };
}
