import OpenAI from "openai";
import type { AgentConfig } from "./config.js";
import { createLogger } from "./logger.js";

const log = createLogger("llm");
const clients = new Map<string, OpenAI>();

export class LlmFailureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LlmFailureError";
  }
}

export class TokenBudgetExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TokenBudgetExceededError";
  }
}

export interface LlmUsage {
  prompt: number;
  completion: number;
  total: number;
  calls: number;
}

const usageByAgent = new Map<number, LlmUsage>();

export function resetAgentUsage(agentIndex: number): void {
  usageByAgent.set(agentIndex, { prompt: 0, completion: 0, total: 0, calls: 0 });
}

export function getAgentUsage(agentIndex: number): LlmUsage {
  return usageByAgent.get(agentIndex) ?? { prompt: 0, completion: 0, total: 0, calls: 0 };
}

function recordUsage(
  agentIndex: number,
  usage: { prompt: number; completion: number; total: number } | undefined
): LlmUsage {
  const current = getAgentUsage(agentIndex);
  if (usage) {
    current.prompt += usage.prompt;
    current.completion += usage.completion;
    current.total += usage.total;
    current.calls += 1;
  } else {
    current.calls += 1;
  }
  usageByAgent.set(agentIndex, current);
  return current;
}

function getClient(agent: AgentConfig): OpenAI {
  const key = `${agent.index}:${agent.baseURL ?? "default"}:${agent.apiKey}`;
  let client = clients.get(key);
  if (!client) {
    client = new OpenAI({
      apiKey: agent.apiKey,
      ...(agent.baseURL ? { baseURL: agent.baseURL } : {}),
    });
    clients.set(key, client);
  }
  return client;
}

function stripJsonFence(text: string): string {
  let t = text.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  }
  const first = t.indexOf("{");
  const last = t.lastIndexOf("}");
  if (first >= 0 && last > first) t = t.slice(first, last + 1);
  return t;
}

function escapeControlCharsInStrings(text: string): string {
  let out = "";
  let inString = false;
  let escaped = false;
  for (const ch of text) {
    if (!inString) {
      if (ch === '"') inString = true;
      out += ch;
      continue;
    }
    if (escaped) {
      out += ch;
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      out += ch;
      escaped = true;
    } else if (ch === '"') {
      out += ch;
      inString = false;
    } else if (ch === "\n") {
      out += "\\n";
    } else if (ch === "\r") {
      out += "\\r";
    } else if (ch === "\t") {
      out += "\\t";
    } else {
      out += ch;
    }
  }
  return out;
}

function parseJson(text: string): unknown {
  const base = stripJsonFence(text);
  const escaped = escapeControlCharsInStrings(base);
  const noTrailingCommas = base.replace(/,\s*([}\]])/g, "$1");
  const candidates = [
    base,
    escaped,
    noTrailingCommas,
    escapeControlCharsInStrings(noTrailingCommas),
    base.replace(/[“”]/g, '"').replace(/[‘’]/g, "'"),
  ];
  let lastError: unknown;
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

export interface LlmResult {
  ok: true;
  data: unknown;
  raw: string;
  usage?: { prompt: number; completion: number; total: number };
  latencyMs: number;
}

export interface AskOptions {
  timeoutMs: number;
  maxRetries: number;
  maxOutputTokens: number;
  tokenBudget: number;
  /** 用于日志与错误信息 */
  label: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestOnce(
  agent: AgentConfig,
  system: string,
  user: string,
  opts: AskOptions,
  useJsonMode: boolean
): Promise<{ data: unknown; raw: string; usage?: LlmResult["usage"]; latencyMs: number }> {
  const client = getClient(agent);
  const startedAt = Date.now();
  const params: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming = {
    model: agent.model,
    temperature: agent.temperature,
    max_tokens: opts.maxOutputTokens,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    ...(useJsonMode ? { response_format: { type: "json_object" } } : {}),
  };

  const request = client.chat.completions.create(params, { timeout: opts.timeoutMs });
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`timeout ${opts.timeoutMs}ms`)),
      opts.timeoutMs + 500
    );
  });
  let response: OpenAI.Chat.ChatCompletion;
  try {
    response = (await Promise.race([request, timeout])) as OpenAI.Chat.ChatCompletion;
  } finally {
    if (timer) clearTimeout(timer);
  }

  const raw = response.choices[0]?.message?.content ?? "";
  const usage = response.usage
    ? {
        prompt: response.usage.prompt_tokens,
        completion: response.usage.completion_tokens,
        total: response.usage.total_tokens,
      }
    : undefined;
  if (!raw.trim()) {
    throw new Error(
      `empty response (finish_reason=${response.choices[0]?.finish_reason ?? "?"})`
    );
  }
  return { data: parseJson(raw), raw, usage, latencyMs: Date.now() - startedAt };
}

/**
 * 调用单个 Agent 的模型。
 *
 * 实验版不提供规则兜底：重试耗尽后抛出 LlmFailureError，由上层终止本局并标记失败。
 * 这保证「模型失败」不会被静默替换成另一种策略，污染条件比较。
 */
export async function askAgentJson(
  agent: AgentConfig,
  system: string,
  user: string,
  opts: AskOptions
): Promise<LlmResult> {
  const tagged = `agent#${agent.index}/${agent.name}/${agent.provider}/${agent.model}/${opts.label}`;
  const before = getAgentUsage(agent.index);
  if (before.total >= opts.tokenBudget) {
    throw new TokenBudgetExceededError(
      `${tagged} 已达 token 上限（${before.total}/${opts.tokenBudget}），终止本局。`
    );
  }

  const errors: string[] = [];
  for (let attempt = 1; attempt <= opts.maxRetries; attempt++) {
    const useJsonMode = attempt === 1;
    try {
      const result = await requestOnce(agent, system, user, opts, useJsonMode);
      const total = recordUsage(agent.index, result.usage);
      log.info(
        `${tagged} 成功 tokens=${result.usage?.total ?? "?"} ` +
          `(in ${result.usage?.prompt ?? "?"} / out ${result.usage?.completion ?? "?"}) ` +
          `latency=${result.latencyMs}ms 累计=${total.total}/${opts.tokenBudget}`
      );
      if (total.total > opts.tokenBudget) {
        throw new TokenBudgetExceededError(
          `${tagged} 本局 token ${total.total} 超过上限 ${opts.tokenBudget}，终止本局。`
        );
      }
      return {
        ok: true,
        data: result.data,
        raw: result.raw,
        usage: result.usage,
        latencyMs: result.latencyMs,
      };
    } catch (e) {
      if (e instanceof TokenBudgetExceededError) throw e;
      const message = e instanceof Error ? e.message : String(e);
      errors.push(`attempt ${attempt}: ${message}`);
      log.warn(`${tagged} 第 ${attempt}/${opts.maxRetries} 次失败：${message}`);
      if (attempt < opts.maxRetries) {
        await sleep(700 * attempt + Math.floor(Math.random() * 300));
      }
    }
  }

  throw new LlmFailureError(
    `${tagged} 调用失败（已重试 ${opts.maxRetries} 次）：${errors.join(" | ")}`
  );
}
