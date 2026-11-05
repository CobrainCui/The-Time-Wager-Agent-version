import { AUCTION_CARDS_BY_ROUND, BUFF_CARD_DEFS, LIGHTER_CARD_BULLETS } from "./buffCards";
import { COFFEE_ENERGY_GAIN, COFFEE_WEALTH_COST } from "./coffeeConfig";
import { STARTING_WEALTH } from "./startingWealth";
import type { CatalogProjectType } from "./projectCatalog";

export type HelpTabId =
  | "projects_table"
  | "buffs"
  | "resources"
  | "projects_rules"
  | "flow"
  | "misc";

export interface HelpTabDef {
  id: HelpTabId;
  icon: string;
  title: string;
}

export interface HelpLineDef {
  icon?: string;
  text: string;
  gavelIcon?: boolean;
  projectType?: CatalogProjectType;
}

/** 玩家聊天说明（教程、侧栏指南、试玩 Demo 共用） */
export const HELP_TAB_CHAT_TITLE = "私信、转账与群聊";

export const HELP_CHAT_DOCK_INTRO =
  "等待房、时代介绍与规则教程阶段不显示聊天坞。对局开始后，屏幕右侧为聊天坞：最前为「全场」频道与已加入的自建群，其后每位玩家各有一个一对一折叠会话。";

export const HELP_DM_LINE = "私信：不填金额留言";

export const HELP_TRANSFER_LINE =
  "转账：填金额发送，对方收/退；金额不得超过可用财富（总额减去领先出价占用与未完成转出）";

export const HELP_GROUP_LINE =
  "群聊：进房后自动加入「全场」频道，所有真人可见；可自建小群（至少 3 名真人），群内只可文字、不可转账，仅限群成员可见。";

export const HELP_CHAT_PEER_ONLY_NOTE =
  "私信与转账只发给单个玩家；群聊文字仅该群成员可见。";

export const HELP_CHAT_AUCTION_LINE =
  "拍卖期间仍可私信、转账与群聊；暂时领先的出价会占用可用财富";

/** 准备清单等场景的群聊一句摘要 */
export const HELP_GROUP_LINE_SHORT =
  "进房自动加入「全场」；可自建至少 3 名真人的小群，群内仅文字、不可转账";

/** 分栏顺序（与产品一致） */
export const HELP_TABS: HelpTabDef[] = [
  { id: "projects_table", icon: "📊", title: "项目数据" },
  { id: "buffs", icon: "🃏", title: "道具卡" },
  { id: "resources", icon: "💎", title: "资源与胜负" },
  { id: "projects_rules", icon: "📋", title: "项目结算规则" },
  { id: "flow", icon: "🔄", title: "阶段流程" },
  { id: "misc", icon: "🤝", title: HELP_TAB_CHAT_TITLE },
];

export type PlayerSidebarPanelId = "projects" | "buffs" | "guide" | "history";

export interface SidebarActivityItem {
  id: PlayerSidebarPanelId;
  icon: string;
  label: string;
  title: string;
}

/** 左侧活动栏入口（与战报并列） */
export const SIDEBAR_ACTIVITY_ITEMS: SidebarActivityItem[] = [
  { id: "projects", icon: "📊", label: "项目", title: "项目总览" },
  { id: "buffs", icon: "🃏", label: "道具", title: "道具卡" },
  { id: "guide", icon: "📖", label: "指南", title: "玩法指南" },
  { id: "history", icon: "📜", label: "战报", title: "个人战报" },
];

const SIDEBAR_PROJECTS = SIDEBAR_ACTIVITY_ITEMS.find((i) => i.id === "projects")!;

/** 玩家侧栏「项目」入口与面板标题（与 PlayerGameHelp 一致） */
export const HELP_SIDEBAR_PROJECTS_LABEL = SIDEBAR_PROJECTS.label;
export const HELP_SIDEBAR_PROJECTS_TITLE = SIDEBAR_PROJECTS.title;

/** 对局内查看投爆罚 / 回报档位（侧栏「项目总览」表列） */
export const HELP_SIDEBAR_PROJECT_BURST_COLUMN =
  `玩家侧栏「${HELP_SIDEBAR_PROJECTS_LABEL}」（${HELP_SIDEBAR_PROJECTS_TITLE}）表「投爆罚」列`;
export const HELP_SIDEBAR_PROJECT_RETURN_COLUMN =
  `玩家侧栏「${HELP_SIDEBAR_PROJECTS_LABEL}」（${HELP_SIDEBAR_PROJECTS_TITLE}）表「回报」列`;

/** 教程「投资项目类型」页：动手试玩区（含左侧玩家侧栏）锚点 */
export const TUTORIAL_PROJECT_TYPES_PLAY_ID = "tutorial-project-types-play";

