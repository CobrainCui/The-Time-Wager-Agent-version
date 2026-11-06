export const LIGHTER_CARD_ID = "buff_lighter";

export function formatBuffBullets(bullets: readonly string[]): string {
  return bullets.map((b) => `· ${b}`).join("\n");
}

export const LIGHTER_CARD_BULLETS: readonly string[] = [
  "发动时机：投资阶段（提交锁定前）；倒计时最后 2 分钟不可用",
  "指定另一名玩家 + 一种道具；**不可指定自己或打火机**；使用时**立即消耗**打火机；你看不到对方手牌，也无法知道对方有没有这种卡",
  "使用后你只会看到「已使用」，**不会得知是否烧中**；只有被指定者会看到自己是否被烧",
  "**结算页判定**（不是使用时立刻烧）",
  "**先**作废本卡生效轮次内已打出的一张该种类；若没有，再查手牌烧一张；**同种类有多张时只处理一张**",
  "手牌命中：**私下提示**，对方**确认后**移除一张",
  "没烧中：被指定者会收到「未烧中」提示；**无效但仍消耗**；详情**仅当事人可见**",
];

/** 与 BUFF_CARD_DEFS、服务端 game_data 一致 */
export const LIGHTER_CARD_DESCRIPTION = formatBuffBullets(LIGHTER_CARD_BULLETS);

/** 与 BUFF_CARD_DEFS、服务端 game_data 一致 */
export const GOLD_CARD_DESCRIPTION =
  "所有由项目结算、彩票、保险产生的**正向收益**（基础收益、排名奖励、时代加成、第四时代未完成长期项目的进度奖、彩票奖金、保险赔付）都按 **1.5 倍结算并向下取整**；**放弃结算的返还与玩家间转账不放大**。**惩罚不放大**。";

/** 与 BUFF_CARD_DEFS、服务端 game_data 一致 */
export const WORK_REST_CARD_DESCRIPTION =
  "指定一名在局玩家（含他人）：该玩家在本卡生效轮次内被「摸鱼传染」时**不减精力，反而增加 8 点精力**；发动时**追溯改判本卡生效轮次内已经发生的摸鱼**（多个劳逸结合不叠加）。打火机作废某次摸鱼时，对应的改判也一并撤销；被撤销后劳逸结合不会退回手牌，仍作为本卡生效轮次内的被动保留。摸鱼传染、劳逸结合在每场拍卖各可出现一张。";

/** 与 BUFF_CARD_DEFS、服务端 game_data 一致 */
export const SHORT_CARD_DESCRIPTION =
  "投资阶段（提交锁定前）声明，**结算页判定**：指定一个本卡生效轮次内可投入的项目。**全员**在该项目**已积累的精力全部清零**（含长期进度与本卡生效轮次内已投入的精力，**含使用者自己**）；**已经入账的财富不追回**；本卡生效轮次内该项目不再发放回报。";

export const SLACK_CARD_DESCRIPTION =
  "指定一名在局玩家（含自己），使其精力 **减少 8 点（可以低于 0）**。若对方在本卡生效轮次内已有【劳逸结合】被动（含他人为其指定），改为 **增加 8 点精力**。摸鱼传染、劳逸结合在每场拍卖各可出现一张。";

export const INSURANCE_CARD_DESCRIPTION =
  "你**整局曾经投入过**的风险项目，若在本卡生效轮次内投资失败（爆掉），则**赔付 100 财富**（历史投入也算，即使本卡生效轮次内没有再投）。点石成金会把保险赔付作为正向收益按 **1.5 倍向下取整**。只保风险项目，短期与长期项目不赔。";

export const FORCE_BUY_CARD_DESCRIPTION =
  "**仅能在拍卖阶段**使用，**每张只能用一次**；**默认整局仅出现一张**（管理端补发除外）。**免费**获得当前正在拍卖的那张道具卡。";

export const LOTTERY_CARD_DESCRIPTION =
  "打出后由系统调用线上随机源掷 1 颗六面骰，点数决定奖金：掷出 1 点没有奖金；2 点 30 财富；3 点 60 财富；4 点 90 财富；5 点 120 财富；6 点 200 财富。若在本卡生效轮次内持有点石成金，奖金作为正向收益按 **1.5 倍向下取整**。";

/** L3 情境提示（确认框等），禁止整段复制 L1 desc */
export const BUFF_UI_SNIPPETS = {
  lighterUseConfirm: (targetName: string, cardName: string) =>
    `对【${targetName}】指定烧毁【${cardName}】？\n你看不到对方手牌，也不会知道是否烧中。\n结算页判定：**先作废已打出的一张；没有再烧手牌一张**；同种类多张也只处理一张；没烧中则**无效仍消耗**，被指定者会收到未烧中提示。`,
  workRestUseConfirm: (targetName: string) =>
    `为【${targetName}】发动劳逸结合？\n在本卡生效轮次内被摸鱼传染时**不减精力，反而增加 8 点精力**。`,
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
