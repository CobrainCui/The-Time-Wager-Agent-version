import type { DirectMessage, GameState } from "../state/gameState.js";
import { isAiPlayer } from "../util/isAiPlayer.js";
import {
  MAX_CHAT_MESSAGE_LENGTH,
  chatQuotaError,
  recordPrivateChat,
} from "./chatQuota.js";
import {
  maskForbiddenText,
  normalizeNoteInput,
  sanitizeTransactionNote,
  truncateNotePreview,
} from "./forbiddenText.js";

export type SendDirectMessageResult =
  | { ok: true; message: DirectMessage; notifyTargetId: string; preview: string }
  | { ok: false; error: string };

function ensure(game: GameState): DirectMessage[] {
  if (!game.directMessages) game.directMessages = [];
  return game.directMessages;
}

/** 私聊对玩家只暴露自己收发的；上帝视角看全部。 */
export function directMessagesForViewer(
  game: GameState,
  viewerPlayerId: string | null | undefined,
  isGodView: boolean
): DirectMessage[] {
  const all = game.directMessages ?? [];
  if (isGodView) return all;
  if (!viewerPlayerId) return [];
  return all.filter((m) => m.fromId === viewerPlayerId || m.toId === viewerPlayerId);
}

export function sendDirectMessage(
  game: GameState,
  senderId: string,
  toId: string,
  rawText: unknown,
  clientTempId?: string
): SendDirectMessageResult {
  const quota = chatQuotaError(game, senderId, "private");
  if (quota) return { ok: false, error: quota };

  const sender = game.players.find((p) => p.id === senderId);
  const receiver = game.players.find((p) => p.id === toId);
  if (!sender || !receiver) return { ok: false, error: "找不到私聊对象" };
  if (sender.id === receiver.id) return { ok: false, error: "不能给自己发私聊" };
  if (isAiPlayer(receiver)) return { ok: false, error: "该对象不接受私聊" };

  const trimmed = normalizeNoteInput(rawText);
  if (!trimmed) return { ok: false, error: "私聊内容不能为空" };
  const text = sanitizeTransactionNote(trimmed).slice(0, MAX_CHAT_MESSAGE_LENGTH);
  const safeText = maskForbiddenText(text);

  const tempId =
    typeof clientTempId === "string" && clientTempId.length > 0 && clientTempId.length <= 64
      ? clientTempId
      : undefined;

  const message: DirectMessage = {
    id: `dm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    fromId: sender.id,
    fromName: sender.name,
    toId: receiver.id,
    toName: receiver.name,
    text: safeText,
    timestamp: Date.now(),
    era: game.currentEra,
    roundInEra: game.roundInEra,
    globalRound: game.globalRound,
    clientTempId: tempId,
  };
  ensure(game).push(message);
  recordPrivateChat(game, senderId);

  return {
    ok: true,
    message,
    notifyTargetId: receiver.id,
    preview: truncateNotePreview(safeText, 48),
  };
}
