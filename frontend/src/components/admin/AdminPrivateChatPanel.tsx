import React, { memo, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { Transaction, ChatGroup, GroupMessage } from "../../types";
import { AdminSectionPerspectiveSelect } from "./AdminSectionPerspectiveSelect";
import {
  AdminTxFilter,
  TX_STATUS_LABEL,
  buildAdminAllSessions,
  formatAdminTxTime,
  formatAdminTxTimeShort,
  getSessionListMeta,
  matchesTxFilter,
  sessionMatchesSearch,
  sessionTitle,
} from "./adminChatUtils";
import { PLAYER_GROUP_CHAT_ENABLED } from "../../config/playerChatFeatures";

const FILTER_OPTIONS_ALL: { id: AdminTxFilter; label: string }[] = [
  { id: "all", label: "全部" },
  { id: "group", label: "群聊" },
  { id: "dm", label: "私信" },
  { id: "transfer", label: "转账" },
  { id: "pending", label: "待确认" },
];

function adminFilterOptions(): { id: AdminTxFilter; label: string }[] {
  return PLAYER_GROUP_CHAT_ENABLED
    ? FILTER_OPTIONS_ALL
    : FILTER_OPTIONS_ALL.filter((o) => o.id !== "group");
}

type Props = {
  roomId: string;
  transactions: Transaction[];
  chatGroups?: ChatGroup[];
  groupMessages?: GroupMessage[];
  total: number;
  showLoadOlder: boolean;
  loadingOlder: boolean;
  onLoadOlder: () => void;
  messageScrollRef: React.RefObject<HTMLDivElement | null>;
  onMessageScroll: () => void;
  atBottom: boolean;
  onScrollToLatest: () => void;
  perspectivePlayers?: { id: string; name: string }[];
  viewAsPlayerId?: string;
  onViewAsPlayerIdChange?: (playerId: string) => void;
};

function AdminMessageBubble({
  tx,
  leftId,
}: {
  tx: Transaction;
  leftId: string;
}) {
  const isLeft = tx.fromId === leftId;
  const isDm = tx.amount === 0;
  const sideClass = isLeft ? "admin-chat-bubble--left" : "admin-chat-bubble--right";

  return (
    <div className={`admin-chat-msg ${isLeft ? "admin-chat-msg--left" : "admin-chat-msg--right"}`}>
      <div className="admin-chat-msg-sender">{tx.fromName}</div>
      <div
        className={`admin-chat-bubble ${sideClass} ${isDm ? "admin-chat-bubble--dm" : "admin-chat-bubble--transfer"}`}
      >
        {!isDm && (
          <div className="admin-chat-bubble-amount">
            <span>转账 {tx.amount}</span>
            <span className={`admin-chat-status admin-chat-status--${tx.status}`}>
              {TX_STATUS_LABEL[tx.status]}
            </span>
          </div>
        )}
        {(isDm || (tx.note || "").trim()) && (
          <div className="admin-chat-bubble-body">{isDm ? tx.note || "（私信）" : tx.note}</div>
        )}
        {!isDm && !(tx.note || "").trim() && (
          <div className="admin-chat-bubble-body admin-chat-bubble-body--muted">（无备注）</div>
        )}
        <div className="admin-chat-bubble-time">{formatAdminTxTime(tx.timestamp)}</div>
      </div>
    </div>
  );
}

function AdminGroupMessageBubble({ msg }: { msg: GroupMessage }) {
  return (
    <div className="admin-chat-msg admin-chat-msg--left">
      <div className="admin-chat-msg-sender">{msg.fromName}</div>
      <div className="admin-chat-bubble admin-chat-bubble--left admin-chat-bubble--dm">
        <div className="admin-chat-bubble-body">{msg.text || "（空）"}</div>
        <div className="admin-chat-bubble-time">{formatAdminTxTime(msg.timestamp)}</div>
      </div>
    </div>
  );
}

export const AdminPrivateChatPanel = memo<Props>(function AdminPrivateChatPanel({
  roomId,
  transactions,
  chatGroups = [],
  groupMessages = [],
  total,
  showLoadOlder,
  loadingOlder,
  onLoadOlder,
  messageScrollRef,
  onMessageScroll,
  atBottom,
  onScrollToLatest,
  perspectivePlayers = [],
  viewAsPlayerId = "",
  onViewAsPlayerIdChange,
}) {
  const [filter, setFilter] = useState<AdminTxFilter>("all");
  const [search, setSearch] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  useEffect(() => {
    setFilter("all");
    setSearch("");
    setSelectedKey(null);
  }, [roomId]);

  useEffect(() => {
    if (!PLAYER_GROUP_CHAT_ENABLED && filter === "group") setFilter("all");
  }, [filter]);

  const sessions = useMemo(
    () => buildAdminAllSessions(transactions, chatGroups, groupMessages),
    [transactions, chatGroups, groupMessages]
  );

  const filteredSessions = useMemo(() => {
    let list = sessions.filter((s) => {
      if (!sessionMatchesSearch(s, search)) return false;
      if (filter === "all") return true;
      if (filter === "group") return s.conversationKind === "group";
      if (s.conversationKind === "group") return false;
      return s.txMessages.some((tx) => matchesTxFilter(tx, filter));
    });
    if (filter !== "all") {
      list = [...list].sort((a, b) => {
        const ma = getSessionListMeta(a, filter);
        const mb = getSessionListMeta(b, filter);
        return mb.sortTimestamp - ma.sortTimestamp || a.key.localeCompare(b.key);
      });
    }
    return list;
  }, [sessions, search, filter]);

  useEffect(() => {
    if (filteredSessions.length === 0) {
      setSelectedKey(null);
      return;
    }
    setSelectedKey((prev) => {
      if (prev && filteredSessions.some((s) => s.key === prev)) return prev;
      return filteredSessions[0]!.key;
    });
  }, [filteredSessions]);

  useLayoutEffect(() => {
    if (!selectedKey) return;
    onScrollToLatest();
  }, [selectedKey, filter, onScrollToLatest]);

  const activeSession = useMemo(
    () => filteredSessions.find((s) => s.key === selectedKey) ?? null,
    [filteredSessions, selectedKey]
  );

  const threadMessages = useMemo(() => {
    if (!activeSession) return { txs: [] as Transaction[], groups: [] as GroupMessage[] };
    if (activeSession.conversationKind === "group") {
      return { txs: [], groups: activeSession.groupMessages };
    }
    if (filter === "all") return { txs: activeSession.txMessages, groups: [] };
    return {
      txs: activeSession.txMessages.filter((tx) => matchesTxFilter(tx, filter)),
      groups: [],
    };
  }, [activeSession, filter]);

  const emptyAll = transactions.length === 0 && groupMessages.length === 0;

  return (
    <div className="admin-chat-panel">
      <div className="admin-chat-panel-header">
        <div className="admin-chat-panel-heading">
          <h2 className="admin-chat-panel-title">私信与转账</h2>
          <span className="admin-chat-panel-meta">
            本场 {total} 条 · 只读
            {viewAsPlayerId ? " · 玩家视角" : ""}
            {showLoadOlder ? " · 可加载更早" : ""}
          </span>
        </div>
        {perspectivePlayers.length > 0 && onViewAsPlayerIdChange && (
          <AdminSectionPerspectiveSelect
            label="视角"
            value={viewAsPlayerId}
            onChange={onViewAsPlayerIdChange}
            players={perspectivePlayers}
          />
        )}
        <div className="admin-chat-filters" role="tablist" aria-label="筛选类型">
          {adminFilterOptions().map((opt) => (
            <button
              key={opt.id}
              type="button"
              role="tab"
              aria-selected={filter === opt.id}
              className={`admin-chat-filter-btn ${filter === opt.id ? "admin-chat-filter-btn--active" : ""}`}
              onClick={() => setFilter(opt.id)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {emptyAll ? (
        <div className="admin-chat-empty-all">
          {PLAYER_GROUP_CHAT_ENABLED ? "暂无私信、转账或群聊" : "暂无私信或转账"}
        </div>
      ) : (
        <div className="admin-chat-body">
          <aside className="admin-chat-list" aria-label="会话列表">
            <label className="admin-chat-search">
              <span className="sr-only">按玩家姓名搜索</span>
              <input
                type="search"
                className="input"
                placeholder="搜索玩家姓名…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            {filteredSessions.length === 0 ? (
              <div className="admin-chat-empty-list">没有匹配的会话</div>
            ) : (
              <ul className="admin-chat-session-list">
                {filteredSessions.map((s) => {
                  const active = s.key === selectedKey;
                  const meta = getSessionListMeta(s, filter);
                  return (
                    <li key={s.key}>
                      <button
                        type="button"
                        className={`admin-chat-session-row ${active ? "admin-chat-session-row--active" : ""}`}
                        onClick={() => setSelectedKey(s.key)}
                      >
                        <div className="admin-chat-session-row-top">
                          <span className="admin-chat-session-names">{sessionTitle(s)}</span>
                          <span className="admin-chat-session-time">{formatAdminTxTimeShort(meta.sortTimestamp)}</span>
                        </div>
                        <div className="admin-chat-session-row-bottom">
                          <span className="admin-chat-session-preview">{meta.preview}</span>
                          {s.pendingCount > 0 && (
                            <span className="admin-chat-session-badge" title="待确认转账">
                              {s.pendingCount > 99 ? "99+" : s.pendingCount}
                            </span>
                          )}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </aside>

          <section className="admin-chat-thread" aria-label="会话消息">
            {!activeSession ? (
              <div className="admin-chat-empty-thread">没有匹配的会话</div>
            ) : (
              <>
                <div className="admin-chat-thread-header">
                  <h3 className="admin-chat-thread-title">{sessionTitle(activeSession)}</h3>
                  <span className="admin-chat-thread-count">
                    {threadMessages.txs.length + threadMessages.groups.length} 条
                  </span>
                </div>
                <div
                  ref={messageScrollRef}
                  className="admin-chat-messages"
                  onScroll={onMessageScroll}
                >
                  {showLoadOlder && (
                    <div className="admin-chat-load-older">
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        disabled={loadingOlder}
                        onClick={onLoadOlder}
                      >
                        {loadingOlder ? "加载中…" : "加载更早"}
                      </button>
                    </div>
                  )}
                  {threadMessages.txs.length + threadMessages.groups.length === 0 ? (
                    <div className="admin-chat-empty-thread-inner">当前筛选下暂无消息</div>
                  ) : (
                    <>
                      {threadMessages.groups.map((msg) => (
                        <AdminGroupMessageBubble key={msg.id} msg={msg} />
                      ))}
                      {threadMessages.txs.map((tx) => (
                        <AdminMessageBubble key={tx.id} tx={tx} leftId={activeSession.leftId} />
                      ))}
                    </>
                  )}
                  {!atBottom && threadMessages.txs.length + threadMessages.groups.length > 0 && (
                    <div className="admin-chat-scroll-latest">
                      <button type="button" className="btn btn-primary btn-sm" onClick={onScrollToLatest}>
                        回到最新
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
});
