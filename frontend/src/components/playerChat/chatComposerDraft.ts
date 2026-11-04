export type ComposerDraft = {
  amount: number | "";
  note: string;
};

export const EMPTY_COMPOSER_DRAFT: ComposerDraft = { amount: "", note: "" };

export type ComposerDraftStore = Record<string, ComposerDraft>;

export function readComposerDraft(store: ComposerDraftStore, peerId: string): ComposerDraft {
  return store[peerId] ?? EMPTY_COMPOSER_DRAFT;
}

export function writeComposerDraft(
  store: ComposerDraftStore,
  peerId: string,
  draft: ComposerDraft
): ComposerDraftStore {
  return { ...store, [peerId]: draft };
}

export function clearComposerDraft(store: ComposerDraftStore, peerId: string): ComposerDraftStore {
  if (!store[peerId]) return store;
  const next = { ...store };
  delete next[peerId];
  return next;
}

/** 聚焦或 IME 合成中时不从 draftsRef 反向灌入受控输入 */
export function shouldHydrateComposerFromDraft(focused: boolean, composing: boolean): boolean {
  return !focused && !composing;
}

/** 焦点是否在同一 composer 表单内移动（金额 ↔ 备注不应算失焦） */
export function isFocusMovingWithin(
  container: Pick<HTMLElement, "contains">,
  relatedTarget: EventTarget | null
): boolean {
  if (relatedTarget == null) return false;
  try {
    return container.contains(relatedTarget as Node);
  } catch {
    return false;
  }
}