/** 教程幻灯标题（与 tutorialData 并列页一致，供跨页引用） */
export const TUTORIAL_SLIDE_TITLE_TIED_RANK = "并列排名与共享结算";

export const TUTORIAL_REF_TIED_RANK_LATER = `并列结算见后文「${TUTORIAL_SLIDE_TITLE_TIED_RANK}」`;

function tutorialPlaySidebarColumnRef(columnLabel: string): string {
  return `见下方试玩区侧栏「${HELP_SIDEBAR_PROJECTS_LABEL}」→「可投项目」表「${columnLabel}」列`;
}

/** 规则表展开说明中指向试玩区侧栏项目表 */
export const TUTORIAL_REF_PROJECT_DATA_PREVIEW = `见下方试玩区侧栏「${HELP_SIDEBAR_PROJECTS_LABEL}」`;
export const TUTORIAL_REF_PREVIEW_TABLE_BURST = tutorialPlaySidebarColumnRef("投爆罚");
export const TUTORIAL_REF_PREVIEW_TABLE_RETURN = tutorialPlaySidebarColumnRef("回报");
export const TUTORIAL_REF_PREVIEW_TABLE_RANK = tutorialPlaySidebarColumnRef("排名奖");

export const TUTORIAL_REF_DEMO_PROJECT_CARD_DETAIL = "见下方试玩区项目卡（点卡打开详情）";

/** 动手试一试副标题：与对局布局一致 */
export const TUTORIAL_PROJECT_TYPES_PLAY_HINT =
  `布局与正式对局相同：左侧点「${HELP_SIDEBAR_PROJECTS_LABEL}」查表，右侧试投项目卡。试玩不上传、不影响本局。`;

/** 玩法指南面板内合并的四块内容 */
export const GUIDE_MERGED_TAB_IDS: HelpTabId[] = [
  "resources",
  "projects_rules",
  "flow",
  "misc",
];

/** 道具卡：单次使用与发动时机（与 BuffUsage / server 阶段一致） */
export const HELP_BUFF_ONCE_RULE = "每张道具卡只能使用一次";

/** 与 server actionDeadline.BUFF_LOCKOUT_REMAINING_MS 一致 */
export const BUFF_LOCKOUT_REMAINING_MS = 2 * 60 * 1000;

export const HELP_INVESTMENT_SELF_UNLOCK =
  "锁定后可自行解锁并修改，直到倒计时结束；倒计时结束后不可再解锁";
export const HELP_INVESTMENT_ADVANCE_WHEN_ALL_LOCKED =
  "当前在线玩家全部锁定后进入下一阶段（离线玩家不挡进度）";
export const HELP_BUFF_LOCKOUT =
  "倒计时最后 2 分钟不能使用道具卡（投资仍可改、可锁定）";

export const HELP_BUFF_TIMING_SHORT =
  "获得道具卡后，在投资阶段、提交锁定前可发动";

export const HELP_BUFF_SETTLEMENT_BULLETS = [
  "项目做空：投资阶段（提交锁定前）声明，**结算页判定**（进入结算时与其他道具一并执行）",
  "做空：**全员**在该项目**已积累精力全部清零**（含长期进度与本卡生效轮次内已投入的精力，**含使用者自己**）；**已入账财富不追回**",
  "打火机：",
  ...LIGHTER_CARD_BULLETS,
];


export const HELP_BUFF_USE_TIMING_BULLETS = [HELP_BUFF_TIMING_SHORT, HELP_BUFF_LOCKOUT];


/** 侧栏「道具」面板顶部规则（分组展示） */
export const HELP_BUFF_GUIDE_SECTIONS: { title: string; bullets: string[] }[] = [
  {
    title: "发动时机",
    bullets: [HELP_BUFF_ONCE_RULE, HELP_BUFF_TIMING_SHORT, HELP_BUFF_LOCKOUT],
  },
  {
    title: "打火机与项目做空",
    bullets: HELP_BUFF_SETTLEMENT_BULLETS,
  },
];


/** 拍卖会末尾：投资锁定与聊天（教程拍卖会幻灯与侧栏流程共用） */
export const GUIDE_AUCTION_TAIL_BULLETS = [
  HELP_INVESTMENT_SELF_UNLOCK,
  HELP_INVESTMENT_ADVANCE_WHEN_ALL_LOCKED,
  HELP_CHAT_AUCTION_LINE,
];

