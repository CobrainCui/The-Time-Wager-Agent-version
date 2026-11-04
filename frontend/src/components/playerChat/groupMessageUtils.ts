import type { GroupMessage } from "../../types";
import type { ChatMessage, ChatThread } from "./types";
import { sortMessages } from "./chatMessageUtils";

export function msgFromGroupMessage(m: GroupMessage, myId: string): ChatMessage {
  return {
    id: m.id,
    txId: m.id,
    clientTempId: m.clientTempId,
    peerId: m.groupId,
    direction: m.fromId === myId ? "out" : "in",
    amount: 0,
    note: m.text,
    status: "accepted",
    timestamp: m.timestamp,
    senderLabel: m.fromId === myId ? undefined : m.fromName,
  };
}

export function isOptimisticMatchForGroupMsg(m: ChatMessage, gm: GroupMessage, myId: string): boolean {
  if (m.txId || m.direction !== "out" || gm.fromId !== myId) return false;
  if (gm.clientTempId && m.clientTempId) {
    return m.clientTempId === gm.clientTempId;
  }
  return m.note === gm.text;
}

export type MergeGroupMessageEffects = {
  applied: boolean;
  wasExpanded: boolean;
  bumpUnread: boolean;
  seenIds: string[];
};

/** 将服务端群消息合并进线程（与乐观发送对账），供同一次 setState 内与群列表同步 */
export function mergeServerGroupMessageIntoThread(
  thread: ChatThread,
  gm: GroupMessage,
  myId: string,
  isMessageUnread: (messageId: string) => boolean
): { thread: ChatThread; effects: MergeGroupMessageEffects } {
  const effects: MergeGroupMessageEffects = {
    applied: false,
    wasExpanded: thread.expanded,
    bumpUnread: false,
    seenIds: [],
  };
  if (thread.messages.some((m) => m.id === gm.id)) {
    return { thread, effects };
  }

  const serverMsg = msgFromGroupMessage(gm, myId);
  let messages = thread.messages;

  if (gm.fromId === myId) {
    const idx = messages.findIndex((m) => isOptimisticMatchForGroupMsg(m, gm, myId));
    if (idx >= 0) {
      const prevMsg = messages[idx];
      messages = messages.map((m, i) =>
        i === idx
          ? {
              ...serverMsg,
              id: prevMsg.clientTempId || prevMsg.id,
              clientTempId: prevMsg.clientTempId || gm.clientTempId,
            }
          : m
      );
    } else {
      messages = [...messages, serverMsg];
    }
  } else {
    messages = [...messages, serverMsg];
  }

  const bumpUnread =
    !thread.expanded && gm.fromId !== myId && isMessageUnread(gm.id);
  if (thread.expanded) {
    effects.seenIds.push(gm.id);
  }
  effects.bumpUnread = bumpUnread;
  effects.applied = true;

  return {
    thread: {
      ...thread,
      messages: sortMessages(messages),
      unread: thread.expanded ? 0 : (thread.unread ?? 0) + (bumpUnread ? 1 : 0),
    },
    effects,
  };
}
