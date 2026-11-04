export const LIGHTER_CARD_ID = "buff_lighter";

/** L1 正文、game_data.description 用完整表述 */
export const BUFF_COPY_ROUND = "使用本卡的轮次";
/** 更早轮次不可作废打出记录；手牌中同种类仍可烧 */
export const BUFF_COPY_PRIOR_ROUND = "使用本卡之前的轮次";
/** L2 要点、L3 极短 UI（与 BUFF_COPY_ROUND 同义，见 HELP_BUFF_ROUND_GLOSSARY） */
export const BUFF_COPY_ROUND_SHORT = "本卡生效轮次";

export function formatBuffBullets(bullets: readonly string[]): string {
  return bullets.map((b) => `· ${b}`).join("\n");
}

export const LIGHTER_CARD_BULLETS: readonly string[] = [
  "发动时机：道具阶段或投资阶段（提交锁定前）；倒计时最后 2 分钟不可用",
  "指定另一名玩家 + 一种道具；**不可指定自己或打火机**；使用时**立即消耗**打火机；你看不到对方手牌",
  "全员日志公开「对谁、指定何种卡」；**是否命中不写在日志里**",
  "**结算页、项目结算前**统一判定（非使用时立刻烧）",
  "**先**作废本卡生效轮次内已打出的该种类 → **再**查手牌",
  "手牌命中：**私下提示**，对方**确认后**移除一张",
  "皆无则**无效仍消耗**；详情**仅当事人可见**",
];

/** 与 BUFF_CARD_DEFS、服务端 game_data 一致 */
export const LIGHTER_CARD_DESCRIPTION = formatBuffBullets(LIGHTER_CARD_BULLETS);

/** 与 BUFF_CARD_DEFS、服务端 game_data 一致 */
export const GOLD_CARD_DESCRIPTION =
  "所有的正向收益（包括基础收益、排名奖励、时代加成、彩票、保险赔付）按 **1.5 倍向下取整**。**惩罚不放大**。";

/** 与 BUFF_CARD_DEFS、服务端 game_data 一致 */
export const WORK_REST_CARD_DESCRIPTION =
  "指定一名在局玩家（含他人）：该玩家在本卡生效轮次内被「摸鱼传染」时**不减精力而 +8 精力**（劳逸结合被动不叠层）。摸鱼传染、劳逸结合在每场拍卖各可出现一张。";

/** 与 BUFF_CARD_DEFS、服务端 game_data 一致 */
export const SHORT_CARD_DESCRIPTION =
  "道具阶段或投资阶段（提交锁定前）声明，**结算页判定**：指定一个本卡生效轮次内可投入的项目。**全员**在该项目**已积累精力全部清零**（含长期进度与本卡生效轮次内本轮投入，**含使用者自己**）；**已入账财富不追回**；本卡生效轮次内该项目不再发放回报。";

export const SLACK_CARD_DESCRIPTION =
  "指定一名在局玩家（含自己），使其精力 **−8（可低于 0）**。若对方在本卡生效轮次内已有【劳逸结合】被动（含他人为其指定），改为 **+8 精力**。摸鱼传染、劳逸结合在每场拍卖各可出现一张。";

export const INSURANCE_CARD_DESCRIPTION =
  "在本卡生效轮次内，你参与的风险项目若投爆则**赔付 100**。点石成金会把保险赔付作为正向收益按 **1.5 倍向下取整**。";

export const FORCE_BUY_CARD_DESCRIPTION =
  "**仅能在拍卖阶段**使用。**每张强买强卖只能用一次**，**免费**将当前正在拍卖的道具卡入手。";

export const LOTTERY_CARD_DESCRIPTION =
  "玩家通过实体骰子决定奖金，由主持人输入金额。若在本卡生效轮次内持有点石成金，奖金作为正向收益按 **1.5 倍向下取整**。";

/** L3 情境提示（确认框等），禁止整段复制 L1 desc */
export const BUFF_UI_SNIPPETS = {
  lighterUseConfirm: (targetName: string, cardName: string) =>
    `对【${targetName}】指定烧毁【${cardName}】？\n你看不到对方手牌。\n结算页判定：**先作废已打出，再烧手牌**；皆无则**无效仍消耗**。`,
  workRestUseConfirm: (targetName: string) =>
    `为【${targetName}】发动劳逸结合？\n在本卡生效轮次内被摸鱼传染时**不减精力，+8 精力**。`,
  buffHelpLinkLabel: "在指南中查看全部道具",
  goldSettlementFootnote: () => `道具「点石成金」：${stripGoldFootnote(GOLD_CARD_DESCRIPTION)}`,
} as const;

function stripGoldFootnote(s: string): string {
  return s.replace(/\*\*([^*]+)\*\*/g, "$1");
}