/** 侧栏道具卡要点（完整规则见 BUFF_CARD_DEFS.desc） */
export const BUFF_SIDEBAR_BRIEF: Record<string, string[]> = {
  buff_slack: [
    "指定一名玩家（含自己）",
    "对方精力 **−8（可低于 0）**",
    "有劳逸结合被动则改为 **+8 精力**",
    "摸鱼使精力为负时，已锁定的投资会自动解锁",
  ],
  buff_insurance: [
    "本卡生效轮次内参与的风险项目投爆",
    "**赔付 100** 财富",
    "点石成金对赔付 **×1.5 向下取整**",
  ],
  buff_gold: [
    "**正向收益 ×1.5 向下取整**",
    "含基础、排名、时代、彩票、保险赔付",
    "**四时代未完长期梯度、退款、转账不放大**",
    "**惩罚不放大**",
  ],
  buff_force_buy: [
    "**仅拍卖阶段**",
    "**默认整局仅一张**（管理端补发除外）",
    "**免费**拿下当前正在拍的卡",
    "**每张只能用一次**",
  ],
  buff_short: [
    "投资阶段（提交锁定前）声明，**结算页判定**",
    "**全员**在该项目**已积累精力全部清零**（含长期进度与本卡生效轮次内已投入的精力，**含使用者自己**）",
    "**已入账财富不追回**",
  ],
  buff_work_rest: [
    "指定一名在局玩家",
    "本卡生效轮次内被摸鱼时**不减精力而 +8**",
    "发动时**追溯改判本卡生效轮次内已发生的摸鱼**",
    "打火机作废摸鱼时，对应改判同步撤销",
  ],
  buff_lighter: [...LIGHTER_CARD_BULLETS],
  buff_lottery: ["系统线上随机掷 1–6 点定奖金", "点数 1/2/3/4/5/6 → 0/30/60/90/120/200", "点石成金对奖金 **×1.5 向下取整**"],
};

export interface GuideResourceRow {
  label: string;
  brief: string;
}

export const GUIDE_RESOURCE_ROWS: GuideResourceRow[] = [
  { label: "财富", brief: `开局每人 ${STARTING_WEALTH}；终局最高者命名社区` },
  {
    label: "咖啡",
    brief: `投资阶段 ${COFFEE_WEALTH_COST} 财富换 ${COFFEE_ENERGY_GAIN} 精力；本轮未提交可退订`,
  },
  { label: "赛制", brief: "4 时代 × 每时代 2 轮；终局按财富决胜" },
];

export const TUTORIAL_RESOURCE_WEALTH_LINE = `💰 财富：开局每人 ${STARTING_WEALTH}；终局最高者胜，可为社区命名。`;

export const TUTORIAL_RESOURCE_COFFEE_LINE = `☕ 来杯咖啡：投资阶段可用 ${COFFEE_WEALTH_COST} 财富换 ${COFFEE_ENERGY_GAIN} 精力；本轮未提交前可退订返还。`;

export interface GuideInvestTimerRow {
  label: string;
  duration: string;
}

export const GUIDE_INVEST_TIMER_ROWS: GuideInvestTimerRow[] = [
  { label: "第 1 时代第 1 轮", duration: "12 分钟" },
  { label: "其余轮次", duration: "约 10 分钟" },
];

export interface GuideChatRow {
  feature: string;
  how: string;
  note: string;
}

export const TUTORIAL_TRANSFER_WEALTH_LIMIT_LINE =
  "金额不得超过可用财富：总额减去领先出价占用，以及对方尚未处理的转出。";

export const GUIDE_CHAT_ROWS: GuideChatRow[] = [
  { feature: "全场", how: "进房自动加入", note: "所有真人可见；禁聊阶段自动屏蔽" },
  { feature: "自建群", how: "至少 3 名真人", note: "仅群成员可见；群内只可文字、不可转账" },
  { feature: "转账", how: "右侧对话框填金额发送", note: "仅对方可见，可接收或退回" },
  { feature: "私信", how: "不填金额（或 0）并留言", note: "不扣财富，仅对方可见" },
  {
    feature: "财富上限",
    how: "—",
    note: "可用财富 = 总额 − 领先出价占用 − 对方未处理的转出",
  },
  { feature: "拍卖中", how: "仍可转账、私信与群聊", note: "暂时领先的出价占用可用财富" },
];

export const TUTORIAL_TRANSFER_BULLETS = [
  "🤝 转账：右侧每人一个对话框。填金额发送，仅对方可见，可接收或退回。",
  "💬 私信：不填金额（或填 0）并留言，即为仅对方可见的私信（不扣财富）。",
  "👥 群聊：进房自动加入「全场」；也可自建至少 3 名真人的小群，群内只可文字、不可转账。",
  "可用于结盟、议价、传递情报等；私信与转账只发给单个玩家。",
  TUTORIAL_TRANSFER_WEALTH_LIMIT_LINE,
];

export interface GuideFlowPhase {
  id: string;
  title: string;
  bullets: string[];
  gavelIcon?: boolean;
  showInvestTimer?: boolean;
}

