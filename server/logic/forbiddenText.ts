import { FORBIDDEN_WORDS } from "../data/forbiddenWords.js";

export const NOTE_MAX = 500;

export type ForbiddenWordList = {
  zh: readonly string[];
  en: readonly string[];
};

const ZERO_WIDTH_RE = /[\u200B-\u200D\uFEFF]/g;

const IGNORABLE = new Set([" ", "\n", "\r", "\t", ".", "_", "*", "·"]);

/** 空白类分隔符：英文词边界（与 f.u.c.k 用的点号分隔不同） */
const WORD_BREAK = new Set([" ", "\n", "\r", "\t"]);

function normalizeChar(c: string): string {
  const n = c.normalize("NFKC");
  if (n.length !== 1) return n;
  if (/[a-zA-Z]/.test(n)) return n.toLowerCase();
  return n;
}

function isZeroWidthChar(c: string): boolean {
  return /[\u200B-\u200D\uFEFF]/.test(c);
}

function isIgnorable(c: string): boolean {
  return IGNORABLE.has(c) || isZeroWidthChar(c);
}

function isEnglishLetter(c: string): boolean {
  const n = normalizeChar(c);
  return n.length === 1 && /[a-z]/.test(n);
}

function englishWordStartOk(units: readonly string[], firstLetterIndex: number): boolean {
  for (let k = firstLetterIndex - 1; k >= 0; k--) {
    const c = units[k];
    if (WORD_BREAK.has(c)) return true;
    if (isIgnorable(c)) continue;
    return !isEnglishLetter(c);
  }
  return true;
}

function englishWordEndOk(units: readonly string[], endExclusive: number): boolean {
  for (let k = endExclusive; k < units.length; k++) {
    const c = units[k];
    if (WORD_BREAK.has(c)) return true;
    if (isIgnorable(c)) continue;
    return !isEnglishLetter(c);
  }
  return true;
}

/** 从 start 起尝试匹配已规范化的词（英文已小写），成功则返回码点区间 [start, end) */
function tryMatchSpan(
  units: readonly string[],
  wordNorm: string,
  start: number,
  english: boolean
): { start: number; end: number } | null {
  if (!wordNorm) return null;

  let wi = 0;
  let j = start;
  let firstLetterIndex: number | null = null;
  while (wi < wordNorm.length) {
    while (j < units.length && isIgnorable(units[j])) j++;
    if (j >= units.length) return null;
    if (normalizeChar(units[j]) !== wordNorm[wi]) return null;
    if (firstLetterIndex === null) firstLetterIndex = j;
    wi++;
    j++;
  }

  const end = j;
  if (english) {
    if (firstLetterIndex === null) return null;
    if (!englishWordStartOk(units, firstLetterIndex)) return null;
    if (!englishWordEndOk(units, end)) return null;
    return { start: firstLetterIndex, end };
  }
  return { start, end };
}

function normalizeWord(raw: string, english: boolean): string {
  const stripped = raw.replace(ZERO_WIDTH_RE, "");
  let out = "";
  for (const c of stripped) {
    if (english && isIgnorable(c)) continue;
    out += normalizeChar(c);
  }
  return english ? out.toLowerCase() : out;
}

function collectSpans(
  units: readonly string[],
  word: string,
  english: boolean
): Array<{ start: number; end: number }> {
  const wordNorm = normalizeWord(word, english);
  if (!wordNorm) return [];
  const spans: Array<{ start: number; end: number }> = [];
  for (let i = 0; i < units.length; i++) {
    const span = tryMatchSpan(units, wordNorm, i, english);
    if (span) spans.push(span);
  }
  return spans;
}

/** 所有命中区间并集（对标微信：同一句里多处、多语种命中都要遮住） */
function applyMaskUnion(units: string[], spans: Array<{ start: number; end: number }>): string {
  if (spans.length === 0) return units.join("");
  const masked = new Uint8Array(units.length);
  for (const { start, end } of spans) {
    const from = Math.max(0, start);
    const to = Math.min(units.length, end);
    for (let i = from; i < to; i++) masked[i] = 1;
  }
  return units.map((c, i) => (masked[i] ? "*" : c)).join("");
}

export function normalizeNoteInput(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.trim().slice(0, NOTE_MAX);
}

/** 通知/气泡预览截断，不在 surrogate 对中间切断 */
export function truncateNotePreview(note: string, maxChars: number): string {
  const units = Array.from(note);
  if (units.length <= maxChars) return note;
  return `${units.slice(0, maxChars).join("")}…`;
}

/** 命中片段替换为等长 *，不提示具体词 */
export function maskForbiddenText(
  note: string,
  lists: ForbiddenWordList = FORBIDDEN_WORDS
): string {
  if (!note) return note;

  const units = Array.from(note);
  const allSpans: Array<{ start: number; end: number }> = [];
  for (const w of lists.zh) {
    allSpans.push(...collectSpans(units, w, false));
  }
  for (const w of lists.en) {
    allSpans.push(...collectSpans(units, w, true));
  }

  return applyMaskUnion([...units], allSpans);
}

/** trim + 长度截断 + 屏蔽（createTransaction 入口） */
export function sanitizeTransactionNote(raw: unknown, lists?: ForbiddenWordList): string {
  const trimmed = normalizeNoteInput(raw);
  return maskForbiddenText(trimmed, lists);
}