export type BuffCardDef = { name: string; desc: string; icon: string; color: string };

export const BUFF_CARD_DEFS: Record<string, BuffCardDef> = {
  buff_slack: {
    name: "摸鱼传染",
    desc: SLACK_CARD_DESCRIPTION,
    icon: "😴",
    color: "#ef4444",
  },
  buff_insurance: {
    name: "保险",
    desc: INSURANCE_CARD_DESCRIPTION,
    icon: "🛡️",
    color: "#6366f1",
  },
  buff_gold: {
    name: "点石成金",
    desc: GOLD_CARD_DESCRIPTION,
    icon: "💰",
    color: "#f59e0b",
  },
  buff_force_buy: {
    name: "强买强卖",
    desc: FORCE_BUY_CARD_DESCRIPTION,
    icon: "🤝",
    color: "#a855f7",
  },
  buff_short: {
    name: "项目做空",
    desc: SHORT_CARD_DESCRIPTION,
    icon: "📉",
    color: "#3b82f6",
  },
  buff_work_rest: {
    name: "劳逸结合",
    desc: WORK_REST_CARD_DESCRIPTION,
    icon: "⚖️",
    color: "#10b981",
  },
  buff_lighter: {
    name: "打火机",
    desc: LIGHTER_CARD_DESCRIPTION,
    icon: "🔥",
    color: "#f97316",
  },
  buff_lottery: {
    name: "彩票",
    desc: LOTTERY_CARD_DESCRIPTION,
    icon: "🎲",
    color: "#ec4899",
  },
};

/** 拍卖参考价（仅 UI 示意，不含规则正文） */
export const BUFF_AUCTION_REFERENCE_PRICE: Record<string, number> = {
  buff_slack: 70,
  buff_insurance: 90,
  buff_gold: 80,
  buff_force_buy: 75,
  buff_short: 60,
  buff_work_rest: 65,
  buff_lighter: 55,
  buff_lottery: 50,
};

export function getBuffDef(cardId: string): BuffCardDef & { price?: number } {
  const base = BUFF_CARD_DEFS[cardId] ?? {
    name: cardId,
    desc: "",
    icon: "❓",
    color: "#6b7280",
  };
  const price = BUFF_AUCTION_REFERENCE_PRICE[cardId];
  return price != null ? { ...base, price } : base;
}

/** 打火机可指定的卡种（全道具池除打火机本身） */
export const LIGHTER_BURN_TARGET_OPTIONS = Object.entries(BUFF_CARD_DEFS)
  .filter(([id]) => id !== LIGHTER_CARD_ID)
  .map(([id, def]) => ({ id, label: def.name }))
  .sort((a, b) => a.label.localeCompare(b.label, "zh"));

export const AUCTION_CARDS_BY_ROUND: Record<number, { id: string; name: string }[]> = {
  1: [
    { id: "buff_insurance", name: "保险" },
    { id: "buff_gold", name: "点石成金" },
    { id: "buff_slack", name: "摸鱼传染" },
    { id: "buff_work_rest", name: "劳逸结合" },
  ],
  2: [
    { id: "buff_force_buy", name: "强买强卖" },
    { id: "buff_slack", name: "摸鱼传染" },
    { id: "buff_work_rest", name: "劳逸结合" },
    { id: "buff_short", name: "项目做空" },
  ],
  3: [
    { id: "buff_lighter", name: "打火机" },
    { id: "buff_lottery", name: "彩票" },
    { id: "buff_slack", name: "摸鱼传染" },
    { id: "buff_work_rest", name: "劳逸结合" },
  ],
};

export function getAuctionRound(currentEra: number): number {
  return Math.max(1, Math.min(currentEra - 1, 3));
}

export function getAuctionCardsForEra(currentEra: number) {
  const round = getAuctionRound(currentEra);
  return AUCTION_CARDS_BY_ROUND[round] || AUCTION_CARDS_BY_ROUND[1];
}

export type AuctionCompletedDealView = {
  cardId: string;
  playerId: string;
  cost: number;
  auctionRound?: number;
  source?: "hammer" | "force_buy";
};

/** 当前拍卖场次下的成交记录（同牌跨场不混淆） */
export function findAuctionDealForSession(
  deals: AuctionCompletedDealView[] | undefined,
  cardId: string,
  currentEra: number,
  distributedIds: readonly string[]
): AuctionCompletedDealView | undefined {
  const round = getAuctionRound(currentEra);
  const list = deals ?? [];
  const forRound = list.find((d) => d.cardId === cardId && d.auctionRound === round);
  if (forRound) return forRound;
  if (distributedIds.includes(cardId)) {
    return list.find((d) => d.cardId === cardId && d.auctionRound == null);
  }
  return undefined;
}
