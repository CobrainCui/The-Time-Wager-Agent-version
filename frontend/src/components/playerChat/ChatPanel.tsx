import React, { memo, useEffect, useRef, useState } from "react";
import { uiRem } from "../../utils/typography";
import type { ChatMessage, ChatThread } from "./types";
import { formatBubbleText, messageStatusMeta } from "./chatMessageUtils";
import type { ComposerDraft } from "./chatComposerDraft";
import { QuickComposer } from "./QuickComposer";

const IncomingRespondActions: React.FC<{
  txId: string;
  disabled: boolean;
  onRespond: (txId: string, accept: boolean) => void;
}> = ({ txId, disabled, onRespond }) => (
  <div className="player-chat-bubble-actions">
    <button type="button" className="btn btn-success btn-sm" disabled={disabled} onClick={() => onRespond(txId, true)}>
      接收
    </button>
    <button type="button" className="btn btn-danger btn-sm" disabled={disabled} onClick={() => onRespond(txId, false)}>
      退回
    </button>
  </div>
);

export type ChatPanelProps = {
  playerId: string;
  thread: ChatThread;
  displayMessages: ChatMessage[];
  respondingTxIds: Set<string>;
  maxWealth: number;
  draftsRef: React.MutableRefObject<Record<string, ComposerDraft>>;
  hasMoreOlder?: boolean;
  loadingOlder?: boolean;
  onLoadOlder?: () => void;
  onCollapse: () => void;
  onRespond: (txId: string, accept: boolean) => void;
  onSend: (peerId: string, peerName: string, amount: number, note: string) => boolean;
  onComposerFocus: (peerId: string) => void;
  onComposerBlur: (peerId: string) => void;
  onComposerImeChange?: (active: boolean) => void;
  readOnly?: boolean;
};

export const ChatPanel = memo<ChatPanelProps>(function ChatPanel({
  playerId,
  thread,
  displayMessages,
  respondingTxIds,
  maxWealth,
  draftsRef,
  hasMoreOlder,
  loadingOlder,
  onLoadOlder,
  onCollapse,
  onRespond,
  onSend,
  onComposerFocus,
  onComposerBlur,
  onComposerImeChange,
  readOnly = false,
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(0);
  const [stickToBottom, setStickToBottom] = useState(true);
  const loadOlderLatchRef = useRef(false);

  useEffect(() => {
    if (!loadingOlder) loadOlderLatchRef.current = false;
  }, [loadingOlder]);

  const composerFocusedRef = useRef(false);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (composerFocusedRef.current) {
      prevCountRef.current = displayMessages.length;
      return;
    }
    if (stickToBottom && displayMessages.length >= prevCountRef.current) {
      el.scrollTop = el.scrollHeight;
    }
    prevCountRef.current = displayMessages.length;
  }, [displayMessages, stickToBottom]);

  return (
    <div className="player-chat-panel">
      <div className="player-chat-panel-header">
        <div className="player-chat-panel-title">
          <span className="player-chat-panel-name">{thread.playerName}</span>
        </div>
        <button type="button" className="player-chat-icon-btn" onClick={onCollapse} aria-label="收起">
          ─
        </button>
      </div>
      <div
        ref={listRef}
        className="player-chat-messages"
        onScroll={() => {
          const el = listRef.current;
          if (!el) return;
          const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 32;
          setStickToBottom(atBottom);
          if (el.scrollTop < 24 && hasMoreOlder && !loadingOlder && !loadOlderLatchRef.current) {
            loadOlderLatchRef.current = true;
            onLoadOlder?.();
          }
        }}
      >
        {hasMoreOlder && (
          <div style={{ textAlign: "center", marginBottom: "0.35rem" }}>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={loadingOlder}
              onClick={() => onLoadOlder?.()}
              style={{ fontSize: uiRem(0.7), padding: "0.2rem 0.5rem" }}
            >
              {loadingOlder ? "…" : "更早消息"}
            </button>
          </div>
        )}
        {displayMessages.length === 0 && <div className="player-chat-empty">暂无记录，发一条试试吧</div>}
        {displayMessages.map((m) => {
          const meta = messageStatusMeta(m);
          return (
            <div
              key={m.clientTempId || m.txId || m.id}
              className={`player-chat-bubble ${m.direction === "out" ? "out" : "in"}${
                m.status === "failed" ? " failed" : ""
              }`}
            >
              <div>{formatBubbleText(m)}</div>
              {m.status === "pending" && m.direction === "in" && m.txId && m.amount > 0 && (
                <IncomingRespondActions
                  txId={m.txId}
                  disabled={readOnly || respondingTxIds.has(m.txId)}
                  onRespond={onRespond}
                />
              )}
              {meta && <div className="player-chat-bubble-meta">{meta}</div>}
            </div>
          );
        })}
        {!stickToBottom && displayMessages.length > 0 && (
          <div style={{ position: "sticky", bottom: 0, textAlign: "center", paddingTop: "0.35rem" }}>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              style={{ fontSize: uiRem(0.7) }}
              onClick={() => {
                const el = listRef.current;
                if (el) el.scrollTop = el.scrollHeight;
                setStickToBottom(true);
              }}
            >
              回到最新
            </button>
          </div>
        )}
      </div>
      {!readOnly && (
        <QuickComposer
          peerId={playerId}
          peerName={thread.playerName}
          maxWealth={maxWealth}
          draftsRef={draftsRef}
          onComposerFocus={(id) => {
            composerFocusedRef.current = true;
            onComposerFocus(id);
          }}
          onComposerBlur={(id) => {
            composerFocusedRef.current = false;
            onComposerBlur(id);
            if (stickToBottom && listRef.current) {
              listRef.current.scrollTop = listRef.current.scrollHeight;
            }
          }}
          onComposerImeChange={onComposerImeChange}
          onSend={onSend}
        />
      )}
    </div>
  );
});
