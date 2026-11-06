import fs from "node:fs";
import path from "node:path";
import { ensureEnvFile, killTree, root, startProcess } from "./process.mjs";

for (const dir of ["server", "agents", "frontend"]) {
  if (!fs.existsSync(path.join(root, dir, "node_modules"))) {
    console.error(`缺少 ${dir}/node_modules，请先运行 npm run setup`);
    process.exit(1);
  }
}
ensureEnvFile();

console.log("");
console.log("=== 光阴对弈 · Agent 版本地开发 ===");
console.log("管理员前端：http://localhost:5173/admin.html");
console.log("服务端 API ：http://127.0.0.1:3001");
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
  return child;
}

launch("server", ["--prefix", "server", "run", "dev"]);
setTimeout(() => {
  launch("agents", ["--prefix", "agents", "run", "dev"]);
}, 2500);
launch("admin", ["--prefix", "frontend", "run", "dev"]);

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
