import { GameState } from "./gameState.js";

// Store all active rooms
export const rooms: Record<string, GameState> = {};

// Store uploaded project images timestamps (to bust cache and indicate custom image exists)
export const customImagesVersions: Record<number, number> = {};
export const customEraImagesVersions: Record<string, number> = {};
export const customBuffImagesVersions: Record<string, number> = {};
export const customPersonaImagesVersions: Record<string, number> = {};

/** 跨局社区总财富榜（内存；由 session_archive 派生，启动时可从旧 community_leaderboard.json 迁移） */
export const globalLeaderboard: {
  name: string;
  score: number;
  roomId: string;
  recordedAt: number;
  sessionId?: string;
}[] = [];