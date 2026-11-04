import type { Transaction } from "../../types";
import type { ChatMessage } from "./types";

export function peerTxSignature(
  transactions: Transaction[],
  peerId: string,
  myId: string
): string {
  return transactions
    .filter((t) => (t.fromId === myId ? t.toId : t.fromId) === peerId)
    .map((t) => `${t.id}:${t.status}`)
    .join("|");
}

export function threadMessagesSignature(messages: ChatMessage[]): string {
  return messages.map((m) => `${m.id}:${m.status}:${m.txId ?? ""}`).join("|");
}
