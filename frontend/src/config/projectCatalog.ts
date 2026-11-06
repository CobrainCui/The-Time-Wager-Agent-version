/** 与 server/data/game_data.ts 对齐；改 server 时需同步此处 */

import {
  effectiveRankRewards,
  resolveRankPlayerCountFromGame,
  resolveRankRewardTierCountFromGame,
} from "./rankRewardSchedule";
import type { GameState } from "../types";

export const ERA_BONUS_SHORT = 50;
export const ERA_BONUS_LONG = 100;

export type CatalogProjectType = "short" | "long" | "risk";

export interface ProjectCatalogEntry {
  id: number;
  name: string;
  type: CatalogProjectType;
  era: string;
  maxEnergy: number;
  rankRewards?: number[];
  overInvestPenalty?: number[];
  /** 速查用一句话 */
  baseReturnHint: string;
}

export function getRiskRate(name: string): number {
  if (name.includes("成瘾") || name.includes("完美") || name.includes("幸福")) return 25;
  return 20;
}

function riskHint(name: string): string {
  return `每点精力每轮回报 ${getRiskRate(name)} 财富`;
}

const short: ProjectCatalogEntry[] = [
  { id: 1, name: "新能源汽车", type: "short", era: "气候", maxEnergy: 23, rankRewards: [80, 55, 35, 25, 20, 10], overInvestPenalty: [-35, -20, -15, -10, -5, -5], baseReturnHint: "每点精力每轮回报 10 财富" },
  { id: 2, name: "兴建巨型水坝", type: "short", era: "气候", maxEnergy: 30, rankRewards: [105, 65, 50, 40, 30, 10], overInvestPenalty: [-40, -25, -20, -15, -5, -5], baseReturnHint: "每点精力每轮回报 10 财富" },
  { id: 3, name: "视频会议", type: "short", era: "科技", maxEnergy: 23, rankRewards: [80, 55, 35, 25, 20, 10], overInvestPenalty: [-35, -20, -15, -10, -5, -5], baseReturnHint: "每点精力每轮回报 10 财富" },
  { id: 4, name: "数字地图", type: "short", era: "科技", maxEnergy: 18, rankRewards: [65, 45, 35, 20, 10, 10], overInvestPenalty: [-25, -15, -10, -10, -5, -5], baseReturnHint: "每点精力每轮回报 10 财富" },
  { id: 5, name: "国际文化艺术节", type: "short", era: "文化", maxEnergy: 18, rankRewards: [65, 45, 35, 20, 10, 10], overInvestPenalty: [-25, -15, -10, -10, -5, -5], baseReturnHint: "每点精力每轮回报 10 财富" },
  { id: 6, name: "民俗主题公园", type: "short", era: "文化", maxEnergy: 30, rankRewards: [105, 65, 50, 40, 30, 10], overInvestPenalty: [-40, -25, -20, -15, -5, -5], baseReturnHint: "每点精力每轮回报 10 财富" },
  { id: 7, name: "公共体育设施免费开放", type: "short", era: "健康", maxEnergy: 23, rankRewards: [80, 55, 35, 25, 20, 10], overInvestPenalty: [-35, -20, -15, -10, -5, -5], baseReturnHint: "每点精力每轮回报 10 财富" },
  { id: 8, name: "“全民健身日”嘉年华", type: "short", era: "健康", maxEnergy: 18, rankRewards: [65, 45, 35, 20, 10, 10], overInvestPenalty: [-25, -15, -10, -10, -5, -5], baseReturnHint: "每点精力每轮回报 10 财富" },
  { id: 9, name: "数字排毒", type: "short", era: "心理", maxEnergy: 23, rankRewards: [80, 55, 35, 25, 20, 10], overInvestPenalty: [-35, -20, -15, -10, -5, -5], baseReturnHint: "每点精力每轮回报 10 财富" },
  { id: 10, name: "EAP全面推行", type: "short", era: "心理", maxEnergy: 30, rankRewards: [105, 65, 50, 40, 30, 10], overInvestPenalty: [-40, -25, -20, -15, -5, -5], baseReturnHint: "每点精力每轮回报 10 财富" },
];

