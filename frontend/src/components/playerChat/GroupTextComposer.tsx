import React, { memo, useEffect, useRef, useState } from "react";
import { uiRem } from "../../utils/typography";
import { normalizeNoteInput, sanitizeTransactionNote, NOTE_MAX } from "../../utils/transactionNoteFilter";
import type { ComposerDraft } from "./chatComposerDraft";
import { readComposerDraft } from "./chatComposerDraft";

type DraftsRef = React.MutableRefObject<Record<string, ComposerDraft>>;

type Props = {
  threadId: string;
  draftsRef: DraftsRef;
  onComposerFocus?: (threadId: string) => void;
  onComposerBlur?: (threadId: string) => void;
  onSend: (threadId: string, text: string) => boolean;
};

export const GroupTextComposer = memo<Props>(function GroupTextComposer({
  threadId,
  draftsRef,
  onComposerFocus,
  onComposerBlur,
  onSend,
}) {
  const [note, setNote] = useState("");
  const composingRef = useRef(false);

  useEffect(() => {
    const draft = readComposerDraft(draftsRef.current, threadId);
    setNote(draft.note);
  }, [threadId, draftsRef]);

  const persistDraft = (nextNote: string) => {
    draftsRef.current[threadId] = { amount: "", note: nextNote };
  };

  const trimmed = normalizeNoteInput(note);
  const canSend = trimmed.length > 0;

  return (
    <form
      className="player-chat-composer"
      onSubmit={(e) => {
        e.preventDefault();
        if (composingRef.current || !canSend) return;
        const text = sanitizeTransactionNote(note);
        if (onSend(threadId, text)) {
          setNote("");
          persistDraft("");
        }
      }}
    >
      <div style={{ display: "flex", gap: "0.35rem", alignItems: "center" }}>
        <input
          type="text"
          className="input"
          placeholder="群消息…"
          value={note}
          maxLength={NOTE_MAX}
          onChange={(e) => {
            const v = e.target.value;
            setNote(v);
            persistDraft(v);
          }}
          onFocus={() => onComposerFocus?.(threadId)}
          onBlur={() => onComposerBlur?.(threadId)}
          onCompositionStart={() => {
            composingRef.current = true;
          }}
          onCompositionEnd={(e) => {
            composingRef.current = false;
            const v = e.currentTarget.value;
            setNote(v);
            persistDraft(v);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !composingRef.current) {
              e.preventDefault();
              (e.currentTarget.form as HTMLFormElement | null)?.requestSubmit();
            }
          }}
        />
        <button
          type="submit"
          className="btn btn-primary btn-sm"
          disabled={!canSend}
          style={{ padding: "0.35rem 0.65rem", fontSize: uiRem(0.75), flexShrink: 0 }}
        >
          发送
        </button>
      </div>
    </form>
  );
});
