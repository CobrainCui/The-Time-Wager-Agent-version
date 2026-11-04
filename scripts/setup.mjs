import path from "node:path";
import { ensureEnvFile, npmInstall, root } from "./process.mjs";

ensureEnvFile();

for (const dir of ["server", "agents", "frontend"]) {
  npmInstall(path.join(root, dir));
}

console.log("");
console.log("✅ 依赖安装完成。");
console.log("下一步：");
console.log("  1. 打开 agent-edition/.env，填写 AGENT_1_API_KEY … AGENT_6_API_KEY");
console.log("  2. 运行 npm run dev");
console.log("  3. 浏览器打开 http://localhost:5173/admin.html（管理员前端）");
console.log("  4. 管理端登录密钥 = .env 里的 ADMIN_TOKEN");
