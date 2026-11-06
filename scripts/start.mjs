import fs from "node:fs";
import path from "node:path";
import { ensureEnvFile, killTree, root, startProcess } from "./process.mjs";

ensureEnvFile();

const required = [
  "server/dist/index.js",
  "agents/dist/index.js",
  "frontend/dist/admin.html",
];
const missing = required.filter((p) => !fs.existsSync(path.join(root, p)));
if (missing.length > 0) {
  console.error("缺少构建产物，请先运行 npm run build：");
  for (const m of missing) console.error(`  - ${m}`);
  process.exit(1);
}

console.log("");
console.log("=== 光阴对弈 · Agent 版本地运行 ===");
console.log("管理员前端：http://localhost:3001/admin.html");
console.log("按 Ctrl+C 结束全部进程");
console.log("");

const children = [];
let stopping = false;

function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  console.log("\n正在关闭…");
  for (const child of children) killTree(child);
  setTimeout(() => process.exit(code), 300);
}

function launch(name, args) {
  const child = startProcess(name, "npm", args, root);
  child.on("exit", (code) => {
    if (!stopping) {
      console.error(`[${name}] 已退出（code ${code}）`);
      shutdown(code ?? 1);
    }
  });
  children.push(child);
}

launch("server", ["--prefix", "server", "run", "start"]);
setTimeout(() => launch("agents", ["--prefix", "agents", "run", "start"]), 1800);

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
