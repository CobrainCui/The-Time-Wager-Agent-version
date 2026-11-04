import fs from "node:fs";
import path from "node:path";

/**
 * 每个 Agent 的滚动社会记忆。
 *
 * 不做 LLM 摘要（成本不可控且不可复现），而是把「自己做过什么、别人对我说过什么、
 * 上一轮结果如何」按轮次压缩成结构化条目，注入下一次提示词。原始条目同时落盘，
 * 便于赛后核对 Agent 到底记得什么。
 */

export type MemoryEntryType =
  | "action"
  | "chat"
  | "transfer"
  | "prediction"
  | "outcome"
  | "notice";

export interface MemoryEntry {
  ts: number;
  sessionId: string;
  globalRound: number;
  era: number;
  roundInEra: number;
  type: MemoryEntryType;
  text: string;
  data?: Record<string, unknown>;
}

function safeName(value: string): string {
  return value.replace(/[^\w一-龥-]+/g, "_").slice(0, 80) || "session";
}

export class AgentMemory {
  private readonly agentIndex: number;
  private readonly dir: string;
  private readonly enabled: boolean;
  private entries: MemoryEntry[] = [];
  private sessionKey = "";
  private sessionId = "";
  private filePath: string | null = null;

  constructor(agentIndex: number, dir: string, enabled: boolean) {
    this.agentIndex = agentIndex;
    this.dir = dir;
    this.enabled = enabled;
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  beginSession(sessionKey: string, sessionId: string): void {
    if (sessionKey === this.sessionKey) return;
    this.sessionKey = sessionKey;
    this.sessionId = sessionId;
    this.entries = [];
    this.filePath = null;
    if (!this.enabled) return;
    try {
      fs.mkdirSync(this.dir, { recursive: true });
      this.filePath = path.join(
        this.dir,
        `agent-${this.agentIndex}-${safeName(sessionId || sessionKey)}.jsonl`
      );
      fs.writeFileSync(this.filePath, "", "utf8");
    } catch {
      this.filePath = null;
    }
  }

  record(
    type: MemoryEntryType,
    text: string,
    context: { globalRound: number; era: number; roundInEra: number; data?: Record<string, unknown> }
  ): void {
    if (!this.enabled) return;
    const entry: MemoryEntry = {
      ts: Date.now(),
      sessionId: this.sessionId,
      globalRound: context.globalRound,
      era: context.era,
      roundInEra: context.roundInEra,
      type,
      text: text.slice(0, 800),
      ...(context.data ? { data: context.data } : {}),
    };
    this.entries.push(entry);
    if (this.entries.length > 400) this.entries = this.entries.slice(-400);
    if (!this.filePath) return;
    try {
      fs.appendFileSync(this.filePath, `${JSON.stringify(entry)}\n`, "utf8");
    } catch {
      /* 记忆落盘失败不阻塞对局；控制台仍会提示 */
    }
  }

  /** 注入提示词的历史摘要；按轮次分组，保留最近 maxChars 个字符。 */
  digest(maxChars = 5000): string {
    if (!this.enabled || this.entries.length === 0) return "（本局暂无历史记忆）";
    const byRound = new Map<number, MemoryEntry[]>();
    for (const e of this.entries) {
      const list = byRound.get(e.globalRound) ?? [];
      list.push(e);
      byRound.set(e.globalRound, list);
    }
    const rounds = [...byRound.keys()].sort((a, b) => a - b);
    const sections: string[] = [];
    for (const round of rounds) {
      const entries = byRound.get(round)!;
      const lines = entries.slice(-12).map((e) => `  · [${e.type}] ${e.text}`);
      sections.push(`第 ${round} 轮：\n${lines.join("\n")}`);
    }
    let text = sections.join("\n");
    if (text.length > maxChars) text = `…（更早记忆已省略）\n${text.slice(-maxChars)}`;
    return text;
  }

  /** 当前会话全部条目，供赛后检查。 */
  snapshot(): MemoryEntry[] {
    return [...this.entries];
  }
}
