export interface ChatMessage {
  id: string;
  txId?: string;
  /** 乐观发送临时 id，与 Transaction.clientTempId 对齐 */
  clientTempId?: string;
  /** 对话另一方玩家 id（乐观发送时用于严格一对一匹配） */
  peerId?: string;
  direction: "in" | "out";
  amount: number;
  note: string;
  status: "pending" | "accepted" | "rejected" | "failed";
  timestamp: number;
  /** 群聊入站消息展示发送者 */
  senderLabel?: string;
}

export interface ChatThread {
  playerId: string;
  playerName: string;
  messages: ChatMessage[];
  expanded: boolean;
  unread: number;
  threadKind?: "peer" | "group";
  groupId?: string;
  groupKind?: "public" | "custom";
  ownerId?: string;
}
