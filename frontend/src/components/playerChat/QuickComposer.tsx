import React, { memo, useEffect, useRef, useState } from "react";
import { uiRem } from "../../utils/typography";
import {
  normalizeDigitsNonNegativeInt,
  parseNormalizedNonNegativeInt,
} from "../../utils/nonNegativeIntInput";
import type { ComposerDraft } from "./chatComposerDraft";
import {
  isFocusMovingWithin,
  readComposerDraft,
  shouldHydrateComposerFromDraft,
} from "./chatComposerDraft";
import { NOTE_MAX } from "../../utils/transactionNoteFilter";

type DraftsRef = React.MutableRefObject<Record<string, ComposerDraft>>;

type Props = {
  peerId: string;
  peerName: string;
  maxWealth: number;
  draftsRef: DraftsRef;
  onComposerFocus?: (peerId: string) => void;
  onComposerBlur?: (peerId: string) => void;
  onComposerImeChange?: (active: boolean) => void;
  onSend: (peerId: string, peerName: string, amount: number, note: string) => boolean;
};

export const QuickComposer = memo<Props>(function QuickComposer({
  peerId,
  peerName,
  maxWealth,
  draftsRef,
  onComposerFocus,
  onComposerBlur,
  onComposerImeChange,
  onSend,
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const composingRef = useRef(false);
  const focusedRef = useRef(false);
  const [amount, setAmount] = useState<number | "">(
    () => readComposerDraft(draftsRef.current, peerId).amount
  );
  const [note, setNote] = useState(() => readComposerDraft(draftsRef.current, peerId).note);
  const [sending, setSending] = useState(false);

  const persistDraft = (patch: Partial<ComposerDraft>) => {
    const next: ComposerDraft = {
      amount: patch.amount !== undefined ? patch.amount : amount,
      note: patch.note !== undefined ? patch.note : note,
    };
    draftsRef.current[peerId] = next;
  };

  const commitNote = (next: string) => {
    setNote(next);
    persistDraft({ note: next });
  };

  useEffect(() => {
    if (!shouldHydrateComposerFromDraft(focusedRef.current, composingRef.current)) return;
    const d = readComposerDraft(draftsRef.current, peerId);
    setAmount(d.amount);
    setNote(d.note);
  }, [peerId]);

  const trimmed = note.trim();
  const effectiveAmount = amount === "" ? 0 : amount;
  const isMsg = effectiveAmount === 0;

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (sending) return;
    if (isMsg && !trimmed) return;
    if (!isMsg && (effectiveAmount <= 0 || effectiveAmount > maxWealth)) return;
    setSending(true);
    const ok = onSend(peerId, peerName, effectiveAmount, note);
    if (ok) {
      delete draftsRef.current[peerId];
      setAmount("");
      setNote("");
    }
    window.setTimeout(() => setSending(false), 350);
  };

  const handleComposerFocusIn = () => {
    if (focusedRef.current) return;
    focusedRef.current = true;
    onComposerFocus?.(peerId);
  };

  const handleComposerFocusOut = (e: React.FocusEvent<HTMLFormElement>) => {
    const form = formRef.current;
    if (form && isFocusMovingWithin(form, e.relatedTarget)) return;
    composingRef.current = false;
    focusedRef.current = false;
    onComposerImeChange?.(false);
    onComposerBlur?.(peerId);
  };

  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      onFocus={handleComposerFocusIn}
      onBlur={handleComposerFocusOut}
      className="player-chat-composer"
    >
      <div style={{ display: "flex", gap: "0.35rem" }}>
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          className="input"
          placeholder="金额"
          value={amount === "" ? "" : String(amount)}
          onChange={(e) => {
            const normalized = normalizeDigitsNonNegativeInt(e.target.value);
            let nextAmount: number | "" = "";
            if (normalized !== "") {
              const n = parseNormalizedNonNegativeInt(normalized, 0);
              nextAmount = Math.min(n, maxWealth);
            }
            setAmount(nextAmount);
            persistDraft({ amount: nextAmount });
          }}
          style={{ width: "4.5rem", fontFamily: "var(--font-mono)", fontSize: uiRem(0.8), padding: "0.35rem" }}
        />
        <input
          className="input"
          placeholder={isMsg ? "私信…" : "备注"}
          value={note}
          maxLength={NOTE_MAX}
          onChange={(e) => commitNote(e.target.value)}
          onCompositionStart={() => {
            composingRef.current = true;
            onComposerImeChange?.(true);
          }}
          onCompositionEnd={(e) => {
            composingRef.current = false;
            onComposerImeChange?.(false);
            commitNote(e.currentTarget.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !composingRef.current) {
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
});
