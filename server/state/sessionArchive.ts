import fs from "fs";
import { GameState, getWealthiestPlayer } from "./gameState.js";
import { buildSessionExport } from "../export/sessionExport.js";
import { writeJsonAtomic } from "../util/atomicJson.js";
import {
  CommunityLeaderboardEntry,
  getCommunityLeaderboard,
  replaceCommunityLeaderboard,
} from "./communityLeaderboard.js";

export type SessionRecordStatus = "active" | "voided";

export type GameSessionPlayerSummary = {
  name: string;
  wealth: number;
  isAI?: boolean;
  fatePersona?: string;
};

export type GameSessionRecord = {
  sessionId: string;
  roomId: string;
  communityName: string;
  communityWealth: number;
  playerCount: number;
  sessionStartedAt: number | null;
  completedAt: number;
  eraTheme: string | null;
  topPlayer: { name: string; wealth: number };
  playersSummary: GameSessionPlayerSummary[];
  leaderboardRankAtComplete: number | null;
  status: SessionRecordStatus;
  voidedAt?: number;
  voidedReason?: string;
  migrated?: boolean;
  snapshot?: ReturnType<typeof buildSessionExport>;
};

type ArchiveFile = { sessions: GameSessionRecord[] };

const TOP_N = 10;

let persistPath: string | null = null;
let persistDisabled = false;
const sessionsById = new Map<string, GameSessionRecord>();

export function initSessionArchivePersistence(filePath: string): void {
  persistPath = filePath;
  persistDisabled = false;
  loadFromDisk();
  migrateFromLeaderboardIfEmpty();
}

function loadFromDisk(): void {
  if (!persistPath || !fs.existsSync(persistPath)) return;
  try {
    const raw = fs.readFileSync(persistPath, "utf-8");
    const parsed = JSON.parse(raw) as ArchiveFile;
    if (!Array.isArray(parsed.sessions)) {
      persistDisabled = true;
      console.error("Session archive parse: missing sessions array; refusing further writes");
      return;
    }
    sessionsById.clear();
    for (const s of parsed.sessions) {
      if (!s?.sessionId || typeof s.communityName !== "string") continue;
      sessionsById.set(s.sessionId, s);
    }
  } catch (err) {
    persistDisabled = true;
    console.error("Failed to load session archive; refusing further writes:", err);
  }
}

function persistToDisk(): void {
  if (!persistPath || persistDisabled) return;
  try {
    const sessions = [...sessionsById.values()].sort((a, b) => b.completedAt - a.completedAt);
    writeJsonAtomic(persistPath, { sessions });
  } catch (err) {
    console.error("Failed to persist session archive:", err);
  }
}

/** 档案为空时，从当前排行榜迁移最小记录 */
function migrateFromLeaderboardIfEmpty(): void {
  if (sessionsById.size > 0) return;
  const entries = getCommunityLeaderboard();
  if (entries.length === 0) return;
  for (const e of entries) {
    const recordedAt = e.recordedAt ?? 0;
    const sessionId =
      e.sessionId && e.sessionId.length > 0
        ? e.sessionId
        : `legacy:${e.roomId}:${recordedAt}`;
    if (sessionsById.has(sessionId)) continue;
    const record: GameSessionRecord = {
      sessionId,
      roomId: e.roomId,
      communityName: e.name,
      communityWealth: e.score,
      playerCount: 0,
      sessionStartedAt: null,
      completedAt: recordedAt,
      eraTheme: null,
      topPlayer: { name: "—", wealth: 0 },
      playersSummary: [],
      leaderboardRankAtComplete: null,
      status: "active",
      migrated: true,
    };
    sessionsById.set(sessionId, record);
  }
  persistToDisk();
}

export function archiveCompletedSession(game: GameState): GameSessionRecord {
  const sessionId = game.sessionId ?? `fallback:${game.roomId}:${Date.now()}`;
  const completedAt = Date.now();
  const communityWealth = game.players.reduce((sum, p) => sum + p.wealth, 0);
  const richest = getWealthiestPlayer(game);
  const snapshot = buildSessionExport(game);

  const playersSummary: GameSessionPlayerSummary[] = [...game.players]
    .sort((a, b) => b.wealth - a.wealth)
    .map((p) => ({
      name: p.name,
      wealth: p.wealth,
      isAI: p.isAI ?? false,
      fatePersona: p.analysisResult?.primaryPersona,
    }));

  const record: GameSessionRecord = {
    sessionId,
    roomId: game.roomId,
    communityName: game.communityName ?? snapshot.meta.communityName ?? "未命名",
    communityWealth: Math.round(communityWealth),
    playerCount: game.players.length,
    sessionStartedAt: game.sessionStartedAt ?? null,
    completedAt,
    eraTheme: game.currentEraCard?.name ?? null,
    topPlayer: richest
      ? { name: richest.name, wealth: richest.wealth }
      : { name: "—", wealth: 0 },
    playersSummary,
    leaderboardRankAtComplete: null,
    status: "active",
    snapshot,
  };

  sessionsById.set(sessionId, record);
  rebuildCommunityLeaderboardFromArchive();
  persistToDisk();
  return { ...sessionsById.get(sessionId)! };
}

