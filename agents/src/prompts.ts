import fs from "node:fs";
import path from "node:path";
import { repoRoot } from "./env.js";
import type { AgentConfig } from "./config.js";
import type { Observation, TransactionView } from "./types.js";

const instructionDir = path.join(repoRoot, "server", "gameInstruction");

function readRuleFile(name: string): string {
  try {
    return fs.readFileSync(path.join(instructionDir, name), "utf8");
  } catch {
    return "";
  }
}

let cachedRules: string | null = null;

export function getRulesKnowledge(): string {
  if (cachedRules != null) return cachedRules;
  const files = ["game_skills.md", "data_projects.md", "data_buff_cards.md", "data_numeric_config.md"];
  const parts = files
    .map((f) => readRuleFile(f).trim())
    .filter(Boolean)
    .map((text, i) => `### 规则文件 ${i + 1}: ${files[i]}\n${text}`);
  cachedRules = parts.join("\n\n");
  return cachedRules;
}

export function buildSystemPrompt(agent: AgentConfig): string {
  return [
    "你是《光阴对赌（The Time Wager）》中的一名 Agent 玩家。",
    "你与其他 5 名 Agent 同桌竞技，所有人都通过同一个游戏引擎行动。目标：在四个时代、八轮投资结束时拥有尽可能高的财富，并影响社区命名。",
    "",
    "## 你的人格与策略",
    `名称：${agent.name}`,
    `人格：${agent.persona}`,
    `${agent.style}`,
    "",
    "## 行为准则",
    "- 只依据下面给出的规则和当前观察做决策，不编造不存在的项目 ID、玩家 ID 或卡牌 ID。",
    "- 每个阶段都要推进游戏：该准备就准备，该投资就提交，避免让全场卡住。",
    "- 你可以谈判、转账、使用道具卡；但所有承诺都只是语言，没有强制约束。",
    "- 道具卡与拍卖会消耗财富/手牌，注意 ROI。",
    "- 你的输出必须是单个 JSON 对象，不要输出 Markdown、解释段落或代码块围栏。",
    "",
    "## 规则知识库",
    getRulesKnowledge(),
  ].join("\n");
}

export function buildInvestmentPrompt(obs: Observation, agent: AgentConfig): string {
  const projectLines = obs.projects
    .map(
      (p) =>
        `- ID ${p.id} | ${p.name} | ${p.type} | 上限 ${p.maxEnergy} | 本轮已投 ${p.currentInvested} | 累计 ${p.accumulatedInvested}` +
        (p.rankRewards ? ` | 排名奖 ${p.rankRewards.join("/")}` : "") +
        (p.rate ? ` | 倍率 ${p.rate}` : "") +
        (p.era ? ` | 时代 ${p.era}` : "") +
        (p.overInvestPenalty ? ` | 投爆惩罚 ${p.overInvestPenalty.join("/")}` : "")
    )
    .join("\n");

  const richPlayers = obs.players
    .map(
      (p) =>
        `- ${p.name}${p.isMe ? "（你）" : ""} | 财富 ${p.wealth} | 排名 ${p.rank}` +
        (p.energy == null ? "" : ` | 精力 ${p.energy}`) +
        (p.isAgent ? ` | Agent(${p.agentPersona ?? ""})` : "")
    )
    .join("\n");

  const pendingTx = obs.myPendingTransactions.length
    ? obs.myPendingTransactions
        .map((t) => `- ${t.fromName} → 你：${t.amount}，备注「${t.note}」（txId=${t.id}）`)
        .join("\n")
    : "无";

  return [
    `阶段：投资与道具（第 ${obs.globalRound} 全局轮 / 时代 ${obs.era} / 本代第 ${obs.roundInEra} 轮）`,
    `时代卡：${obs.eraCard?.name ?? "未知"}（主题 ${obs.eraCard?.era ?? "?"}）`,
    "",
    "## 你当前的状态",
    `名称：${obs.me.name}`,
    `精力：${obs.me.energy}`,
    `财富：${obs.me.wealth}`,
    `排名：${obs.me.rank}`,
    `手牌：${obs.me.inventory.length ? obs.me.inventory.join(", ") : "无"}`,
    `本轮已买咖啡：${obs.me.coffeePurchases} 杯（每杯 -17 财富 +1 精力）`,
    "",
    "## 当前项目",
    projectLines || "（暂无项目）",
    "",
    "## 其他玩家（公开信息）",
    richPlayers,
    "",
    "## 待你处理的转账",
    pendingTx,
    "",
    "## 本轮决策要求",
    "输出一个 JSON 对象，字段如下（不需要的字段可省略）：",
    `{
  "reasoning": "一到两句话说明你的判断",
  "coffee": 0,
  "useCard": { "cardId": "buff_xxx", "targetPlayerId": "玩家ID", "targetProjectId": 123, "burnCardId": "buff_xxx" } | null,
  "transfer": { "toPlayerId": "玩家ID", "amount": 10, "note": "备注" } | null,
  "investment": { "<项目ID>": 精力数 },
  "ready": true
}`,
    "",
    "约束：",
    `- 投资总和不能超过你的精力（若先买咖啡，最多可再加 coffee 点）。`,
    `- 只能使用你手牌里的卡；卡牌目标必须是当前在局玩家/项目。`,
    `- 打火机需要 burnCardId；项目做空需要 targetProjectId；摸鱼传染需要 targetPlayerId。`,
    `- 如果本阶段你不想做任何操作，也要输出 {"investment": {}, "ready": true} 以推进游戏。`,
    "",
    "## 当前观察数据（JSON）",
    JSON.stringify(obs, null, 2),
  ].join("\n");
}

