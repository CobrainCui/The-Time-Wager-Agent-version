import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { uiRem } from "../../utils/typography";
import { PlayerResourceStatusBar } from "../../components/PlayerResourceStatusBar";

const NOTE_MAX = 500;

/** 教程转账页仅展示两名对手，与真实一对一对话框一致 */
const TUTORIAL_TRANSFER_PEERS = [
  { id: "npc-a", name: "小林" },
  { id: "npc-b", name: "阿杰" },
] as const;

const DEMO_WEALTH = 150;

type DemoMsg = {
  id: string;
  direction: "in" | "out";
  amount: number;
  note: string;
  status: "pending" | "accepted" | "rejected";
};

type DemoThread = {
  playerId: string;
  playerName: string;
  messages: DemoMsg[];
  expanded: boolean;
  unread: number;
};

function formatBubble(m: DemoMsg): string {
  if (m.amount === 0) return m.note || "（私信）";
  const prefix = m.amount > 0 ? `💰 ${m.amount}` : "";
  return m.note ? `${prefix} · ${m.note}` : prefix;
}

function messageStatusMeta(m: DemoMsg): string | null {
  if (m.direction === "out") {
    if (m.amount === 0) return "已发送";
    if (m.status === "pending") return "已发送";
    if (m.status === "accepted") return "对方已收款";
    if (m.status === "rejected") return "对方已退回";
    return null;
  }
  if (m.amount <= 0) return null;
  if (m.status === "accepted") return "已收款";
  if (m.status === "rejected") return "已退回";
  return null;
}

