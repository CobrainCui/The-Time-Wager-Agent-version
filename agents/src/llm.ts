import OpenAI from "openai";
import type { AgentConfig } from "./config.js";
import { createLogger } from "./logger.js";

const log = createLogger("llm");
const clients = new Map<string, OpenAI>();

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

function parseJson(text: string): unknown {
  const cleaned = stripJsonFence(text);
  return JSON.parse(cleaned);
}

export interface LlmResult {
  ok: boolean;
  data?: unknown;
  raw?: string;
  error?: string;
  usage?: { prompt: number; completion: number; total: number };
}

async function requestOnce(
  agent: AgentConfig,
  system: string,
  user: string,
  useJsonMode: boolean
): Promise<LlmResult> {
  const client = getClient(agent);
  const params: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming = {
    model: agent.model,
    temperature: agent.temperature,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    ...(useJsonMode ? { response_format: { type: "json_object" } } : {}),
  };
  const response = await client.chat.completions.create(params);
  const raw = response.choices[0]?.message?.content ?? "";
  const usage = response.usage
    ? {
        prompt: response.usage.prompt_tokens,
        completion: response.usage.completion_tokens,
        total: response.usage.total_tokens,
      }
    : undefined;
  if (!raw.trim()) {
    return { ok: false, raw, error: "empty response", usage };
  }
  try {
    return { ok: true, data: parseJson(raw), raw, usage };
  } catch (e) {
    return { ok: false, raw, error: `JSON parse failed: ${String(e)}`, usage };
  }
}

/** 调用单个 Agent 自己的模型；失败时自动重试一次（不带 JSON mode）。 */
export async function askAgentJson(
  agent: AgentConfig,
  system: string,
  user: string,
  timeoutMs: number
): Promise<LlmResult> {
  const tagged = `agent#${agent.index}/${agent.name}/${agent.model}`;

  const run = async (useJsonMode: boolean): Promise<LlmResult> => {
    try {
      return await requestOnce(agent, system, user, useJsonMode);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log.warn(`${tagged} 请求失败（jsonMode=${useJsonMode}）：${msg}`);
      return { ok: false, error: msg };
    }
  };

  const withTimeout = async (p: Promise<LlmResult>): Promise<LlmResult> => {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<LlmResult>((resolve) => {
      timer = setTimeout(() => resolve({ ok: false, error: `timeout ${timeoutMs}ms` }), timeoutMs);
    });
    try {
      return await Promise.race([p, timeout]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  };

  let result = await withTimeout(run(true));
  if (!result.ok) {
    log.warn(`${tagged} 首次失败：${result.error ?? "unknown"}，重试…`);
    result = await withTimeout(run(false));
  }
  if (result.ok) {
    if (result.usage) {
      log.info(
        `${tagged} 调用成功 tokens=${result.usage.total} (in ${result.usage.prompt} / out ${result.usage.completion})`
      );
    }
  } else {
    log.error(`${tagged} 调用失败：${result.error ?? "unknown"}`);
  }
  return result;
}
