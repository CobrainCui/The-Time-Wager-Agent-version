/**
 * 批量分析：把 experiments/<runId>/sessions.json 汇总成可直接进 R/Python 的表。
 *
 * 用法：
 *   npm run analyze
 *   npm run analyze -- --run finalcheck-424242-2026-11-04_03-40-18-687
 *   npm run analyze -- --out analysis/2026-11-04
 *
 * 输出：
 *   dataset.csv            每局每玩家一行
 *   condition_summary.csv  每条件一行（均值 + 局内分化）
 *   prediction_by_era.csv  按时代汇总预测 τ / MAE
 *   summary.json           机器可读汇总
 */
import fs from "node:fs";
import path from "node:path";
import { root } from "./process.mjs";

function parseArgs(argv) {
  const out = { run: "", out: "analysis", includeMock: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--run") out.run = argv[++i] ?? "";
    else if (a === "--out") out.out = argv[++i] ?? "analysis";
    else if (a === "--exclude-mock") out.includeMock = false;
    else if (a === "--help" || a === "-h") {
      console.log("用法: npm run analyze -- [--run <runId>] [--out analysis] [--exclude-mock]");
      process.exit(0);
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const experimentsDir = path.join(root, "experiments");
if (!fs.existsSync(experimentsDir)) {
  console.error("没有 experiments/ 目录；先跑 npm run experiment");
  process.exit(1);
}

const runDirs = fs
  .readdirSync(experimentsDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .filter((name) => (args.run ? name === args.run || name.includes(args.run) : true))
  .sort();

const runs = [];
for (const name of runDirs) {
  const sessionsPath = path.join(experimentsDir, name, "sessions.json");
  if (!fs.existsSync(sessionsPath)) continue;
  let data;
  try {
    data = JSON.parse(fs.readFileSync(sessionsPath, "utf8"));
  } catch {
    continue;
  }
  let manifest = null;
  try {
    manifest = JSON.parse(fs.readFileSync(path.join(experimentsDir, name, "manifest.json"), "utf8"));
  } catch {
    /* ignore */
  }
  runs.push({ name, manifest, sessions: data.sessions ?? [] });
}

if (runs.length === 0) {
  console.error("没有可分析的 sessions.json");
  process.exit(1);
}

const dataset = [];
const predictionRows = [];
const sessionRows = [];

for (const run of runs) {
  const runMock = run.manifest?.mock === true;
  for (const s of run.sessions) {
    const snapshot = s.snapshot;
    const mock = snapshot?.meta?.experiment?.mock === true || runMock;
    if (!args.includeMock && mock) continue;
    const meta = snapshot?.meta ?? {};
    const metrics = snapshot?.metrics;
    if (!metrics) continue;
    const condition = meta.condition ?? run.manifest?.condition ?? "unknown";
    const seedBase = meta.seedBase ?? run.manifest?.seedBase ?? "";
    const sessionOrdinal = meta.sessionOrdinal ?? "";
    sessionRows.push({
      runId: run.name,
      sessionId: s.sessionId,
      condition,
      seedBase,
      seed: meta.seed ?? "",
      sessionOrdinal,
      promptVersion: meta.promptVersion ?? run.manifest?.promptVersion ?? "",
      gitCommit: meta.gitCommit ?? run.manifest?.gitCommit ?? "",
      mock,
      ...metrics.game,
    });
    for (const p of metrics.players) {
      dataset.push({
        runId: run.name,
        sessionId: s.sessionId,
        condition,
        seedBase,
        seed: meta.seed ?? "",
        sessionOrdinal,
        mock,
        playerId: p.playerId,
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
        transferAmountSent: p.transferAmountSent,
        transferAmountReceived: p.transferAmountReceived,
        transferReturnRate: p.transferReturnRate,
        mutualTransferPartners: p.mutualTransferPartners,
        publicMessages: p.publicMessages,
        privateMessages: p.privateMessages,
        privatePartners: p.privatePartners,
        auctionBids: p.auctionBids,
        auctionWins: p.auctionWins,
        auctionSpend: p.auctionSpend,
        avgBidToAvailableRatio: p.avgBidToAvailableRatio ?? "",
        buffsUsed: p.buffsUsed,
        attacksInitiated: p.attacksInitiated,
        attacksReceived: p.attacksReceived,
        predictionCount: p.predictionCount,
        predictionTau: p.predictionTau ?? "",
        predictionMae: p.predictionMae ?? "",
        outDegree: p.outDegree,
        inDegree: p.inDegree,
      });
    }
    for (const pr of metrics.predictionScores ?? []) {
      predictionRows.push({
        runId: run.name,
        sessionId: s.sessionId,
        condition,
        seedBase,
        seed: meta.seed ?? "",
        era: pr.era,
        player: pr.playerName,
        tau: pr.tau,
        mae: pr.mae,
      });
    }
  }
}

function toCsv(rows) {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v) => {
    const raw =
      v && typeof v === "object" ? JSON.stringify(v) : v == null ? "" : String(v);
    return /[",\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
  };
  return [headers.join(","), ...rows.map((r) => headers.map((h) => escape(r[h])).join(","))].join("\n") + "\n";
}

function mean(values) {
  const nums = values.filter((v) => typeof v === "number" && Number.isFinite(v));
  if (nums.length === 0) return null;
  return nums.reduce((s, v) => s + v, 0) / nums.length;
}

function sd(values) {
  const nums = values.filter((v) => typeof v === "number" && Number.isFinite(v));
  if (nums.length < 2) return null;
  const m = mean(nums);
  return Math.sqrt(nums.reduce((s, v) => s + (v - m) ** 2, 0) / (nums.length - 1));
}

function round4(v) {
  return v == null ? "" : Math.round(v * 10000) / 10000;
}

const byCondition = new Map();
if (dataset.length === 0) {
  console.error(
    "没有可分析的玩家数据。若刚跑的是 mock，请去掉 --exclude-mock；若还没跑实验，请先 npm run experiment。"
  );
  process.exit(1);
}
for (const row of dataset) {
  if (!byCondition.has(row.condition)) byCondition.set(row.condition, []);
  byCondition.get(row.condition).push(row);
}

const conditionSummary = [];
for (const [condition, rows] of byCondition) {
  const sessions = new Set(rows.map((r) => r.sessionId));
  // 局内分化：每个 session 内某指标的极差，再对 session 取平均
  const within = (field) => {
    const perSession = [];
    for (const sid of sessions) {
      const values = rows.filter((r) => r.sessionId === sid).map((r) => r[field]);
      const nums = values.filter((v) => typeof v === "number" && Number.isFinite(v));
      if (nums.length >= 2) perSession.push(Math.max(...nums) - Math.min(...nums));
    }
    return mean(perSession);
  };
  const sessionGameRows = sessionRows.filter((r) => r.condition === condition);
  conditionSummary.push({
    condition,
    sessions: sessions.size,
    players: rows.length,
    mock: rows[0]?.mock ?? false,
    models: [...new Set(rows.map((r) => `${r.provider}/${r.model}`))].join("|"),
    meanGini: round4(mean(sessionGameRows.map((r) => r.gini))),
    meanGiniNonNegative: round4(mean(sessionGameRows.map((r) => r.giniNonNegative))),
    meanNegativeWealthPlayers: round4(
      mean(sessionGameRows.map((r) => r.negativeWealthPlayers))
    ),
    meanTotalWealth: round4(mean(sessionGameRows.map((r) => r.totalWealth))),
    meanTransferCount: round4(mean(sessionGameRows.map((r) => r.transferCount))),
    meanTransferVolume: round4(mean(sessionGameRows.map((r) => r.transferVolume))),
    meanPublicMessages: round4(mean(sessionGameRows.map((r) => r.publicMessageCount))),
    meanPrivateMessages: round4(mean(sessionGameRows.map((r) => r.privateMessageCount))),
    meanAttackCount: round4(mean(sessionGameRows.map((r) => r.attackCount))),
    meanAuctionSpend: round4(mean(sessionGameRows.map((r) => r.auctionSpend))),
    meanPredictionTau: round4(mean(sessionGameRows.map((r) => r.meanPredictionTau))),
    meanPredictionMae: round4(mean(sessionGameRows.map((r) => r.meanPredictionMae))),
    withinLongShareRange: round4(within("longShare")),
    withinTransferSentRange: round4(within("transfersSent")),
    withinPublicMessageRange: round4(within("publicMessages")),
    withinAuctionSpendRange: round4(within("auctionSpend")),
    withinPredictionTauRange: round4(within("predictionTau")),
    betweenPlayerPredictionTauSd: round4(sd(rows.map((r) => r.predictionTau))),
  });
}

const byEra = new Map();
for (const row of predictionRows) {
  const key = row.era;
  if (!byEra.has(key)) byEra.set(key, []);
  byEra.get(key).push(row);
}
const predictionByEra = [...byEra.entries()]
  .sort((a, b) => a[0] - b[0])
  .map(([era, rows]) => ({
    era,
    predictions: rows.length,
    meanTau: round4(mean(rows.map((r) => r.tau))),
    meanMae: round4(mean(rows.map((r) => r.mae))),
  }));

const outDir = path.isAbsolute(args.out) ? args.out : path.join(root, args.out);
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "dataset.csv"), toCsv(dataset), "utf8");
fs.writeFileSync(path.join(outDir, "condition_summary.csv"), toCsv(conditionSummary), "utf8");
fs.writeFileSync(path.join(outDir, "prediction_by_era.csv"), toCsv(predictionByEra), "utf8");
const summary = {
  generatedAt: new Date().toISOString(),
  runs: runs.map((r) => ({
    name: r.name,
    condition: r.manifest?.condition ?? null,
    mock: r.manifest?.mock ?? false,
    sessions: r.sessions.length,
  })),
  conditionSummary,
  predictionByEra,
};
fs.writeFileSync(path.join(outDir, "summary.json"), JSON.stringify(summary, null, 2), "utf8");

console.log("=== 分析完成 ===");
console.log(`runs: ${runs.length} | sessions: ${new Set(dataset.map((r) => r.sessionId)).size}`);
console.log(`输出目录: ${outDir}`);
console.table(conditionSummary);
console.table(predictionByEra);
