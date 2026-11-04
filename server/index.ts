import "./env.js";
import express from "express";
import http from "http";
import { Server } from "socket.io";
import { registerSocketHandlers } from "./network/socketHandlers.js";
import { getGameIo, setGameIo } from "./network/gameIo.js";
import { broadcastUpdate } from "./network/broadcast.js";
import { rooms, customImagesVersions, customEraImagesVersions, customBuffImagesVersions, customPersonaImagesVersions } from "./state/store.js";
import { handleActionTimeExpired } from "./state/actionTimeExpiry.js";
import multer from "multer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";
import { assertAdminTokenConfigured, requireAdminToken } from "./config/adminAuth.js";
import {
  buildSessionExport,
  buildSessionWorkbook,
  safeExportBasename,
  contentDispositionAttachment,
} from "./export/sessionExport.js";
import { isAllowedBuffImageId } from "./util/buffImageIds.js";
import { isAllowedPersonaImageId } from "./config/personaImageSlugs.js";
import {
  createImageUpload,
  deleteUploadedJpeg,
  isAllowedEraImageId,
  isAllowedProjectImageId,
  isJpegBuffer,
  writeUploadedJpeg,
} from "./config/uploadGuards.js";
import { sweepRateLimits, allow } from "./util/rateLimit.js";
import {
  broadcastLeaderboardToAllRooms,
  getPublicCommunityLeaderboard,
  initCommunityLeaderboardPersistence,
} from "./state/communityLeaderboard.js";
import {
  getSessionById,
  getSessionSnapshot,
  getSessionStats,
  initSessionArchivePersistence,
  listSessions,
  syncLeaderboardFromArchiveOnBoot,
  voidSession,
} from "./state/sessionArchive.js";

assertAdminTokenConfigured();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

initCommunityLeaderboardPersistence(
  path.join(__dirname, "../data/community_leaderboard.json")
);
initSessionArchivePersistence(path.join(__dirname, "../data/session_archive.json"));
syncLeaderboardFromArchiveOnBoot();

const DEFAULT_ALLOWED_ORIGINS = [
  "https://guangyinduidu.com",
  "https://www.guangyinduidu.com",
  "https://admin.guangyinduidu.com",
  "http://guangyinduidu.com",
  "http://www.guangyinduidu.com",
  "http://admin.guangyinduidu.com",
];

