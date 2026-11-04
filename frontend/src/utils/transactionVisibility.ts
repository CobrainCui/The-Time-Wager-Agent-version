import { Transaction } from "../types";

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