function makeId() {
  return `demo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

const TutorialChatComposer: React.FC<{
  peerId: string;
  maxWealth: number;
  onTutorialSend: (peerId: string, amount: number, note: string) => void;
}> = ({ peerId, maxWealth, onTutorialSend }) => {
  const [amount, setAmount] = useState<number | "">("");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const trimmed = note.trim();
  const effectiveAmount = amount === "" ? 0 : amount;
  const isMsg = effectiveAmount === 0;

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (sending) return;
    if (isMsg && !trimmed) return;
    if (!isMsg && (effectiveAmount <= 0 || effectiveAmount > maxWealth)) return;
    setSending(true);
    onTutorialSend(peerId, effectiveAmount, trimmed);
    setAmount("");
    setNote("");
    window.setTimeout(() => setSending(false), 400);
  };

  return (
    <form onSubmit={onSubmit} className="player-chat-composer" style={{ padding: "0 0.5rem 0.5rem" }}>
      <div style={{ display: "flex", gap: "0.35rem" }}>
        <input
          type="number"
          min={0}
          max={maxWealth}
          className="input"
          placeholder="金额"
          value={amount}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === "") {
              setAmount("");
              return;
            }
            const n = Math.floor(Number(raw));
            if (!Number.isFinite(n)) return;
            setAmount(Math.min(Math.max(0, n), maxWealth));
          }}
          style={{ width: "4.5rem", fontFamily: "var(--font-mono)", fontSize: uiRem(0.8), padding: "0.35rem" }}
        />
        <input
          className="input"
          placeholder={isMsg ? "私信…" : "备注"}
          value={note}
          maxLength={NOTE_MAX}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              (e.currentTarget.form as HTMLFormElement | null)?.requestSubmit();
            }
          }}
          style={{ flex: 1, fontSize: uiRem(0.8), padding: "0.35rem 0.5rem" }}
        />
        <button
          type="submit"
          className="btn btn-primary btn-sm"
          disabled={sending || (isMsg ? !trimmed : effectiveAmount <= 0 || effectiveAmount > maxWealth)}
          style={{ padding: "0.35rem 0.65rem" }}
        >
          {sending ? "…" : "发"}
        </button>
      </div>
    </form>
  );
};

export const DemoTransferAndMessage: React.FC<{ playerName?: string }> = () => {
  const [wealth, setWealth] = useState(DEMO_WEALTH);
  const [threads, setThreads] = useState<Record<string, DemoThread>>(() => {
    const init: Record<string, DemoThread> = {};
    for (const n of TUTORIAL_TRANSFER_PEERS) {
      init[n.id] = {
        playerId: n.id,
        playerName: n.name,
        messages:
          n.id === "npc-a"
            ? [
                {
                  id: "demo-incoming",
                  direction: "in",
                  amount: 8,
                  note: "示例：请点接收或退回",
                  status: "pending",
                },
              ]
            : [],
        expanded: false,
        unread: n.id === "npc-a" ? 1 : 0,
      };
    }
    return init;
  });
  const [threadOrder, setThreadOrder] = useState<string[]>(() => TUTORIAL_TRANSFER_PEERS.map((n) => n.id));
  const dockRef = useRef<HTMLDivElement>(null);

  const hasExpandedPanel = useMemo(() => Object.values(threads).some((t) => t.expanded), [threads]);

  const collapseAllExpanded = useCallback(() => {
    setThreads((prev) => {
      let changed = false;
      const next: Record<string, DemoThread> = { ...prev };
      for (const id of Object.keys(next)) {
        if (next[id].expanded) {
          changed = true;
          next[id] = { ...next[id], expanded: false };
        }
      }
      return changed ? next : prev;
    });
  }, []);

  useEffect(() => {
    if (!hasExpandedPanel) return;

    const onPointerDown = (e: PointerEvent) => {
      const dock = dockRef.current;
      if (!dock || !(e.target instanceof Node)) return;
      if (dock.contains(e.target)) return;
      collapseAllExpanded();
    };

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [hasExpandedPanel, collapseAllExpanded]);

  const displayOrder = useMemo(() => {
    const ids = TUTORIAL_TRANSFER_PEERS.map((n) => n.id);
    const expanded = ids.filter((id) => threads[id]?.expanded);
    const collapsed = ids.filter((id) => !threads[id]?.expanded);
    const sortByOrder = (list: string[]) => {
      const sorted = threadOrder.filter((id) => list.includes(id));
      for (const id of list) {
        if (!sorted.includes(id)) sorted.push(id);
      }
      return sorted;
    };
    return [...sortByOrder(expanded).reverse(), ...sortByOrder(collapsed)];
  }, [threads, threadOrder]);

  const setExpanded = (playerId: string, expanded: boolean) => {
    setThreads((prev) => ({
      ...prev,
      [playerId]: {
        ...prev[playerId],
        expanded,
        unread: expanded ? 0 : prev[playerId].unread,
      },
    }));
    if (expanded) {
      setThreadOrder((order) => [playerId, ...order.filter((id) => id !== playerId)]);
    }
  };

  const respond = (peerId: string, msgId: string, accept: boolean) => {
    const thread = threads[peerId];
    const target = thread?.messages.find((m) => m.id === msgId);
    if (!target || target.status !== "pending" || target.direction !== "in") return;

    if (accept && target.amount > 0) {
      setWealth((w) => w + target.amount);
    }

    setThreads((prev) => ({
      ...prev,
      [peerId]: {
        ...prev[peerId],
        messages: prev[peerId].messages.map((m) =>
          m.id === msgId ? { ...m, status: accept ? "accepted" : "rejected" } : m
        ),
      },
    }));
  };

  const onTutorialSend = (peerId: string, amount: number, note: string) => {
    const trimmed = note.trim();
    if (amount > 0) {
      if (amount > wealth) return;
      setWealth((w) => w - amount);
    }
    setThreads((prev) => {
      const thread = prev[peerId];
      if (!thread) return prev;
      const msg: DemoMsg = {
        id: makeId(),
        direction: "out",
        amount,
        note: trimmed,
        status: amount === 0 ? "accepted" : "pending",
      };
      return {
        ...prev,
        [peerId]: {
          ...thread,
          expanded: true,
          messages: [...thread.messages, msg],
        },
      };
    });
    setThreadOrder((order) => [peerId, ...order.filter((id) => id !== peerId)]);
  };

  return (
    <div className="tutorial-transfer-demo">
      <p
        className="tutorial-transfer-demo__lead"
        style={{ fontSize: uiRem(0.85), color: "var(--color-text-secondary)", marginBottom: "0.75rem" }}
      >
        对局时屏幕<strong>右侧</strong>每位玩家各有一个<strong>一对一</strong>对话框（默认折叠，可同时展开多个、自上而下排列）。消息只发给当前选中的那位；
        <strong>不填金额</strong>（或填 0）并留言即私信；对方仅在与你之间的会话里接收或退回。
      </p>
      <PlayerResourceStatusBar remainingEnergy={10} energyTotal={10} wealth={wealth} />
      <div className="tutorial-chat-demo">
        <div ref={dockRef} className="player-chat-dock tutorial-chat-demo__dock" aria-label="试玩一对一聊天">
          {displayOrder.map((playerId) => {
            const thread = threads[playerId];
            if (!thread) return null;

            if (thread.expanded) {
              return (
                <div key={playerId} className="player-chat-panel">
                  <div className="player-chat-panel-header">
                    <div className="player-chat-panel-title">
                      <span style={{ fontWeight: 800, fontSize: uiRem(0.9) }}>{thread.playerName}</span>
                    </div>
                    <button
                      type="button"
                      className="player-chat-icon-btn"
                      onClick={() => setExpanded(playerId, false)}
                      aria-label="收起"
                    >
                      ─
                    </button>
                  </div>
                  <div className="player-chat-messages">
                    {thread.messages.length === 0 && (
                      <div className="player-chat-empty">暂无记录，发一条试试吧</div>
                    )}
                    {thread.messages.map((m) => {
                      const meta = messageStatusMeta(m);
                      return (
                        <div
                          key={m.id}
                          className={`player-chat-bubble ${m.direction === "out" ? "out" : "in"}`}
                        >
                          <div>{formatBubble(m)}</div>
                          {m.status === "pending" && m.direction === "in" && m.amount > 0 && (
                            <div className="player-chat-bubble-actions">
                              <button
                                type="button"
                                className="btn btn-success btn-sm"
                                onClick={() => respond(playerId, m.id, true)}
                              >
                                接收
                              </button>
                              <button
                                type="button"
                                className="btn btn-danger btn-sm"
                                onClick={() => respond(playerId, m.id, false)}
                              >
                                退回
                              </button>
                            </div>
                          )}
                          {meta && <div className="player-chat-bubble-meta">{meta}</div>}
                        </div>
                      );
                    })}
                  </div>
                  <TutorialChatComposer
                    peerId={playerId}
                    maxWealth={wealth}
                    onTutorialSend={onTutorialSend}
                  />
                </div>
              );
            }

            const badge = thread.unread;

            return (
              <button
                key={playerId}
                type="button"
                className="player-chat-minibar"
                title={thread.playerName}
                aria-label={thread.playerName}
                onClick={() => setExpanded(playerId, true)}
              >
                <span className="player-chat-avatar player-chat-avatar--label">
                  {thread.playerName.length <= 3 ? thread.playerName : thread.playerName.slice(0, 2)}
                </span>
                {badge > 0 && <span className="player-chat-badge player-chat-badge--minibar">{badge}</span>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
