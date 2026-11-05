import "./env.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface AgentConfig {
  index: number;
  /** 中性编号名（不携带人格信息） */
  name: string;
  apiKey: string;
  baseURL?: string;
  model: string;
  /** 供应商标识，仅用于导出与实验清单 */
  provider: string;
  temperature: number;
}

export interface RuntimeConfig {
  serverUrl: string;
  roomId: string;
  adminToken: string;
  agents: AgentConfig[];
  autoStart: boolean;
  autoRestart: boolean;
  autoAuction: boolean;
  decisionTimeoutMs: number;
  actionDelayMinMs: number;
  actionDelayMaxMs: number;
  auctionBidWindowMs: number;
  auctionHammerWindowMs: number;
  auctionPassWindowMs: number;
  auctionMaxDecisions: number;
  auctionMaxWealthRatio: number;
  /** 每名 Agent 每局 token 上限；超出即终止本局（不回退策略） */
  tokenBudget: number;
  maxOutputTokens: number;
  maxRetries: number;
  joinStaggerMs: number;
  /** 启动后等待全部 Agent 就座的硬超时；超时终止本次 run，避免无限空等 */
  joinTimeoutMs: number;
  /** 0 = 不限制；实验运行器用 AGENT_GAME_LIMIT 控制局数 */
  gameLimit: number;
  chatEnabled: boolean;
  memoryEnabled: boolean;
  predictionEnabled: boolean;
  promptVersion: string;
  runId: string;
  condition: string;
  seed: string;
  logDir: string;
  memoryDir: string;
}

const here = path.dirname(fileURLToPath(import.meta.url));
const agentsDir = path.resolve(here, "..");

function readAgentsSeed(): Array<{ index: number; name: string }> {
  const file = path.join(agentsDir, "agents.config.json");
  const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Array<{
    index: number;
    name: string;
  }>;
  if (raw.length !== 6) {
    throw new Error(`agents.config.json 必须正好 6 名 Agent，当前 ${raw.length}`);
  }
  const indices = raw.map((a) => a.index);
  if (new Set(indices).size !== 6 || indices.some((i) => !Number.isInteger(i) || i < 1 || i > 6)) {
    throw new Error("agents.config.json 的 index 必须是 1–6 且不重复");
  }
  return raw.map((a) => ({
    index: a.index,
    name: String(a.name).trim().slice(0, 24) || `Agent ${a.index}`,
  }));
}

function envNumber(key: string, fallback: number): number {
  const n = Number(process.env[key]);
  return Number.isFinite(n) ? n : fallback;
}

function envBool(key: string, fallback: boolean): boolean {
  const raw = (process.env[key] ?? "").trim().toLowerCase();
  if (!raw) return fallback;
  return ["1", "true", "yes", "on"].includes(raw);
}

export function isPlaceholderKey(key: string): boolean {
  const k = key.trim().toLowerCase();
  return (
    !k ||
    k.includes("placeholder") ||
    k.includes("your-key") ||
    k === "sk-xxx" ||
    k === "changeme"
  );
}

function providerFromBaseURL(baseURL: string | undefined): string {
  if (!baseURL) return "openai";
  try {
    return new URL(baseURL).hostname;
  } catch {
    return "custom";
  }
}

