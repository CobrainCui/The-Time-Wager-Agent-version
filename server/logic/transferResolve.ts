import { GameState } from "../state/gameState.js";

/** 收款方处理一笔待确认转账。接收后财富立即入账，落槌按入账后的账面计算。 */
export function resolvePendingTransfer(
  game: GameState,
  txId: string,
  recipientId: string,
  accept: boolean
): { ok: true; status: "accepted" | "rejected"; amount: number } | { ok: false } {
  const tx = game.transactions.find((t) => t.id === txId);
  const player = game.players.find((p) => p.id === recipientId);
  if (!tx || !player || tx.toId !== player.id || tx.status !== "pending") {
    return { ok: false };
  }
  if (!accept) {
    tx.status = "rejected";
    return { ok: true, status: tx.status, amount: tx.amount };
  }
  if (tx.amount === 0) {
    tx.status = "accepted";
    return { ok: true, status: tx.status, amount: 0 };
  }
  const sender = game.players.find((p) => p.id === tx.fromId);
  if (sender && sender.wealth >= tx.amount) {
    sender.wealth -= tx.amount;
    player.wealth += tx.amount;
    tx.status = "accepted";
  } else {
    tx.status = "rejected";
  }
  return { ok: true, status: tx.status, amount: tx.amount };
}