function allowedOrigins(): string[] {
  const fromEnv = (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const list = fromEnv.length > 0 ? fromEnv : [...DEFAULT_ALLOWED_ORIGINS];
  if (process.env.NODE_ENV !== "production") {
    for (const origin of [
      "http://localhost:5173",
      "http://127.0.0.1:5173",
      "http://localhost:3030",
      "http://127.0.0.1:3030",
    ]) {
      if (!list.includes(origin)) list.push(origin);
    }
  }
  return list;
}

const corsOrigins = allowedOrigins();
const corsOriginOption = (
  origin: string | undefined,
  callback: (err: Error | null, allow?: boolean) => void
) => {
  if (!origin || corsOrigins.includes(origin)) {
    callback(null, true);
    return;
  }
  callback(new Error("Not allowed by CORS"));
};

const app = express();
app.set("trust proxy", 1);
app.use(cors({ origin: corsOriginOption }));

function ipLimit(limit: number, windowMs: number, tag: string): express.RequestHandler {
  return (req, res, next) => {
    if (!allow(`${tag}:${req.ip ?? "unknown"}`, limit, windowMs)) {
      res.status(429).json({ error: "请求过于频繁" });
      return;
    }
    next();
  };
}

app.use("/api", ipLimit(120, 60_000, "api"));
const uploadLimit = ipLimit(20, 60_000, "upload");
const exportLimit = ipLimit(10, 60_000, "export");

// --- File Upload Setup ---
const uploadDir = path.join(__dirname, "../data/uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Populate customImagesVersions from existing files on startup
const existingFiles = fs.readdirSync(uploadDir);
for (const file of existingFiles) {
  if (file.endsWith(".jpg")) {
    const id = parseInt(file.replace(".jpg", ""));
    if (!isNaN(id)) {
      customImagesVersions[id] = Date.now();
    }
  }
}

const uploadErasDir = path.join(__dirname, "../data/uploads_eras");
if (!fs.existsSync(uploadErasDir)) {
  fs.mkdirSync(uploadErasDir, { recursive: true });
}

// Populate customEraImagesVersions
const existingEraFiles = fs.readdirSync(uploadErasDir);
for (const file of existingEraFiles) {
  if (file.endsWith(".jpg")) {
    const eraName = file.replace(".jpg", "");
    if (!isAllowedEraImageId(eraName)) continue;
    customEraImagesVersions[eraName] = Date.now();
  }
}

const uploadBuffsDir = path.join(__dirname, "../data/uploads_buffs");
if (!fs.existsSync(uploadBuffsDir)) {
  fs.mkdirSync(uploadBuffsDir, { recursive: true });
}
for (const file of fs.readdirSync(uploadBuffsDir)) {
  if (file.endsWith(".jpg")) {
    const buffId = file.replace(".jpg", "");
    if (!isAllowedBuffImageId(buffId)) continue;
    customBuffImagesVersions[buffId] = Date.now();
  }
}

const uploadPersonasDir = path.join(__dirname, "../data/uploads_personas");
if (!fs.existsSync(uploadPersonasDir)) {
  fs.mkdirSync(uploadPersonasDir, { recursive: true });
}
for (const file of fs.readdirSync(uploadPersonasDir)) {
  if (file.endsWith(".jpg")) {
    const slug = file.replace(".jpg", "");
    if (!isAllowedPersonaImageId(slug)) continue;
    customPersonaImagesVersions[slug] = Date.now();
  }
}

app.use("/uploads", express.static(uploadDir));
app.use("/uploads_eras", express.static(uploadErasDir));
app.use("/uploads_buffs", express.static(uploadBuffsDir));
app.use("/uploads_personas", express.static(uploadPersonasDir));

const upload = createImageUpload();

function acceptUploadedJpeg(
  req: express.Request,
  res: express.Response,
  id: string,
  dir: string
): boolean {
  const file = req.file;
  if (!file) {
    res.status(400).json({ error: "Missing image file" });
    return false;
  }
  if (!isJpegBuffer(file.buffer)) {
    res.status(400).json({ error: "Invalid JPEG" });
    return false;
  }
  if (!writeUploadedJpeg(dir, id, file.buffer)) {
    res.status(400).json({ error: "Invalid id" });
    return false;
  }
  return true;
}

app.post("/api/upload-image", uploadLimit, requireAdminToken, upload.single("image"), (req, res) => {
  const numId = isAllowedProjectImageId(req.body.id);
  if (numId == null) return res.status(400).json({ error: "Invalid id" });
  if (!acceptUploadedJpeg(req, res, String(numId), uploadDir)) return;

  customImagesVersions[numId] = Date.now();
  io.emit("syncProjectImages", customImagesVersions);
  res.json({ success: true, timestamp: customImagesVersions[numId] });
});

app.post("/api/upload-era-image", uploadLimit, requireAdminToken, upload.single("image"), (req, res) => {
  const { id } = req.body;
  if (!isAllowedEraImageId(id)) return res.status(400).json({ error: "Invalid id" });
  if (!acceptUploadedJpeg(req, res, id, uploadErasDir)) return;

  customEraImagesVersions[id] = Date.now();
  io.emit("syncEraImages", customEraImagesVersions);
  res.json({ success: true, timestamp: customEraImagesVersions[id] });
});

app.post("/api/upload-buff-image", uploadLimit, requireAdminToken, upload.single("image"), (req, res) => {
  const { id } = req.body;
  if (!id || typeof id !== "string") return res.status(400).json({ error: "Missing id" });
  if (!isAllowedBuffImageId(id)) return res.status(400).json({ error: "Invalid buff card id" });
  if (!acceptUploadedJpeg(req, res, id, uploadBuffsDir)) return;

  customBuffImagesVersions[id] = Date.now();
  io.emit("syncBuffImages", customBuffImagesVersions);
  res.json({ success: true, timestamp: customBuffImagesVersions[id] });
});

app.post("/api/delete-buff-image", express.json(), requireAdminToken, (req, res) => {
  const { id } = req.body;
  if (!id || typeof id !== "string") return res.status(400).json({ error: "Missing id" });
  if (!isAllowedBuffImageId(id)) return res.status(400).json({ error: "Invalid buff card id" });

  deleteUploadedJpeg(uploadBuffsDir, id);
  customBuffImagesVersions[id] = 0;
  io.emit("syncBuffImages", customBuffImagesVersions);
  res.json({ success: true, timestamp: 0 });
});

app.post("/api/upload-persona-image", uploadLimit, requireAdminToken, upload.single("image"), (req, res) => {
  const { id } = req.body;
  if (!id || typeof id !== "string") return res.status(400).json({ error: "Missing id" });
  if (!isAllowedPersonaImageId(id)) return res.status(400).json({ error: "Invalid persona slug" });
  if (!acceptUploadedJpeg(req, res, id, uploadPersonasDir)) return;

  customPersonaImagesVersions[id] = Date.now();
  io.emit("syncPersonaImages", customPersonaImagesVersions);
  res.json({ success: true, timestamp: customPersonaImagesVersions[id] });
});

app.post("/api/delete-persona-image", express.json(), requireAdminToken, (req, res) => {
  const { id } = req.body;
  if (!id || typeof id !== "string") return res.status(400).json({ error: "Missing id" });
  if (!isAllowedPersonaImageId(id)) return res.status(400).json({ error: "Invalid persona slug" });

  deleteUploadedJpeg(uploadPersonasDir, id);
  customPersonaImagesVersions[id] = 0;
  io.emit("syncPersonaImages", customPersonaImagesVersions);
  res.json({ success: true, timestamp: 0 });
});

app.post("/api/delete-image", express.json(), requireAdminToken, (req, res) => {
  const numId = isAllowedProjectImageId(req.body.id);
  if (numId == null) return res.status(400).json({ error: "Invalid id" });

  deleteUploadedJpeg(uploadDir, String(numId));
  customImagesVersions[numId] = 0;
  io.emit("syncProjectImages", customImagesVersions);
  res.json({ success: true, timestamp: 0 });
});

app.post("/api/delete-era-image", express.json(), requireAdminToken, (req, res) => {
  const { id } = req.body;
  if (!isAllowedEraImageId(id)) return res.status(400).json({ error: "Invalid id" });

  deleteUploadedJpeg(uploadErasDir, id);
  customEraImagesVersions[id] = 0;
  io.emit("syncEraImages", customEraImagesVersions);
  res.json({ success: true, timestamp: 0 });
});
app.get("/api/community-leaderboard", (_req, res) => {
  res.json({ entries: getPublicCommunityLeaderboard() });
});

app.get("/api/admin/sessions/stats", requireAdminToken, (_req, res) => {
  res.json(getSessionStats());
});

app.get("/api/admin/sessions", requireAdminToken, (req, res) => {
  const status = String(req.query.status ?? "active");
  const q = String(req.query.q ?? "");
  const sort = String(req.query.sort ?? "completedAt");
  const page = parseInt(String(req.query.page ?? "1"), 10);
  const pageSize = parseInt(String(req.query.pageSize ?? "20"), 10);
  const allowedStatus = ["active", "voided", "all"];
  const allowedSort = ["completedAt", "communityWealth"];
  if (!allowedStatus.includes(status)) {
    res.status(400).json({ error: "Invalid status" });
    return;
  }
  if (!allowedSort.includes(sort)) {
    res.status(400).json({ error: "Invalid sort" });
    return;
  }
  res.json(
    listSessions({
      status: status as "active" | "voided" | "all",
      q,
      sort: sort as "completedAt" | "communityWealth",
      page: Number.isFinite(page) ? page : 1,
      pageSize: Number.isFinite(pageSize) ? pageSize : 20,
    })
  );
});

app.get("/api/admin/sessions/:sessionId", requireAdminToken, (req, res) => {
  const sessionId = String(req.params.sessionId ?? "").trim();
  if (!sessionId) {
    res.status(400).json({ error: "Missing sessionId" });
    return;
  }
  const detail = getSessionById(sessionId);
  if (!detail) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  res.json(detail);
});

app.post("/api/admin/sessions/:sessionId/void", express.json(), requireAdminToken, (req, res) => {
  const sessionId = String(req.params.sessionId ?? "").trim();
  if (!sessionId) {
    res.status(400).json({ error: "Missing sessionId" });
    return;
  }
  const reason = typeof req.body?.reason === "string" ? req.body.reason : undefined;
  const updated = voidSession(sessionId, reason);
  if (!updated) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  const liveIo = getGameIo();
  if (liveIo) broadcastLeaderboardToAllRooms(liveIo);
  res.json({ success: true, session: updated });
});

app.get("/api/admin/sessions/:sessionId/export", exportLimit, requireAdminToken, async (req, res) => {
  const sessionId = String(req.params.sessionId ?? "").trim();
  const format = String(req.query.format ?? "json").toLowerCase();
  if (!sessionId) {
    res.status(400).json({ error: "Missing sessionId" });
    return;
  }
  const snapshot = getSessionSnapshot(sessionId);
  if (!snapshot) {
    res.status(404).json({ error: "Snapshot not found for this session" });
    return;
  }
  const base = safeExportBasename(snapshot.meta.roomId);
  const suffix = sessionId.slice(0, 8);

  if (format === "xlsx") {
    const buf = await buildSessionWorkbook(snapshot);
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      contentDispositionAttachment(`${base}_${suffix}_session.xlsx`)
    );
    res.send(buf);
    return;
  }
  if (format === "json") {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      contentDispositionAttachment(`${base}_${suffix}_session.json`)
    );
    res.send(JSON.stringify(snapshot, null, 2));
    return;
  }
  res.status(400).json({ error: "Invalid format (use json or xlsx)" });
});

