/**
 * 实验运行器：用固定种子跑 N 局，自动写 manifest、归档本次 run 的 session。
 *
 * 用法：
 *   npm run experiment -- --condition C1 --games 3 --seed 20261104
 *   npm run experiment -- --mock --games 1 --condition smoke
 *
 * 真实实验前先在根目录 .env 填好 6 个 Key（可来自不同供应商）。
 * --mock 只用于端到端冒烟：启动本地假装 OpenAI 兼容的 mock server，
 * 不产生可分析的社会行为数据。
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { root, killTree, startProcess } from "./process.mjs";

function parseArgs(argv) {
  const out = {
    condition: "",
    games: 1,
    seed: String(Date.now() % 2_000_000_000),
    name: "",
    mock: false,
    build: true,
    port: 3001,
    chat: true,
    memory: true,
    prediction: true,
    timeoutMinutes: 180,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      i += 1;
      return argv[i];
    };
    if (a === "--condition") out.condition = next() ?? "";
    else if (a === "--games") out.games = Math.max(1, Number(next()) || 1);
    else if (a === "--seed") out.seed = String(next() ?? out.seed);
    else if (a === "--name") out.name = next() ?? "";
    else if (a === "--mock") out.mock = true;
    else if (a === "--no-build") out.build = false;
    else if (a === "--port") out.port = Number(next()) || 3001;
    else if (a === "--no-chat") out.chat = false;
    else if (a === "--no-memory") out.memory = false;
    else if (a === "--no-prediction") out.prediction = false;
    else if (a === "--timeout-min") out.timeoutMinutes = Math.max(1, Number(next()) || 180);
    else if (a === "--help" || a === "-h") {
      console.log(
        "用法: npm run experiment -- [--condition C1] [--games 3] [--seed 123] [--mock] [--no-build] [--port 3001] [--no-chat] [--no-memory] [--no-prediction]"
      );
      process.exit(0);
    }
  }
  if (!out.condition) out.condition = out.mock ? "smoke" : "C0";
  return out;
}

function readEnvFile() {
  const file = path.join(root, ".env");
  const env = {};
  if (!fs.existsSync(file)) return env;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

function gitCommit() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

/** 提示词 + 规则文件的稳定指纹，用于确认「同一批次没有偷改提示词」。 */
function promptHash() {
  const files = [
    "agents/src/prompts.ts",
    "server/gameInstruction/game_skills.md",
    "server/gameInstruction/data_projects.md",
    "server/gameInstruction/data_buff_cards.md",
    "server/gameInstruction/data_numeric_config.md",
  ];
  const hash = crypto.createHash("sha256");
  for (const rel of files) {
    const file = path.join(root, rel);
    hash.update(rel);
    try {
      hash.update(fs.readFileSync(file));
    } catch {
      hash.update("<missing>");
    }
  }
  return hash.digest("hex").slice(0, 16);
}

function timestampForId() {
  return new Date().toISOString().replace(/[:.]/g, "-").replace("T", "_").replace("Z", "");
}

function safeName(value) {
  return String(value).replace(/[^\w一-龥-]+/g, "_").slice(0, 80);
}

