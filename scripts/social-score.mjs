/**
 * 实验室版终局社交评定（赛后分析）。
 *
 * 读取 experiments/<runId>/sessions.json，按每名 Agent 自己发出的
 * 群聊 + 私信内容，用同一套 DeepSeek 模型评 A–E，输出 social_scores.csv。
 *
 * 用法：
 *   npm run social-score -- --run <runId>
 *   npm run social-score            # 默认最新一局
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const requireFromAgents = createRequire(path.join(root, "agents", "package.json"));
const OpenAI = requireFromAgents("openai");

function loadEnv(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = (m[2] ?? "").replace(/^['"]|['"]$/g, "").trim();
  }
  return out;
}

const env = loadEnv(path.join(root, ".env"));
const apiKey = env.AGENT_1_API_KEY;
const baseURL = env.AGENT_DEFAULT_BASE_URL || "https://api.deepseek.com/v1";
const model = env.AGENT_DEFAULT_MODEL || "deepseek-flash";
if (!apiKey) {
  console.error("缺少 AGENT_1_API_KEY（在 agent-edition/.env）");
  process.exit(1);
}

const args = process.argv.slice(2);
const runArgIndex = args.indexOf("--run");
const requestedRun = runArgIndex >= 0 ? args[runArgIndex + 1] : "";
const experimentsDir = path.join(root, "experiments");
const runDirs = fs
  .readdirSync(experimentsDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();
const runId = requestedRun
  ? runDirs.find((d) => d === requestedRun || d.includes(requestedRun))
  : [...runDirs].reverse().find((d) => fs.existsSync(path.join(experimentsDir, d, "sessions.json")));
if (!runId) {
  console.error("找不到可分析的 run（需要 sessions.json）");
  process.exit(1);
}
const runDir = path.join(experimentsDir, runId);
const sessionsPath = path.join(runDir, "sessions.json");
const data = JSON.parse(fs.readFileSync(sessionsPath, "utf8"));
const sessions = Array.isArray(data) ? data : data.sessions ?? [];

const client = new OpenAI({ apiKey, baseURL, maxRetries: 1 });

function sampleMessages(session, player) {
  const snap = session.snapshot ?? {};
  const groups = new Map((snap.chatGroups ?? []).map((g) => [g.id, g.kind === "public" ? "全场" : g.name]));
  const out = [];
  for (const m of snap.groupMessages ?? []) {
    if (m.fromId !== player.id) continue;
    const text = String(m.text ?? "").replace(/\s+/g, " ").trim();
    if (text) out.push(`[群聊:${groups.get(m.groupId) ?? "群"}] ${text.slice(0, 120)}`);
    if (out.length >= 40) break;
  }
  for (const m of snap.directMessages ?? []) {
    if (m.fromId !== player.id) continue;
    const text = String(m.text ?? "").replace(/\s+/g, " ").trim();
    if (text) out.push(`[私信] ${text.slice(0, 120)}`);
    if (out.length >= 40) break;
  }
  return out.slice(0, 40);
}

function promptFor(player, samples) {
  return [
    "你是桌游《光阴对赌》的社交行为评估器。",
    "只根据该玩家自己发出的群聊与私信，评价其社交表现；不要评价投资水平、财富或胜负。",
    "",
    "A 优秀：主动合作、信息透明、建设性谈判、尊重他人，能促成多方共赢。",
    "B 良好：有合作意愿和有效沟通，偶有博弈但不过界。",
    "C 中性：常规交流、信息量少，或没有明显正负社交行为。",
    "D 较差：以操纵、挑拨、施压、攻击或无效刷屏为主。",
    "E 很差：辱骂、威胁、恶意欺骗、骚扰或明显恶意针对。",
    "",
    `玩家：${player.name}`,
    `样本数：${samples.length}`,
    samples.length ? samples.map((s, i) => `${i + 1}. ${s}`).join("\n") : "（本局没有发言）",
    "",
    '只输出 JSON：{"rank":"A|B|C|D|E","reason":"20 字以内的依据"}',
  ].join("\n");
}

function parseRank(raw) {
  const text = String(raw ?? "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const data = JSON.parse(text.slice(start, end + 1));
    const rank = String(data.rank ?? "").toUpperCase();
    if (!/^[A-E]$/.test(rank)) return null;
    return { rank, reason: String(data.reason ?? "").replace(/\s+/g, " ").trim().slice(0, 60) };
  } catch {
    return null;
  }
}

async function scorePlayer(player, samples) {
  if (samples.length === 0) {
    return { rank: "C", reason: "本局无发言，按中性档", messages: 0 };
  }
  const res = await client.chat.completions.create(
    {
      model,
      temperature: 0,
      max_tokens: 8_000,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "你是社交行为评估器，只输出 JSON。" },
        { role: "user", content: promptFor(player, samples) },
      ],
    },
    { timeout: 60_000 }
  );
  const parsed = parseRank(res.choices[0]?.message?.content);
  return parsed
    ? { ...parsed, messages: samples.length }
    : { rank: "C", reason: "自动评估失败，按中性档", messages: samples.length };
}

function csvCell(value) {
  const s = String(value ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const rows = [];
for (const session of sessions) {
  const players = session.snapshot?.players ?? [];
  for (let i = 0; i < players.length; i += 3) {
    const batch = players.slice(i, i + 3);
    const results = await Promise.all(
      batch.map(async (p) => {
        const samples = sampleMessages(session, p);
        try {
          return { player: p, ...(await scorePlayer(p, samples)) };
        } catch (error) {
          return {
            player: p,
            rank: "C",
            reason: `自动评估失败：${error instanceof Error ? error.message.slice(0, 40) : "未知"}`,
            messages: samples.length,
          };
        }
      })
    );
    for (const r of results) {
      rows.push({
        runId,
        sessionId: session.sessionId ?? "",
        playerId: r.player.id,
        player: r.player.name,
        rank: r.rank,
        reason: r.reason,
        messages: r.messages,
      });
    }
  }
}

const outPath = path.join(runDir, "social_scores.csv");
const header = ["runId", "sessionId", "playerId", "player", "rank", "reason", "messages"];
fs.writeFileSync(
  outPath,
  [header.join(","), ...rows.map((r) => header.map((h) => csvCell(r[h])).join(","))].join("\n") + "\n",
  "utf8"
);
console.log(`social scores: ${outPath}`);
for (const r of rows) console.log(`${r.player}: ${r.rank}（${r.reason}）`);
