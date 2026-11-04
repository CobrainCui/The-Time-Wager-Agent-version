/** 统一从仓库根目录 .env 读取（agents/dist → ../../ .env；agents/ → ../.env）。 */
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.basename(here) === "dist" ? path.resolve(here, "../..") : path.resolve(here, "..");

const candidates = [
  path.join(repoRoot, ".env"),
  path.join(process.cwd(), "..", ".env"),
  path.join(process.cwd(), ".env"),
];

for (const file of candidates) {
  if (fs.existsSync(file)) dotenv.config({ path: file });
}

export { repoRoot };