export const GUIDE_FLOW_PHASES: GuideFlowPhase[] = [
  {
    id: "era",
    title: "时代介绍",
    bullets: ["共 4 时代，每时代 2 轮", "两个时代切换时进入拍卖会"],
    gavelIcon: true,
  },
  {
    id: "invest",
    title: "讨论、投资与道具",
    showInvestTimer: true,
    bullets: [
      "全员进入后开始倒计时（见下表）",
      "时限内分配精力并提交锁定",
      "锁定后可自行解锁并修改",
      "倒计时结束后不可再解锁",
      HELP_BUFF_ONCE_RULE,
      HELP_BUFF_TIMING_SHORT,
      HELP_BUFF_LOCKOUT,
      "打火机与做空：投资阶段声明，结算页执行",
      HELP_INVESTMENT_ADVANCE_WHEN_ALL_LOCKED,
      `来杯咖啡：${COFFEE_WEALTH_COST} 财富换 ${COFFEE_ENERGY_GAIN} 精力（未提交可退订）`,
    ],
  },
  {
    id: "settlement",
    title: "结算",
    bullets: [
      "按累计投入排名结算",
      "基础收益 + 排名奖/罚 + 时代奖励",
      "投入相同则并列，共享档位后均分（向零取整）",
    ],
  },
  {
    id: "auction",
    title: "拍卖道具卡",
    bullets: [
      "时代交替时进行",
      "同时只拍一张；主持先选定卡",
      "公开加价；主持确认成交后最高者付钱拿卡",
      "拍得卡存入手牌",
      HELP_BUFF_ONCE_RULE,
      HELP_BUFF_TIMING_SHORT,
      HELP_BUFF_LOCKOUT,
      ...GUIDE_AUCTION_TAIL_BULLETS,
    ],
    gavelIcon: true,
  },
];

export const TUTORIAL_AUCTION_BULLETS = [
  "时代交替时进入拍卖会。",
  "同时只拍一张。主持先选定；左侧是这张卡，右侧是起拍价、最高价和每一次加价。",
  "出价先占住。主持确认成交后，最高者付钱拿卡，然后换下一张。",
  HELP_BUFF_ONCE_RULE,
  HELP_BUFF_TIMING_SHORT,
  HELP_BUFF_LOCKOUT,
  ...GUIDE_AUCTION_TAIL_BULLETS,
];

export const HELP_FLOW_OVERVIEW = "时代介绍 → 讨论、投资与道具 → 结算 → 拍卖道具卡";

const auctionRounds = Object.keys(AUCTION_CARDS_BY_ROUND).length;

const buffAppearanceCount = new Map<string, number>();
for (const cards of Object.values(AUCTION_CARDS_BY_ROUND)) {
  for (const c of cards) {
    buffAppearanceCount.set(c.id, (buffAppearanceCount.get(c.id) ?? 0) + 1);
  }
}

/** 三场拍卖都出现的卡；从卡池自动推导，避免手写名单与拍卖池漂移 */
const EVERY_AUCTION_BUFF_IDS = new Set(
  [...buffAppearanceCount.entries()]
    .filter(([, count]) => count === auctionRounds)
    .map(([id]) => id)
);

const cardIdToAuctionRound: Record<string, number> = {};
for (const [round, cards] of Object.entries(AUCTION_CARDS_BY_ROUND)) {
  for (const c of cards) {
    if (!EVERY_AUCTION_BUFF_IDS.has(c.id)) {
      cardIdToAuctionRound[c.id] = Number(round);
    }
  }
}

export interface BuffHelpEntry {
  cardId: string;
  icon: string;
  name: string;
  desc: string;
  auctionRound: number;
  /** 三场拍卖各出现一次 */
  everyAuction?: boolean;
  color: string;
}

export function buildBuffHelpEntries(): BuffHelpEntry[] {
  const entries = Object.entries(BUFF_CARD_DEFS).map(([cardId, def]) => ({
    cardId,
    icon: def.icon,
    name: def.name,
    desc: def.desc,
    color: def.color,
    everyAuction: EVERY_AUCTION_BUFF_IDS.has(cardId),
    auctionRound: cardIdToAuctionRound[cardId] ?? 0,
  }));
  return sortBuffHelpEntries(entries);
}

/** 侧栏道具列表：每场拍卖出现的卡置顶，其余按拍卖场次升序 */
export function sortBuffHelpEntries(entries: BuffHelpEntry[]): BuffHelpEntry[] {
  return [...entries].sort((a, b) => {
    const aEvery = !!a.everyAuction;
    const bEvery = !!b.everyAuction;
    if (aEvery !== bEvery) return aEvery ? -1 : 1;
    if (aEvery) return a.name.localeCompare(b.name, "zh");
    return a.auctionRound - b.auctionRound || a.name.localeCompare(b.name, "zh");
  });
}
