import path from "node:path";
import { root } from "./process.mjs";
import { execFileSync } from "node:child_process";

function build(name) {
  console.log(`\n=== 构建 ${name} ===`);
  execFileSync("npm", ["--prefix", name, "run", "build"], {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
}

for (const name of ["server", "agents", "frontend"]) {
  build(name);
}

console.log("\n✅ 构建完成。运行 npm start 以本地启动。");