export function buildAuctionPrompt(
  obs: Observation,
  agent: AgentConfig,
  cardId: string,
  maxBid: number
): string {
  const history = (obs.auction?.bidHistory ?? [])
    .slice(-8)
    .map((b) => `${b.playerName}: ${b.amount}`)
    .join(" → ");

  return [
    `阶段：拍卖会（第 ${obs.globalRound} 全局轮 / 时代 ${obs.era}）`,
    `正在拍卖：${cardId}`,
    `当前最高价：${obs.auction?.currentBid ?? 0}`,
    `最低下一口：${obs.auction?.minimumNextBid ?? 5}`,
    `最高出价者：${obs.auction?.highBidderName ?? "无"}`,
    `你的财富：${obs.me.wealth}（本轮可用上限 ${maxBid}）`,
    `你的手牌：${obs.me.inventory.length ? obs.me.inventory.join(", ") : "无"}`,
    `最近出价：${history || "无"}`,
    "",
    "你可以：出价（bid，金额必须是整数且 >= 最低下一口且 <= 你的可用上限）、放弃这张（pass），或使用【强买强卖】免费拿走当前焦点卡（force_buy，仅当你手牌里有 buff_force_buy）。",
    "",
    "输出 JSON：",
    `{"reasoning":"...","action":"bid","amount":15}`,
    `{"reasoning":"...","action":"pass"}`,
    `{"reasoning":"...","action":"force_buy"}`,
  ].join("\n");
}

export function buildTransactionPrompt(
  obs: Observation,
  tx: TransactionView,
  agent: AgentConfig
): string {
  return [
    `玩家 ${tx.fromName} 向你发起转账：${tx.amount} 财富，备注「${tx.note || "无"}」。`,
    `你当前财富 ${obs.me.wealth}，阶段 ${obs.phase}。`,
    `你的人格：${agent.persona}。${agent.style}`,
    "接受会立即获得这笔财富（对方已预占）；拒绝则原路退回。",
    '输出 JSON：{"reasoning":"...","decision":"accept"} 或 {"reasoning":"...","decision":"reject"}',
  ].join("\n");
}

export function buildCommunityNamePrompt(obs: Observation, agent: AgentConfig): string {
  return [
    `最终阶段：你是当前在线首富（财富 ${obs.me.wealth}），需要为这个社区命名。`,
    `你的人格：${agent.persona}。${agent.style}`,
    "输出 JSON：{\"reasoning\":\"...\",\"name\":\"社区名称\"}（2–10 个汉字，避免符号）。",
  ].join("\n");
}