const long: ProjectCatalogEntry[] = [
  { id: 101, name: "植树造林", type: "long", era: "气候", maxEnergy: 90, rankRewards: [80, 55, 40, 30, 25, 10], baseReturnHint: "每点精力完成后回报 15 财富" },
  { id: 102, name: "城市海绵体改造", type: "long", era: "气候", maxEnergy: 100, rankRewards: [85, 60, 50, 35, 30, 15], baseReturnHint: "每点精力完成后回报 15 财富" },
  { id: 103, name: "数字图书馆", type: "long", era: "科技", maxEnergy: 90, rankRewards: [80, 55, 40, 30, 25, 10], baseReturnHint: "每点精力完成后回报 15 财富" },
  { id: 104, name: "遗产保护基金", type: "long", era: "文化", maxEnergy: 90, rankRewards: [80, 55, 40, 30, 25, 10], baseReturnHint: "每点精力完成后回报 15 财富" },
  { id: 105, name: "文化桥梁使者", type: "long", era: "文化", maxEnergy: 100, rankRewards: [85, 60, 50, 35, 30, 15], baseReturnHint: "每点精力完成后回报 15 财富" },
  { id: 106, name: "建立体育俱乐部", type: "long", era: "健康", maxEnergy: 90, rankRewards: [80, 55, 40, 30, 25, 10], baseReturnHint: "每点精力完成后回报 15 财富" },
  { id: 107, name: "心理学教育普及", type: "long", era: "心理", maxEnergy: 110, rankRewards: [90, 65, 55, 40, 30, 20], baseReturnHint: "每点精力完成后回报 15 财富" },
];

const risk: ProjectCatalogEntry[] = [
  { id: 201, name: "开采化石能源", type: "risk", era: "气候", maxEnergy: 12, baseReturnHint: riskHint("开采化石能源") },
  { id: 202, name: "成瘾算法", type: "risk", era: "科技", maxEnergy: 8, baseReturnHint: riskHint("成瘾算法") },
  { id: 203, name: "数据监控", type: "risk", era: "科技", maxEnergy: 12, baseReturnHint: riskHint("数据监控") },
  { id: 204, name: "文化商品化", type: "risk", era: "文化", maxEnergy: 12, baseReturnHint: riskHint("文化商品化") },
  { id: 205, name: "营养代餐", type: "risk", era: "健康", maxEnergy: 12, baseReturnHint: riskHint("营养代餐") },
  { id: 206, name: "完美身材", type: "risk", era: "健康", maxEnergy: 8, baseReturnHint: riskHint("完美身材") },
  { id: 207, name: "幸福药丸", type: "risk", era: "心理", maxEnergy: 8, baseReturnHint: riskHint("幸福药丸") },
  { id: 208, name: "大师速成班", type: "risk", era: "心理", maxEnergy: 12, baseReturnHint: riskHint("大师速成班") },
];

export const PROJECT_CATALOG: ProjectCatalogEntry[] = [...short, ...long, ...risk];

export const PROJECT_CATALOG_BY_ID: Record<number, ProjectCatalogEntry> = Object.fromEntries(
  PROJECT_CATALOG.map((p) => [p.id, p])
);

export function catalogEntryRankRewards(
  entry: ProjectCatalogEntry,
  playerCount?: number
): number[] | undefined {
  return effectiveRankRewards(entry.rankRewards, playerCount);
}

function findProjectSnapshot(game: GameState, projectId: number) {
  return (
    game.activeProjects.find((p) => p.id === projectId) ??
    game.completedProjects?.find((p) => p.id === projectId) ??
    game.uncompletedProjects?.find((p) => p.id === projectId)
  );
}

/** 说明/速查：优先牌桌实例（发牌时已缩放），否则按本局人数从图鉴推算 */
export function rankRewardsForGameProject(
  game: GameState,
  entry: ProjectCatalogEntry
): number[] | undefined {
  const tierCount = resolveRankRewardTierCountFromGame(game);
  const snap = findProjectSnapshot(game, entry.id);
  if (snap?.rankRewards?.length) {
    if (tierCount === 4 || tierCount === 5) {
      if (snap.rankRewards.length === tierCount) return snap.rankRewards;
      const rescale = catalogEntryRankRewards(entry, resolveRankPlayerCountFromGame(game));
      if (rescale?.length) return rescale;
    }
    return snap.rankRewards;
  }
  return catalogEntryRankRewards(entry, resolveRankPlayerCountFromGame(game));
}

/** 短期超上限投爆惩罚档：与牌面一致，展示本局人数对应的第 1–N 名档 */
export function overInvestPenaltyForGameProject(
  game: GameState,
  entry: ProjectCatalogEntry
): number[] | undefined {
  if (entry.type !== "short") return undefined;
  const snap = findProjectSnapshot(game, entry.id);
  const base = snap?.overInvestPenalty ?? entry.overInvestPenalty;
  if (!base?.length) return undefined;
  const n = resolveRankRewardTierCountFromGame(game);
  return base.slice(0, Math.min(n, base.length));
}

