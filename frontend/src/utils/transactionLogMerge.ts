import type { Transaction } from "../types";

export function compareTransactionsChronological(a: Transaction, b: Transaction): number {
  if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
  return a.id.localeCompare(b.id);
}

/** 按 id 合并热尾与分页，保留较新的 status */
export function mergeTransactionLog(
  prev: Map<string, Transaction>,
  incoming: Transaction[]
): Map<string, Transaction> {
  const next = new Map(prev);
  for (const tx of incoming) {
    const existing = next.get(tx.id);
    if (!existing) {
      next.set(tx.id, tx);
      continue;
    }
    next.set(tx.id, { ...existing, ...tx });
  }
  return next;
}

export function sortedTransactionsFromMap(map: Map<string, Transaction>): Transaction[] {
  return [...map.values()].sort(compareTransactionsChronological);
}

export function oldestTransactionCursor(
  txs: Transaction[]
): { timestamp: number; id: string } | null {
  if (txs.length === 0) return null;
  let oldest = txs[0];
  for (const tx of txs) {
    if (compareTransactionsChronological(tx, oldest) < 0) {
      oldest = tx;
    }
  }
  return { timestamp: oldest.timestamp, id: oldest.id };
}

/** 本地已合并条数是否仍少于服务端本场可见总数 */
export function archiveLoadIncomplete(loadedCount: number, total: number): boolean {
  return total > 0 && loadedCount < total;
}
