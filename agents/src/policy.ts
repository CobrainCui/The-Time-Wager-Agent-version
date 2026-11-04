import type { AgentConfig } from "./config.js";
import type { AuctionPlan, InvestmentPlan, Observation, ProjectView, TransactionDecision } from "./types.js";

/**
 * 内置策略：当 API Key 未填写、或模型调用失败时使用。
 * 目标不是最优，而是保证 6 个 Agent 在没有大模型时也能完整跑完一局。
 */

function planEnergyForProject(p: ProjectView): number {
  return Math.max(0, Math.floor(p.maxEnergy - (p.currentInvested ?? 0)));
}

function scoreProject(p: ProjectView, obs: Observation, agent: AgentConfig, behind: boolean): number {
  const remaining = planEnergyForProject(p);
  if (remaining <= 0) return -Infinity;
  const base = p.rate ?? (p.type === "long" ? 15 : p.type === "risk" ? 20 : 10);
  const rankBonus =
    p.rankRewards && p.rankRewards.length
      ? p.rankRewards.reduce((a, b) => a + b, 0) / p.rankRewards.length
      : 0;
  const eraMatch = p.era && obs.eraCard?.era && p.era === obs.eraCard.era ? 1 : 0;

  switch (agent.persona) {
    case "时荫植者":
      if (p.type === "long") return 1000 + base * 0.2 + rankBonus * 0.1 + eraMatch * 200;
      if (p.type === "short") return 120 + base + rankBonus;
      return 10;
    case "罗盘精算师":
      if (p.type === "risk") return 5;
      if (p.type === "long") return 300 + base + rankBonus + eraMatch * 150;
      return 400 + base + rankBonus + eraMatch * 150;
    case "涌机触发者":
      if (p.type === "risk") return 1000 + base + eraMatch * 50;
      if (p.type === "short") return 300 + base;
      return 120 + base;
    case "瞬刻炼金士":
      if (p.type === "short") return 1000 + base + rankBonus + eraMatch * 100;
      if (p.type === "risk") return 350 + base;
      return 60 + base;
    case "桥梁架构师":
      if (p.type === "long") return 700 + base + eraMatch * 200;
      if (p.type === "short") return 350 + base;
      return behind ? 180 : 80;
    default:
      if (behind && p.type === "risk") return 500 + base;
      if (p.type === "long") return 400 + base + eraMatch * 150;
      if (p.type === "short") return 380 + base + rankBonus;
      return 260 + base;
  }
}

