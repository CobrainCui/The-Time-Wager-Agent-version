import fs from "fs";
import path from "path";
import multer from "multer";
import { eraCards, longTermProjects, riskProjects, shortTermProjects } from "../data/game_data.js";

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export const ALLOWED_ERA_IMAGE_IDS = new Set(eraCards.map((c) => c.era));

export const ALLOWED_PROJECT_IMAGE_IDS = new Set(
  [...shortTermProjects, ...longTermProjects, ...riskProjects].map((p) => p.id)
);

export function isAllowedEraImageId(id: unknown): id is string {
  return typeof id === "string" && ALLOWED_ERA_IMAGE_IDS.has(id);
}

export function isAllowedProjectImageId(id: unknown): number | null {
  const numId = typeof id === "number" ? id : parseInt(String(id ?? ""), 10);
  if (!Number.isSafeInteger(numId)) return null;
  return ALLOWED_PROJECT_IMAGE_IDS.has(numId) ? numId : null;
}

/** 内存收图：校验通过后才落盘，避免用未校验的 id 拼出文件名 */
export function createImageUpload() {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
    fileFilter: (_req, file, cb) => {
      if (file.mimetype !== "image/jpeg") {
        cb(new Error("ONLY_JPEG"));
        return;
      }
      cb(null, true);
    },
  });
}

export function isJpegBuffer(buf: Buffer | undefined): boolean {
  return !!buf && buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
}

/** id 必须已通过白名单校验；这里再挡一次路径穿越 */
export function writeUploadedJpeg(dir: string, id: string, buf: Buffer): boolean {
  const safeName = path.basename(`${id}.jpg`);
  if (safeName !== `${id}.jpg`) return false;
  fs.writeFileSync(path.join(dir, safeName), buf);
  return true;
}

export function deleteUploadedJpeg(dir: string, id: string): void {
  const safeName = path.basename(`${id}.jpg`);
  if (safeName !== `${id}.jpg`) return;
  const filePath = path.join(dir, safeName);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}
