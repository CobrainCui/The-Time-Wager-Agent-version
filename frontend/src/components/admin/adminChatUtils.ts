import { ChatGroup, GroupMessage, Transaction } from "../../types";

export type AdminTxFilter = "all" | "dm" | "transfer" | "pending" | "group";

export const TX_STATUS_LABEL: Record<Transaction["status"], string> = {
  pending: "待确认",
  accepted: "已接受",
  rejected: "已拒绝",
};

export function formatAdminTxTime(ts: number): string {
  try {
    return new Date(ts).toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return "";
  }
}

export function formatAdminTxTimeShort(ts: number): string {
  try {
    return new Date(ts).toLocaleString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export function pairKey(idA: string, idB: string): string {
  return idA < idB ? `${idA}|${idB}` : `${idB}|${idA}`;
}

export function matchesTxFilter(tx: Transaction, filter: AdminTxFilter): boolean {
  if (filter === "all") return true;
  if (filter === "dm") return tx.amount === 0;
  if (filter === "transfer") return tx.amount > 0;
  return tx.amount > 0 && tx.status === "pending";
}

export type AdminChatSession = {
  key: string;
  conversationKind: "pair" | "group";
  title: string;
  leftId: string;
  rightId: string;
  leftName: string;
  rightName: string;
  txMessages: Transaction[];
  groupMessages: GroupMessage[];
  lastTimestamp: number;
  pendingCount: number;
  lastPreview: string;
  groupId?: string;
};

function previewForTx(tx: Transaction): string {
  if (tx.amount === 0) {
    const note = (tx.note || "").trim();
    return note || "（私信）";
  }
  const note = (tx.note || "").trim();
  const base = `转账 ${tx.amount}`;
  if (!note) return base;
  const clipped = note.length > 24 ? `${Array.from(note).slice(0, 24).join("")}…` : note;
  return `${base} · ${clipped}`;
}

/** 会话列表行：筛选时摘要与排序时间对应当前筛选项 */
export function getSessionListMeta(
  session: AdminChatSession,
  filter: AdminTxFilter
): { preview: string; sortTimestamp: number } {
  if (session.conversationKind === "group") {
    const last = session.groupMessages[session.groupMessages.length - 1];
    return {
      preview: last ? previewGroupMsg(last) : session.lastPreview,
      sortTimestamp: last?.timestamp ?? session.lastTimestamp,
    };
  }
  if (filter === "all") {
    return { preview: session.lastPreview, sortTimestamp: session.lastTimestamp };
  }
  const matching = session.txMessages.filter((tx) => matchesTxFilter(tx, filter));
  const last = matching[matching.length - 1];
  if (!last) {
    return { preview: session.lastPreview, sortTimestamp: session.lastTimestamp };
  }
  return { preview: previewForTx(last), sortTimestamp: last.timestamp };
}

export function buildAdminChatSessions(transactions: Transaction[]): AdminChatSession[] {
  const byKey = new Map<string, { txs: Transaction[]; names: Map<string, string> }>();

  for (const tx of transactions) {
    const key = pairKey(tx.fromId, tx.toId);
    let bucket = byKey.get(key);
    if (!bucket) {
      bucket = { txs: [], names: new Map() };
      byKey.set(key, bucket);
    }
    bucket.txs.push(tx);
    bucket.names.set(tx.fromId, tx.fromName);
    bucket.names.set(tx.toId, tx.toName);
  }

  const sessions: AdminChatSession[] = [];
  for (const [key, { txs, names }] of byKey) {
    const sorted = [...txs].sort((a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id));
    const ids = key.split("|");
    const idA = ids[0]!;
    const idB = ids[1]!;
    const leftId = idA < idB ? idA : idB;
    const rightId = idA < idB ? idB : idA;
    const last = sorted[sorted.length - 1]!;
    const pendingCount = sorted.filter((t) => t.amount > 0 && t.status === "pending").length;
    sessions.push({
      key,
      conversationKind: "pair",
      title: `${names.get(leftId) || leftId} ↔ ${names.get(rightId) || rightId}`,
      leftId,
      rightId,
      leftName: names.get(leftId) || leftId,
      rightName: names.get(rightId) || rightId,
      txMessages: sorted,
      groupMessages: [],
      lastTimestamp: last.timestamp,
      pendingCount,
      lastPreview: previewForTx(last),
    });
  }

  sessions.sort((a, b) => b.lastTimestamp - a.lastTimestamp || a.key.localeCompare(b.key));
  return sessions;
}

export function buildAdminGroupSessions(
  chatGroups: ChatGroup[],
  groupMessages: GroupMessage[]
): AdminChatSession[] {
  const byGroup = new Map<string, GroupMessage[]>();
  for (const m of groupMessages) {
    const list = byGroup.get(m.groupId) ?? [];
    list.push(m);
    byGroup.set(m.groupId, list);
  }
  const sessions: AdminChatSession[] = [];
  for (const g of chatGroups) {
    const sorted = [...(byGroup.get(g.id) ?? [])].sort(
      (a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id)
    );
    const last = sorted[sorted.length - 1];
    sessions.push({
      key: `g:${g.id}`,
      conversationKind: "group",
      title: g.name,
      leftId: g.memberIds[0] ?? g.id,
      rightId: g.memberIds[1] ?? g.id,
      leftName: g.name,
      rightName: "",
      txMessages: [],
      groupMessages: sorted,
      lastTimestamp: last?.timestamp ?? g.createdAt,
      pendingCount: 0,
      lastPreview: last ? previewGroupMsg(last) : "（暂无消息）",
      groupId: g.id,
    });
  }
  sessions.sort((a, b) => b.lastTimestamp - a.lastTimestamp || a.key.localeCompare(b.key));
  return sessions;
}

function previewGroupMsg(m: GroupMessage): string {
  const t = (m.text || "").trim();
  const clipped = t.length > 28 ? `${Array.from(t).slice(0, 28).join("")}…` : t;
  return `${m.fromName}：${clipped || "（空）"}`;
}

export function buildAdminAllSessions(
  transactions: Transaction[],
  chatGroups: ChatGroup[],
  groupMessages: GroupMessage[]
): AdminChatSession[] {
  return [...buildAdminGroupSessions(chatGroups, groupMessages), ...buildAdminChatSessions(transactions)].sort(
    (a, b) => b.lastTimestamp - a.lastTimestamp || a.key.localeCompare(b.key)
  );
}

export function sessionMatchesSearch(session: AdminChatSession, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (session.conversationKind === "group") {
    if (session.title.toLowerCase().includes(q)) return true;
    return session.groupMessages.some(
      (m) =>
        m.fromName.toLowerCase().includes(q) || (m.text || "").toLowerCase().includes(q)
    );
  }
  return session.leftName.toLowerCase().includes(q) || session.rightName.toLowerCase().includes(q);
}

export function sessionTitle(session: AdminChatSession): string {
  return session.title;
}