function fallbackInvestment(obs: Observation, agent: AgentConfig): InvestmentPlan {
  const leader = obs.players.filter((p) => !p.isMe).sort((a, b) => b.wealth - a.wealth)[0];
  const behind = !!leader && leader.wealth > obs.me.wealth * 1.15;
  const candidates = obs.projects
    .map((p) => ({ p, score: scoreProject(p, obs, agent, behind) }))
    .filter((x) => Number.isFinite(x.score) && x.score > 0)
    .sort((a, b) => b.score - a.score);

  let energy = Math.max(0, Math.floor(obs.me.energy));
  const investment: Record<string, number> = {};
  const aggressive = agent.riskTolerance >= 0.6 || agent.persona === "涌机触发者";

  for (const { p } of candidates) {
    if (energy <= 0) break;
    const remaining = planEnergyForProject(p);
    if (remaining <= 0) continue;
    // 长期项目单轮低于 3 会放弃，因此至少投 3（除非只剩 1–2 点）
    let amount = p.type === "long" ? Math.min(remaining, Math.max(3, Math.floor(energy * 0.5))) : remaining;
    if (energy < 3 && p.type === "long") amount = energy;
    amount = Math.min(amount, remaining, energy);
    if (amount <= 0) continue;
    investment[String(p.id)] = amount;
    energy -= amount;
    if (!aggressive && p.type !== "long") break;
  }

  // 还有精力但所有项目都满额：随便投到仍有余量的项目（允许超投的风险项目）
  if (energy > 0) {
    const fallback = obs.projects.find((p) => planEnergyForProject(p) > 0);
    if (fallback) {
      investment[String(fallback.id)] = (investment[String(fallback.id)] ?? 0) + energy;
    }
  }

  // 简单道具策略
  let useCard: InvestmentPlan["useCard"] = null;
  const inv = obs.me.inventory;
  const leaderTarget = leader?.id;
  const topProject = [...obs.projects].sort((a, b) => b.accumulatedInvested - a.accumulatedInvested)[0];

  if (inv.includes("buff_gold") && obs.projects.length > 0) {
    useCard = { cardId: "buff_gold" };
  } else if (inv.includes("buff_insurance") && aggressive) {
    useCard = { cardId: "buff_insurance" };
  } else if (inv.includes("buff_work_rest") && !aggressive) {
    useCard = { cardId: "buff_work_rest", targetPlayerId: obs.me.id };
  } else if (inv.includes("buff_slack") && leaderTarget && aggressive) {
    useCard = { cardId: "buff_slack", targetPlayerId: leaderTarget };
  } else if (inv.includes("buff_short") && topProject && aggressive) {
    useCard = { cardId: "buff_short", targetProjectId: topProject.id };
  } else if (inv.includes("buff_lighter") && leaderTarget && aggressive) {
    useCard = { cardId: "buff_lighter", targetPlayerId: leaderTarget, burnCardId: "buff_gold" };
  }

  const transfer =
    agent.persona === "桥梁架构师" && leaderTarget && obs.me.wealth > 120
      ? { toPlayerId: leaderTarget, amount: 10, note: "合作意向，长期项目一起做大" }
      : null;

  return {
    reasoning: "内置策略：按人格偏好分配精力",
    coffee: 0,
    useCard,
    transfer,
    investment,
    ready: true,
  };
}

export function fallbackAuction(
  obs: Observation,
  agent: AgentConfig,
  cardId: string,
  maxBid: number
): AuctionPlan {
  const minNext = obs.auction?.minimumNextBid ?? 5;
  const inv = obs.me.inventory;

  if (inv.includes("buff_force_buy")) {
    return { action: "force_buy", reasoning: "免费拿焦点卡" };
  }

  const wanted =
    cardId === "buff_gold" ||
    cardId === "buff_insurance" ||
    (agent.riskTolerance >= 0.6 && (cardId === "buff_slack" || cardId === "buff_short" || cardId === "buff_lighter"));

  if (!wanted) return { action: "pass", reasoning: "这张卡与我的策略不匹配" };
  if (minNext > maxBid) return { action: "pass", reasoning: "超出预算" };

  // 一次性跳到自己的估值附近，避免 6 个 Agent 每次只加 5 导致竞价拉锯
  const current = obs.auction?.currentBid ?? 0;
  const amount =
    current <= 0 ? minNext : Math.min(maxBid, Math.max(minNext, current + Math.max(5, Math.ceil((maxBid - current) / 2))));
  return { action: "bid", amount, reasoning: "按人格预算内出价" };
}

export function fallbackTransactionDecision(): TransactionDecision {
  return { decision: "accept", reasoning: "收到转账没有直接损失，先收下" };
}

export function fallbackCommunityName(agent: AgentConfig, seed: number): string {
  const names: Record<string, string[]> = {
    罗盘精算师: ["复利之城", "稳健公社", "精算绿洲"],
    时荫植者: ["长青林", "百年树屋", "时荫谷"],
    涌机触发者: ["涌动机场", "风口镇", "浪潮公社"],
    瞬刻炼金士: ["瞬刻集市", "炼金街", "当燃社区"],
    桥梁架构师: ["同心桥", "联结城", "共生社区"],
    随机诗人: ["光阴诗社", "随机花园", "流动之城"],
  };
  const pool = names[agent.persona] ?? ["光阴社区", "对赌之城", "新新社区"];
  return pool[Math.abs(seed) % pool.length];
}

export { fallbackInvestment };
