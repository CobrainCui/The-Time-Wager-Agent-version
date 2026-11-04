import React, { memo, useMemo } from "react";
import type { Transaction } from "../../types";
import type { ChatMessage, ChatThread } from "./types";
import { mergeThreadMessages } from "./chatMessageUtils";
import { peerTxSignature, threadMessagesSignature } from "./chatPeerActivity";
import type { ComposerDraft } from "./chatComposerDraft";
import { ChatPanel } from "./ChatPanel";

type Props = {
  playerId: string;
  thread: ChatThread;
  myId: string;
  myTransactions: Transaction[];
  respondingTxKey: string;
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

function orphanTxsForPeer(
  playerId: string,
  thread: ChatThread,
  myTransactions: Transaction[],
  myId: string
): Transaction[] {
  const inThread = new Set(thread.messages.filter((m) => m.txId).map((m) => m.txId!));
  const temps = new Set(thread.messages.filter((m) => m.clientTempId).map((m) => m.clientTempId!));
  return myTransactions.filter((t) => {
    const peer = t.fromId === myId ? t.toId : t.fromId;
    if (peer !== playerId || inThread.has(t.id)) return false;
    if (t.fromId === myId && t.clientTempId && temps.has(t.clientTempId)) return false;
    return true;
  });
}

export const ExpandedChatDockPanel = memo<Props>(function ExpandedChatDockPanel({
  playerId,
  thread,
  myId,
  myTransactions,
  respondingTxKey,
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
  const threadSig = threadMessagesSignature(thread.messages);
  const peerSig = peerTxSignature(myTransactions, playerId, myId);

  const displayMessages = useMemo(() => {
    return mergeThreadMessages(
      thread.messages,
      orphanTxsForPeer(playerId, thread, myTransactions, myId),
      myId
    );
    // threadSig / peerSig gate recompute so other peers' traffic does not refresh this list
  }, [threadSig, peerSig, playerId, myId, thread, myTransactions]);

  const respondingTxIds = useMemo(() => {
    if (!respondingTxKey) return new Set<string>();
    return new Set(respondingTxKey.split(",").filter(Boolean));
  }, [respondingTxKey]);

  return (
    <ChatPanel
      playerId={playerId}
      thread={thread}
      displayMessages={displayMessages}
      respondingTxIds={respondingTxIds}
      maxWealth={maxWealth}
      draftsRef={draftsRef}
      hasMoreOlder={hasMoreOlder}
      loadingOlder={loadingOlder}
      onLoadOlder={onLoadOlder}
      onCollapse={onCollapse}
      onRespond={onRespond}
      onSend={onSend}
      onComposerFocus={onComposerFocus}
      onComposerBlur={onComposerBlur}
      onComposerImeChange={onComposerImeChange}
      readOnly={readOnly}
    />
  );
});
