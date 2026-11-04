import "./env.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface AgentConfig {
  index: number;
  name: string;
  persona: string;
  style: string;
  auctionMaxWealthRatio: number;
  riskTolerance: number;
  apiKey: string;
  baseURL?: string;
  model: string;
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
  offlineMode: boolean;
  fallbackPolicy: boolean;
  decisionTimeoutMs: number;
  actionDelayMinMs: number;
  actionDelayMaxMs: number;
  auctionBidWindowMs: number;
  auctionHammerWindowMs: number;
  auctionPassWindowMs: number;
  auctionMaxDecisions: number;
  logDir: string;
}

const here = path.dirname(fileURLToPath(import.meta.url));
const agentsDir = path.basename(here) === "dist" ? path.resolve(here, "..") : path.resolve(here, "..");

function readAgentsSeed(): Omit<AgentConfig, "apiKey" | "baseURL" | "model" | "temperature">[] {
  const file = path.join(agentsDir, "agents.config.json");
  const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Array<{
    index: number;
    name: string;
    persona: string;
    style: string;
    auctionMaxWealthRatio?: number;
    riskTolerance?: number;
  }>;
  if (raw.length !== 6) {
    throw new Error(`agents.config.json 必须正好 6 名 Agent，当前 ${raw.length}`);
  }
  return raw.map((a) => ({
    index: a.index,
    name: String(a.name).trim().slice(0, 24),
    persona: String(a.persona).trim(),
    style: String(a.style).trim(),
    auctionMaxWealthRatio: clampNumber(a.auctionMaxWealthRatio, 0.05, 0.9, 0.25),
    riskTolerance: clampNumber(a.riskTolerance, 0, 1, 0.5),
  }));
}

function clampNumber(v: unknown, min: number, max: number, fallback: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
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
  return !k || k.includes("placeholder") || k.includes("your-key") || k === "sk-xxx";
}

export function loadRuntimeConfig(): RuntimeConfig {
  const seeds = readAgentsSeed();
  const defaultBaseURL = (process.env.AGENT_DEFAULT_BASE_URL ?? "").trim() || undefined;
  const defaultModel = (process.env.AGENT_DEFAULT_MODEL ?? "").trim() || "gpt-4o";
  const defaultTemp = envNumber("AGENT_TEMPERATURE", 0.7);

  const agents = seeds.map((seed) => {
    const apiKey = (process.env[`AGENT_${seed.index}_API_KEY`] ?? "").trim();
    const baseURL = (process.env[`AGENT_${seed.index}_BASE_URL`] ?? "").trim() || defaultBaseURL;
    const model = (process.env[`AGENT_${seed.index}_MODEL`] ?? "").trim() || defaultModel;
    return {
      ...seed,
      apiKey,
      baseURL: baseURL || undefined,
      model,
      temperature: clampNumber(process.env[`AGENT_${seed.index}_TEMPERATURE`] ?? defaultTemp, 0, 2, 0.7),
    };
  });

  const offlineMode = envBool("AGENT_OFFLINE", false);
  const fallbackPolicy = envBool("AGENT_FALLBACK_POLICY", true);
  const missingKeys = agents.filter((a) => isPlaceholderKey(a.apiKey)).map((a) => a.index);

  if (!offlineMode && !fallbackPolicy && missingKeys.length > 0) {
    throw new Error(
      `以下 Agent 的 API Key 尚未填写：${missingKeys.join(", ")}。` +
        `请在仓库根目录 .env 中填写 AGENT_<n>_API_KEY，或设置 AGENT_FALLBACK_POLICY=true 使用内置策略。`
    );
  }
  if (!offlineMode && missingKeys.length > 0) {
    console.warn(
      `⚠️ Agent ${missingKeys.join(", ")} 的 API Key 为空/占位，将使用内置策略（不调用大模型）。` +
        `填写根目录 .env 的 AGENT_<n>_API_KEY 后可启用 LLM。`
    );
  }

  const port = envNumber("PORT", 3001);
  return {
    serverUrl: (process.env.AGENT_SERVER_URL ?? "").trim() || `http://127.0.0.1:${port}`,
    roomId: (process.env.AGENT_ROOM_ID ?? "").trim() || "agent-arena",
    adminToken: (process.env.ADMIN_TOKEN ?? "").trim(),
    agents,
    autoStart: envBool("AGENT_AUTO_START", true),
    autoRestart: envBool("AGENT_AUTO_RESTART", false),
    autoAuction: envBool("AGENT_AUTO_AUCTION", true),
    offlineMode: offlineMode || missingKeys.length > 0,
    fallbackPolicy,
    decisionTimeoutMs: envNumber("AGENT_DECISION_TIMEOUT_MS", 90_000),
    actionDelayMinMs: envNumber("AGENT_ACTION_DELAY_MIN_MS", 700),
    actionDelayMaxMs: envNumber("AGENT_ACTION_DELAY_MAX_MS", 2_200),
    auctionBidWindowMs: envNumber("AGENT_AUCTION_BID_WINDOW_MS", 45_000),
    auctionHammerWindowMs: envNumber("AGENT_AUCTION_HAMMER_WINDOW_MS", 18_000),
    auctionPassWindowMs: envNumber("AGENT_AUCTION_PASS_WINDOW_MS", 22_000),
    auctionMaxDecisions: Math.max(1, envNumber("AGENT_AUCTION_MAX_DECISIONS", 3)),
    logDir: path.join(path.dirname(agentsDir), "logs"),
  };
}
