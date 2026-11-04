import fs from "fs";
import { Server } from "socket.io";
import { globalLeaderboard, rooms } from "./store.js";
import { broadcastUpdate } from "../network/broadcast.js";

export type CommunityLeaderboardEntry = {
  name: string;
  score: number;
  roomId: string;
  recordedAt: number;
  sessionId?: string;
};

export type PublicLeaderboardEntry = {
  name: string;
  score: number;
  recordedAt: number;
};

const TOP_N = 10;
const MAX_NAME_LENGTH = 20;

let persistPath: string | null = null;

/** 只读加载历史榜单，供档案为空时一次性迁移；运行期不再写回磁盘 */
export function initCommunityLeaderboardPersistence(filePath: string): void {
  persistPath = filePath;
  loadFromDisk();
}

function loadFromDisk(): void {
  if (!persistPath || !fs.existsSync(persistPath)) return;
  try {
    const raw = fs.readFileSync(persistPath, "utf-8");
    const parsed = JSON.parse(raw) as { entries?: CommunityLeaderboardEntry[] };
    if (!Array.isArray(parsed.entries)) {
      console.error("Community leaderboard parse: missing entries; ignoring file");
      return;
    }
    globalLeaderboard.length = 0;
    for (const e of parsed.entries) {
      if (typeof e.name !== "string" || typeof e.score !== "number") continue;
      globalLeaderboard.push({
        name: e.name,
        score: e.score,
        roomId: typeof e.roomId === "string" ? e.roomId : "",
        recordedAt: typeof e.recordedAt === "number" ? e.recordedAt : 0,
        sessionId: typeof e.sessionId === "string" ? e.sessionId : undefined,
      });
    }
    sortAndTrimInPlace();
  } catch (err) {
    console.error("Failed to load community leaderboard:", err);
  }
}

function sortAndTrimInPlace(): void {
  globalLeaderboard.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.recordedAt - a.recordedAt;
  });
  while (globalLeaderboard.length > TOP_N) globalLeaderboard.pop();
}

/** 去除控制字符、首尾空白，限制长度 */
export function sanitizeCommunityName(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const trimmed = raw.replace(/[\x00-\x1f\x7f]/g, "").trim();
  if (!trimmed) return "";
  return trimmed.slice(0, MAX_NAME_LENGTH);
}

export function getCommunityLeaderboard(): CommunityLeaderboardEntry[] {
  return globalLeaderboard.map((e) => ({ ...e }));
}

/** 对外（玩家端 / 公开接口）可见的榜单投影，不含房间号、场次 ID 等内部标识 */
export function getPublicCommunityLeaderboard(): PublicLeaderboardEntry[] {
  return globalLeaderboard.map(({ name, score, recordedAt }) => ({ name, score, recordedAt }));
}

/** @deprecated 排行榜由 sessionArchive.rebuildCommunityLeaderboardFromArchive 维护 */
export function recordCommunityScore(
  name: string,
  score: number,
  roomId: string,
  sessionId?: string
): CommunityLeaderboardEntry[] {
  const safeScore = Number.isFinite(score) ? Math.round(score) : 0;
  const recordedAt = Date.now();
  const idx = globalLeaderboard.findIndex((e) => e.roomId === roomId);
  const entry: CommunityLeaderboardEntry = {
    name,
    score: safeScore,
    roomId,
    recordedAt,
    sessionId,
  };
  if (idx >= 0) {
    globalLeaderboard[idx] = entry;
  } else {
    globalLeaderboard.push(entry);
  }
  sortAndTrimInPlace();
  return getCommunityLeaderboard();
}

export function replaceCommunityLeaderboard(entries: CommunityLeaderboardEntry[]): void {
  globalLeaderboard.length = 0;
  for (const e of entries) {
    globalLeaderboard.push({ ...e });
  }
}

export function broadcastLeaderboardToAllRooms(io: Server): void {
  for (const game of Object.values(rooms)) {
    broadcastUpdate(io, game);
  }
}