function csvEscape(value) {
  const s = String(value ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const args = parseArgs(process.argv.slice(2));
const envFile = readEnvFile();
const stamp = timestampForId();
const runId = `${safeName(args.name || `${args.condition}-${args.seed}`)}-${stamp}`;
const runDir = path.join(root, "experiments", runId);
fs.mkdirSync(runDir, { recursive: true });

const manifestPath = path.join(runDir, "manifest.json");
const mockPort = Number(process.env.MOCK_LLM_PORT || 3100);
const adminToken = process.env.ADMIN_TOKEN || envFile.ADMIN_TOKEN || "local-admin-token-change-me";

if (args.build) {
  console.log("[experiment] 构建 server / agents / frontend …");
  execFileSync("npm", ["run", "build"], {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
}

const serverEntry = path.join(root, "server", "dist", "index.js");
const agentsEntry = path.join(root, "agents", "dist", "index.js");
if (!fs.existsSync(serverEntry) || !fs.existsSync(agentsEntry)) {
  console.error("[experiment] 缺少构建产物，请先 npm run build");
  process.exit(1);
}

const baseEnv = {
  ...envFile,
  ...process.env,
  ADMIN_TOKEN: adminToken,
  PORT: String(args.port),
  AGENT_SERVER_URL: `http://127.0.0.1:${args.port}`,
  AGENT_ROOM_ID: `lab-${runId}`,
  GAME_SEED: args.seed,
  EXPERIMENT_RUN_ID: runId,
  EXPERIMENT_CONDITION: args.condition,
  EXPERIMENT_MANIFEST_ID: runId,
  EXPERIMENT_MANIFEST_PATH: manifestPath,
  EXPERIMENT_MOCK: args.mock ? "1" : "0",
  AGENT_PROMPT_VERSION: process.env.AGENT_PROMPT_VERSION || "v3-neutral-2026-11",
  AGENT_AUTO_START: "true",
  AGENT_AUTO_RESTART: "true",
  AGENT_GAME_LIMIT: String(args.games),
  AGENT_CHAT_ENABLED: args.chat ? "true" : "false",
  AGENT_MEMORY_ENABLED: args.memory ? "true" : "false",
  AGENT_PREDICTION_ENABLED: args.prediction ? "true" : "false",
  AGENT_LOG_LEVEL: process.env.AGENT_LOG_LEVEL || "info",
  SERVER_STARTED_AT: String(Date.now()),
};

if (args.mock) {
  baseEnv.MOCK_LLM_PORT = String(mockPort);
  baseEnv.AGENT_AUCTION_PASS_WINDOW_MS = process.env.AGENT_AUCTION_PASS_WINDOW_MS || "8000";
  baseEnv.AGENT_AUCTION_HAMMER_WINDOW_MS = process.env.AGENT_AUCTION_HAMMER_WINDOW_MS || "6000";
  baseEnv.AGENT_ACTION_DELAY_MIN_MS = "50";
  baseEnv.AGENT_ACTION_DELAY_MAX_MS = "150";
  for (let i = 1; i <= 6; i++) {
    baseEnv[`AGENT_${i}_API_KEY`] = `mock-key-${i}`;
    baseEnv[`AGENT_${i}_BASE_URL`] = `http://127.0.0.1:${mockPort}/v1`;
    baseEnv[`AGENT_${i}_MODEL`] = "mock-model";
    baseEnv[`AGENT_${i}_PROVIDER`] = "mock";
  }
}

const modelList = [];
const providerList = [];
for (let i = 1; i <= 6; i++) {
  const model = baseEnv[`AGENT_${i}_MODEL`] || baseEnv.AGENT_DEFAULT_MODEL || "unknown";
  let provider = baseEnv[`AGENT_${i}_PROVIDER`] || "";
  if (!provider) {
    const baseURL = baseEnv[`AGENT_${i}_BASE_URL`];
    try {
      provider = baseURL ? new URL(baseURL).hostname : "openai";
    } catch {
      provider = "custom";
    }
  }
  modelList.push(model);
  providerList.push(provider);
}

const manifest = {
  manifestId: runId,
  runId,
  name: args.name || runId,
  condition: args.condition,
  seedBase: Number(args.seed),
  games: args.games,
  createdAt: new Date().toISOString(),
  nodeVersion: process.version,
  gitCommit: gitCommit(),
  policyMode: "llm",
  promptVersion: baseEnv.AGENT_PROMPT_VERSION,
  promptHash: promptHash(),
  models: modelList,
  providers: providerList,
  temperature: Number(baseEnv.AGENT_TEMPERATURE || envFile.AGENT_TEMPERATURE || 0.7),
  tokenBudget: Number(baseEnv.AGENT_TOKEN_BUDGET || envFile.AGENT_TOKEN_BUDGET || 400000),
  maxRetries: Number(baseEnv.AGENT_MAX_RETRIES || envFile.AGENT_MAX_RETRIES || 3),
  chatEnabled: args.chat,
  memoryEnabled: args.memory,
  predictionEnabled: args.prediction,
  mock: args.mock,
  port: args.port,
  roomId: baseEnv.AGENT_ROOM_ID,
  command: `npm run experiment -- ${process.argv.slice(2).join(" ")}`,
  notes: args.mock
    ? "MOCK 冒烟运行：只验证链路，数据不能用于研究。"
    : "真实 LLM 实验运行。",
};
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
baseEnv.EXPERIMENT_PROMPT_HASH = manifest.promptHash;
console.log(`[experiment] manifest: ${manifestPath}`);

if (!args.mock) {
  const missingKeys = [];
  for (let i = 1; i <= 6; i++) {
    const key = String(baseEnv[`AGENT_${i}_API_KEY`] ?? "").trim().toLowerCase();
    if (!key || /placeholder|your-key|sk-xxx|changeme/.test(key)) missingKeys.push(i);
  }
  if (missingKeys.length > 0) {
    console.error(
      `[experiment] 以下 Agent 的 API Key 未填写或仍是占位值：${missingKeys.join(", ")}。\n` +
        "实验版不提供规则兜底。请先在 .env 填写 AGENT_<n>_API_KEY，或使用 --mock 做链路冒烟。"
    );
    process.exit(1);
  }
}

const children = [];
let stopped = false;
function stopAll() {
  if (stopped) return;
  stopped = true;
  for (const child of children) killTree(child);
}

let mockChild = null;
if (args.mock) {
  mockChild = startProcess("mock-llm", "node", [path.join(root, "scripts", "mock-llm.mjs")], root, baseEnv);
  children.push(mockChild);
  await new Promise((resolve) => setTimeout(resolve, 500));
}

const serverChild = startProcess("server", "node", [serverEntry], root, baseEnv);
children.push(serverChild);
await new Promise((resolve) => setTimeout(resolve, 1500));

const agentsChild = startProcess("agents", "node", [agentsEntry], root, baseEnv);
children.push(agentsChild);

const startedAt = Date.now();
const exitCode = await new Promise((resolve) => {
  const timer = setTimeout(() => {
    console.error(`[experiment] 超时（${args.timeoutMinutes} 分钟），终止`);
    stopAll();
    resolve(124);
  }, args.timeoutMinutes * 60 * 1000);
  agentsChild.on("exit", (code) => {
    clearTimeout(timer);
    resolve(code ?? 1);
  });
});

await new Promise((resolve) => setTimeout(resolve, 1200));
stopAll();

const archivePath = path.join(root, "server", "data", "session_archive.json");
let sessions = [];
try {
  const archive = JSON.parse(fs.readFileSync(archivePath, "utf8"));
  sessions = (archive.sessions ?? []).filter(
    (s) => s.snapshot?.meta?.runId === runId || s.runId === runId
  );
} catch {
  /* ignore */
}
fs.writeFileSync(path.join(runDir, "sessions.json"), JSON.stringify({ runId, sessions }, null, 2), "utf8");

const flatRows = [];
for (const s of sessions) {
  const metrics = s.snapshot?.metrics;
  const meta = s.snapshot?.meta ?? {};
  if (!metrics) continue;
  for (const p of metrics.players) {
    flatRows.push({
      sessionId: s.sessionId,
      condition: meta.condition ?? args.condition,
      seed: meta.seed ?? "",
      player: p.name,
      agentIndex: p.agentIndex ?? "",
      provider: p.provider,
      model: p.model,
      finalWealth: p.finalWealth,
      finalRank: p.finalRank,
      longShare: p.longShare,
      shortShare: p.shortShare,
      riskShare: p.riskShare,
      transfersSent: p.transfersSent,
      transfersReceived: p.transfersReceived,
      publicMessages: p.publicMessages,
      privateMessages: p.privateMessages,
      predictionTau: p.predictionTau ?? "",
      predictionMae: p.predictionMae ?? "",
      gini: metrics.game.gini,
    });
  }
}
const headers = Object.keys(
  flatRows[0] ?? {
    sessionId: "",
    condition: "",
    seed: "",
    player: "",
    agentIndex: "",
    provider: "",
    model: "",
    finalWealth: "",
    finalRank: "",
    longShare: "",
    shortShare: "",
    riskShare: "",
    transfersSent: "",
    transfersReceived: "",
    publicMessages: "",
    privateMessages: "",
    predictionTau: "",
    predictionMae: "",
    gini: "",
  }
);
const csv = [
  headers.join(","),
  ...flatRows.map((row) => headers.map((h) => csvEscape(row[h])).join(",")),
].join("\n");
fs.writeFileSync(path.join(runDir, "summary.csv"), `${csv}\n`, "utf8");

const runSummary = {
  runId,
  condition: args.condition,
  seedBase: Number(args.seed),
  requestedGames: args.games,
  completedGames: sessions.length,
  exitCode,
  durationMs: Date.now() - startedAt,
  mock: args.mock,
  manifestPath,
  sessionsPath: path.join(runDir, "sessions.json"),
  summaryCsvPath: path.join(runDir, "summary.csv"),
};
fs.writeFileSync(path.join(runDir, "run.json"), JSON.stringify(runSummary, null, 2), "utf8");

console.log("");
console.log("=== 实验结束 ===");
console.log(`runId       : ${runId}`);
console.log(`condition   : ${args.condition}`);
console.log(`seed        : ${args.seed}`);
console.log(`完成局数    : ${sessions.length}/${args.games}`);
console.log(`agents exit : ${exitCode}`);
console.log(`manifest    : ${manifestPath}`);
console.log(`sessions    : ${runSummary.sessionsPath}`);
console.log(`summary.csv : ${runSummary.summaryCsvPath}`);

if (exitCode !== 0) process.exit(2);
if (sessions.length < args.games) process.exit(3);
process.exit(0);