app.get("/api/session-export", exportLimit, requireAdminToken, async (req, res) => {
  const roomId = String(req.query.roomId ?? "").trim();
  const format = String(req.query.format ?? "json").toLowerCase();
  if (!roomId) {
    res.status(400).json({ error: "Missing roomId" });
    return;
  }
  const game = rooms[roomId];
  if (!game) {
    res.status(404).json({ error: "Room not found" });
    return;
  }
  const base = safeExportBasename(roomId);
  const exportData = buildSessionExport(game);

  if (format === "xlsx") {
    const buf = await buildSessionWorkbook(exportData);
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", contentDispositionAttachment(`${base}_session.xlsx`));
    res.send(buf);
    return;
  }
  if (format === "json") {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Disposition", contentDispositionAttachment(`${base}_session.json`));
    res.send(JSON.stringify(exportData, null, 2));
    return;
  }
  res.status(400).json({ error: "Invalid format (use json or xlsx)" });
});

// --- 本地一体化：构建后由 Node 直接托管管理员前端 ---
const frontendDist =
  path.basename(__dirname) === "dist"
    ? path.resolve(__dirname, "../../frontend/dist")
    : path.resolve(__dirname, "../frontend/dist");
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get("/", (_req, res) => res.redirect("/admin.html"));
}