export function loadRuntimeConfig(): RuntimeConfig {
  const seeds = readAgentsSeed();
  const defaultBaseURL = (process.env.AGENT_DEFAULT_BASE_URL ?? "").trim() || undefined;
  const defaultModel = (process.env.AGENT_DEFAULT_MODEL ?? "").trim();
  const temperature = envNumber("AGENT_TEMPERATURE", 0.7);

  const agents = seeds.map((seed) => {
    const apiKey = (process.env[`AGENT_${seed.index}_API_KEY`] ?? "").trim();
    const baseURL = (process.env[`AGENT_${seed.index}_BASE_URL`] ?? "").trim() || defaultBaseURL;
    const model = (process.env[`AGENT_${seed.index}_MODEL`] ?? "").trim() || defaultModel;
    const explicitProvider = (process.env[`AGENT_${seed.index}_PROVIDER`] ?? "").trim();
    return {
      ...seed,
      apiKey,
      baseURL: baseURL || undefined,
      model,
      provider: explicitProvider || providerFromBaseURL(baseURL),
      temperature,
    };
  });

  // 允许只给每个 Agent 单独配模型；只有真的缺失时才报错。
  const missingModels = agents.filter((a) => !a.model).map((a) => a.index);
  if (missingModels.length > 0) {
    throw new Error(
      `以下 Agent 未配置模型：${missingModels.join(", ")}。` +
        "请在根目录 .env 设置 AGENT_<n>_MODEL，或设置 AGENT_DEFAULT_MODEL 作为统一默认值。"
    );
  }

  const missingKeys = agents.filter((a) => isPlaceholderKey(a.apiKey)).map((a) => a.index);
  if (missingKeys.length > 0) {
    throw new Error(
      `以下 Agent 的 API Key 未填写或仍是占位值：${missingKeys.join(", ")}。\n` +
        "实验版不提供规则兜底，也不会在缺少 Key 时静默运行。\n" +
        "请在根目录 .env 中填写 AGENT_<n>_API_KEY（可来自不同供应商），然后重试。"
    );
  }

  const port = envNumber("PORT", 3001);
  const logDir = path.join(path.dirname(agentsDir), "logs");
  const runId = (process.env.EXPERIMENT_RUN_ID ?? "").trim() || `adhoc-${new Date().toISOString().replace(/[:.]/g, "-")}`;

  return {
    serverUrl: (process.env.AGENT_SERVER_URL ?? "").trim() || `http://127.0.0.1:${port}`,
    roomId: (process.env.AGENT_ROOM_ID ?? "").trim() || "agent-arena",
    adminToken: (process.env.ADMIN_TOKEN ?? "").trim(),
    agents,
    autoStart: envBool("AGENT_AUTO_START", true),
    autoRestart: envBool("AGENT_AUTO_RESTART", false),
    autoAuction: envBool("AGENT_AUTO_AUCTION", true),
    decisionTimeoutMs: envNumber("AGENT_DECISION_TIMEOUT_MS", 120_000),
    actionDelayMinMs: envNumber("AGENT_ACTION_DELAY_MIN_MS", 300),
    actionDelayMaxMs: envNumber("AGENT_ACTION_DELAY_MAX_MS", 900),
    auctionBidWindowMs: envNumber("AGENT_AUCTION_BID_WINDOW_MS", 45_000),
    auctionHammerWindowMs: envNumber("AGENT_AUCTION_HAMMER_WINDOW_MS", 18_000),
    auctionPassWindowMs: envNumber("AGENT_AUCTION_PASS_WINDOW_MS", 22_000),
    auctionMaxDecisions: Math.max(1, envNumber("AGENT_AUCTION_MAX_DECISIONS", 4)),
    auctionMaxWealthRatio: Math.min(
      0.9,
      Math.max(0.05, envNumber("AGENT_AUCTION_MAX_WEALTH_RATIO", 0.35))
    ),
    tokenBudget: envNumber("AGENT_TOKEN_BUDGET", 1_000_000),
    maxOutputTokens: envNumber("AGENT_MAX_OUTPUT_TOKENS", 1_200),
    maxRetries: Math.max(1, envNumber("AGENT_MAX_RETRIES", 3)),
    joinStaggerMs: Math.max(0, envNumber("AGENT_JOIN_STAGGER_MS", 350)),
    joinTimeoutMs: Math.max(5_000, envNumber("AGENT_JOIN_TIMEOUT_MS", 90_000)),
    gameLimit: Math.max(0, envNumber("AGENT_GAME_LIMIT", 0)),
    chatEnabled: envBool("AGENT_CHAT_ENABLED", true),
    memoryEnabled: envBool("AGENT_MEMORY_ENABLED", true),
    predictionEnabled: envBool("AGENT_PREDICTION_ENABLED", true),
    promptVersion: (process.env.AGENT_PROMPT_VERSION ?? "").trim() || "v3-neutral-2026-11",
    runId,
    condition: (process.env.EXPERIMENT_CONDITION ?? "").trim() || "ad-hoc",
    seed: (process.env.GAME_SEED ?? "").trim() || "random",
    logDir,
    memoryDir: path.join(logDir, "memory", runId),
  };
}
