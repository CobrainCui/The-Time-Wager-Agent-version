/**
 * 实验室版 6 个 Agent 的 Key / 模型自检。
 *
 * 用法（在 agent-edition 目录）：
 *   npm run build
 *   npm run check-ai            # 只打印每个 Agent 的配置
 *   npm run check-ai -- --ping  # 每个 Agent 实际调用一次，确认 Key 可用
 *
 * 不会打印完整 Key；缺 Key 时会直接给出需要填写的变量名。
 */
import path from "node:path";
import fs from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const configEntry = path.join(root, "agents", "dist", "config.js");
if (!fs.existsSync(configEntry)) {
  console.error("找不到 agents/dist/config.js：请先运行 npm run build");
  process.exit(1);
}
// openai 安装在 agents/ 下；从根目录脚本按 agents 的依赖解析。
const requireFromAgents = createRequire(path.join(root, "agents", "package.json"));
const OpenAI = requireFromAgents("openai");

let config;
try {
  const mod = await import(pathToFileURL(configEntry).href);
  config = mod.loadRuntimeConfig();
} catch (error) {
  console.error("");
  console.error("❌ 配置检查未通过：");
  console.error(error instanceof Error ? error.message : String(error));
  console.error("");
  console.error(`请打开 ${path.join(root, ".env")}，按提示填写后重试。`);
  process.exitCode = 1;
  process.exit();
}

const ping = process.argv.includes("--ping");

function maskKey(key) {
  if (!key) return "（空）";
  return `${key.slice(0, 3)}***${key.slice(-4)}（长度 ${key.length}）`;
}

console.log("");
console.log("实验室版 Agent 配置（Key 只显示尾号，可安全截图）");
console.log("─".repeat(72));
for (const agent of config.agents) {
  console.log(`Agent ${agent.index} ${agent.name}`);
  console.log(`  Provider: ${agent.provider}`);
  console.log(`  Model   : ${agent.model}`);
  console.log(`  Key     : ${maskKey(agent.apiKey)}`);
  console.log(`  BaseURL : ${agent.baseURL ?? "（OpenAI 官方默认）"}`);
}
console.log("─".repeat(72));

if (!ping) {
  console.log("提示：加 --ping 会实际调用一次模型，确认 Key / 模型名 / 网络都可用。");
  process.exit(0);
}

console.log("");
console.log("开始实际调用（每个 Agent 一次，消耗极少量 token）...");
let failed = 0;
for (const agent of config.agents) {
  const startedAt = Date.now();
  try {
    const client = new OpenAI({
      apiKey: agent.apiKey,
      ...(agent.baseURL ? { baseURL: agent.baseURL } : {}),
      maxRetries: 0,
    });
    const res = await client.chat.completions.create(
      {
        model: agent.model,
        temperature: 0,
        max_tokens: 8,
        messages: [
          { role: "system", content: "只回复两个字符：ok" },
          { role: "user", content: "ping" },
        ],
      },
      { timeout: 20_000 }
    );
    const text = (res.choices?.[0]?.message?.content ?? "").trim().slice(0, 40);
    console.log(`Agent ${agent.index}: ✅ 成功（${Date.now() - startedAt}ms）返回：${text || "（空）"}`);
  } catch (error) {
    failed += 1;
    const message = error instanceof Error ? error.message : String(error);
    console.log(`Agent ${agent.index}: ❌ 失败：${message.slice(0, 200)}`);
  }
}

console.log("");
if (failed > 0) {
  console.log(`有 ${failed} 个 Agent 调用失败：检查 Key、模型名、BASE_URL 与网络。`);
  process.exitCode = 1;
} else {
  console.log("6 个 Agent 全部可用，可以开始正式实验。");
}