app.use((err: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
    res.status(413).json({ error: "文件过大，最大 5MB" });
    return;
  }
  if (err instanceof Error && err.message === "ONLY_JPEG") {
    res.status(400).json({ error: "仅支持 JPEG 图片" });
    return;
  }
  next(err);
});

// -----------------------

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: corsOrigins },
  pingTimeout: 60_000,
  connectionStateRecovery: {
    maxDisconnectionDuration: 120_000,
    skipMiddlewares: true,
  },
});

setGameIo(io);

const PORT = 3001;

io.on("connection", (socket) => {
  registerSocketHandlers(io, socket);
});

/**
 * 全局 Tick
 */
const EMPTY_ROOM_TTL_MS = 2 * 60 * 60 * 1000;
const INVESTMENT_CLOCK_SYNC_MS = 15_000;
let lastRoomSweepAt = 0;
const investmentClockSyncAt = new Map<string, number>();

setInterval(() => {
  const now = Date.now();
  Object.values(rooms).forEach((game) => {
    if (handleActionTimeExpired(game)) {
      investmentClockSyncAt.delete(game.roomId);
      broadcastUpdate(io, game);
      return;
    }
    if (game.phase === "INVESTMENT" && game.investmentEndsAt != null) {
      const last = investmentClockSyncAt.get(game.roomId) ?? 0;
      if (now - last >= INVESTMENT_CLOCK_SYNC_MS) {
        investmentClockSyncAt.set(game.roomId, now);
        broadcastUpdate(io, game);
      }
    } else {
      investmentClockSyncAt.delete(game.roomId);
    }
  });
  if (now - lastRoomSweepAt < 60_000) return;
  lastRoomSweepAt = now;
  sweepRateLimits(60_000, now);
  for (const [rid, game] of Object.entries(rooms)) {
    if (game.phase !== "ROOM_WAITING") continue;
    if (game.players.some((p) => p.connected)) continue;
    const created = game.roomCreatedAt ?? 0;
    if (now - created > EMPTY_ROOM_TTL_MS) {
      delete rooms[rid];
    }
  }
}, 1000);

server.listen(PORT, () => {
  console.log(`✅ 光阴对赌新新新 Server running on port ${PORT}`);
});