export {
  effectiveRankRewards,
  resolveRankPlayerCountFromGame,
  resolveRankRewardTierCount,
  resolveRankRewardTierCountFromGame,
} from "./rankRewardSchedule";

export function formatTop3(nums?: number[]): string {
  if (!nums?.length) return "—";
  return nums.slice(0, 3).join("/");
}

/** 第 1–6 名数值，弹窗等完整展示用 */
export function formatRankList(nums?: number[]): string {
  if (!nums?.length) return "—";
  return nums.join("/");
}

export function rankRewardRows(nums?: number[]): { rank: number; value: number }[] {
  if (!nums?.length) return [];
  return nums.map((value, index) => ({ rank: index + 1, value }));
}

export function formatShortBurstPenaltyForGame(game: GameState, entry: ProjectCatalogEntry): string {
  return formatRankList(overInvestPenaltyForGameProject(game, entry));
}

export const TYPE_LABEL: Record<CatalogProjectType, string> = {
  short: "短期",
  long: "长期",
  risk: "风险",
};

/** 项目卡 / 帮助速查用 */
export const SETTLEMENT_TIMING_SHORT: Record<CatalogProjectType, string> = {
  short: "当轮结算",
  long: "完成后结算；游戏结束（第四时代第二轮）未完成按进度分档返还",
  risk: "当轮结算",
};

/** 详情弹窗「结算时间」说明（与 server 第四时代第二轮未完成长期进度奖一致） */
export const SETTLEMENT_TIMING_DETAIL: Record<CatalogProjectType, string> = {
  short:
    "每轮投资阶段结束后，按本轮投入结算收益（含排名奖与超额投资惩罚，见下方规则）。完成时排名奖按开局人数（4 人、5 人、6 人）分档，总池与六人局一致。",
  long:
    "达到或超过总上限时，一次性发放完成回报与排名奖（恰好满额与超额完成都正常结算，没有短期项目那种超额投资惩罚；排名奖按开局人数（4 人、5 人、6 人）分档，总池与六人局一致）。未填满期间每轮只更新进度、不发完成奖。参与投资后，每轮至少要投入 3 点精力，否则视为放弃：累计投入的每 1 点精力返还 1 点财富，并退出完成排名与时代加成；你此前计入项目的进度仍留在牌面上，但不再为你产生回报。第四时代第二轮结算时若仍未完成，按该项目全场累计进度分档返还你的累计投入：总进度不足三分之一时，每 1 点精力返还 1 点财富；达到三分之一时，每 1 点精力返还 5 点财富；达到三分之二时，每 1 点精力返还 10 点财富。",
  risk: "每轮投资阶段结束后，按本轮投入结算回报（未超过上限时）；超过上限则当轮投资失败（爆掉），并追回历史风险收益。",
};

/** 牌面存续（与 server projectSettlement 离场逻辑一致） */
export const PROJECT_BOARD_WITHDRAW_HELP =
  "新发放后累计投入仍为 0，且连续 2 轮无人投，则不再出现（曾投过、累计大于 0 的不会因空轮撤场）";
export const PROJECT_BOARD_PERSIST_HELP =
  "未完成之前不会撤场，跨时代仍留在牌面（完成、投资失败（爆掉）、长期填满离场除外）";
export const PROJECT_BOARD_RISK_ERA_STRIP = "换代时，上一时代主题的风险项目会移除";

export const PROJECT_BOARD_NEW_PROJECTS_HELP =
  "每个时代第一轮发放一次新项目（第二轮不发）：第 1 时代 6 个（短期 3、长期 2、风险 1），第 2 至第 4 时代各 4 个（短期 2、长期 1、风险 1）";

export const PROJECT_BOARD_PERSISTENCE_DETAIL =
  `${PROJECT_BOARD_PERSIST_HELP}。${PROJECT_BOARD_WITHDRAW_HELP}。${PROJECT_BOARD_RISK_ERA_STRIP}。`;

/** 与 ProjectCard 类型色一致，用于速查等纯文字标注 */
export const TYPE_TEXT_COLOR: Record<CatalogProjectType, string> = {
  short: "#93c5fd",
  long: "#6ee7b7",
  risk: "#fca5a5",
};
