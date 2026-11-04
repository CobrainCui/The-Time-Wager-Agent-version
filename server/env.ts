/**
 * 统一环境变量入口。
 *
 * Agent 版把 6 个 API Key、ADMIN_TOKEN 等全部放在仓库根目录的 `.env`，
 * 服务端与 agents 运行时读取同一份文件，避免密钥散落。
 */
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/** tsc 输出在 server/dist，直接 ts 运行时在 server/ */
const repoRoot = path.basename(here) === "dist" ? path.resolve(here, "../..") : path.resolve(here, "..");

const candidates = [
  path.join(repoRoot, ".env"),
  path.join(repoRoot, ".env.local"),
  path.join(process.cwd(), ".env"),
];

for (const file of candidates) {
  if (fs.existsSync(file)) {
    dotenv.config({ path: file });
  }
}

export { repoRoot };