export function rebuildCommunityLeaderboardFromArchive(): CommunityLeaderboardEntry[] {
  const active = [...sessionsById.values()].filter((s) => s.status === "active");
  active.sort((a, b) => {
    if (b.communityWealth !== a.communityWealth) return b.communityWealth - a.communityWealth;
    return b.completedAt - a.completedAt;
  });
  const top = active.slice(0, TOP_N).map((s) => ({
    name: s.communityName,
    score: s.communityWealth,
    roomId: s.roomId,
    recordedAt: s.completedAt,
    sessionId: s.sessionId,
  }));
  replaceCommunityLeaderboard(top);

  for (const s of sessionsById.values()) {
    if (s.status !== "active") {
      s.leaderboardRankAtComplete = null;
      continue;
    }
    const rank = top.findIndex((e) => e.sessionId === s.sessionId);
    s.leaderboardRankAtComplete = rank >= 0 ? rank + 1 : null;
  }

  return getCommunityLeaderboard();
}

export function voidSession(
  sessionId: string,
  reason?: string
): GameSessionRecord | null {
  const record = sessionsById.get(sessionId);
  if (!record) return null;
  if (record.status === "voided") return { ...record };

  record.status = "voided";
  record.voidedAt = Date.now();
  record.voidedReason = reason?.trim() || "管理员剔除";
  record.leaderboardRankAtComplete = null;
  sessionsById.set(sessionId, record);
  rebuildCommunityLeaderboardFromArchive();
  persistToDisk();
  return { ...record };
}

export type SessionListStatus = "active" | "voided" | "all";

export type SessionListQuery = {
  status?: SessionListStatus;
  q?: string;
  sort?: "completedAt" | "communityWealth";
  page?: number;
  pageSize?: number;
};

export function listSessions(query: SessionListQuery = {}) {
  const status = query.status ?? "active";
  const q = (query.q ?? "").trim().toLowerCase();
  const sort = query.sort ?? "completedAt";
  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 20));

  let list = [...sessionsById.values()];
  if (status === "active") list = list.filter((s) => s.status === "active");
  else if (status === "voided") list = list.filter((s) => s.status === "voided");

  if (q) {
    list = list.filter(
      (s) =>
        s.communityName.toLowerCase().includes(q) ||
        s.roomId.toLowerCase().includes(q) ||
        s.sessionId.toLowerCase().includes(q)
    );
  }

  list.sort((a, b) => {
    if (sort === "communityWealth") {
      if (b.communityWealth !== a.communityWealth) return b.communityWealth - a.communityWealth;
      return b.completedAt - a.completedAt;
    }
    return b.completedAt - a.completedAt;
  });

  const total = list.length;
  const start = (page - 1) * pageSize;
  const items = list.slice(start, start + pageSize).map(toListItem);

  return { items, total, page, pageSize };
}

function toListItem(s: GameSessionRecord) {
  return {
    sessionId: s.sessionId,
    roomId: s.roomId,
    communityName: s.communityName,
    communityWealth: s.communityWealth,
    playerCount: s.playerCount,
    sessionStartedAt: s.sessionStartedAt,
    completedAt: s.completedAt,
    eraTheme: s.eraTheme,
    topPlayer: s.topPlayer,
    playersSummary: s.playersSummary,
    leaderboardRankAtComplete: s.leaderboardRankAtComplete,
    status: s.status,
    voidedAt: s.voidedAt,
    voidedReason: s.voidedReason,
    migrated: s.migrated ?? false,
    hasSnapshot: Boolean(s.snapshot),
  };
}

export function getSessionById(sessionId: string) {
  const s = sessionsById.get(sessionId);
  if (!s) return null;
  return {
    ...toListItem(s),
    snapshotMeta: s.snapshot?.meta ?? null,
  };
}

export function getSessionSnapshot(sessionId: string) {
  return sessionsById.get(sessionId)?.snapshot ?? null;
}

export function getSessionStats() {
  const all = [...sessionsById.values()];
  const active = all.filter((s) => s.status === "active");
  const voided = all.filter((s) => s.status === "voided");
  const weekStart = startOfWeek(Date.now());

  const thisWeek = active.filter((s) => s.completedAt >= weekStart).length;
  const onLeaderboard = active.filter((s) => s.leaderboardRankAtComplete != null).length;
  const maxWealth = active.reduce((m, s) => Math.max(m, s.communityWealth), 0);

  return {
    totalActive: active.length,
    totalVoided: voided.length,
    totalAll: all.length,
    completedThisWeek: thisWeek,
    onLeaderboard,
    maxCommunityWealth: maxWealth,
  };
}

function startOfWeek(ts: number): number {
  const d = new Date(ts);
  const day = d.getDay();
  const diff = day === 0 ? 6 : day - 1;
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - diff);
  return d.getTime();
}

/** 启动后若档案有数据但榜与档案不一致，可同步一次 */
export function syncLeaderboardFromArchiveOnBoot(): void {
  if (sessionsById.size === 0) return;
  rebuildCommunityLeaderboardFromArchive();
}
