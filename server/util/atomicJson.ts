import fs from "fs";
import path from "path";

/** 先写临时文件再 rename；覆盖前保留一份 .bak，写入过程崩溃不会留下半个文件 */
export function writeJsonAtomic(filePath: string, data: unknown): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), "utf-8");

  if (fs.existsSync(filePath)) {
    try {
      fs.copyFileSync(filePath, `${filePath}.bak`);
    } catch (err) {
      console.error("Failed to back up before atomic write:", err);
    }
  }

  fs.renameSync(tmpPath, filePath);
}
