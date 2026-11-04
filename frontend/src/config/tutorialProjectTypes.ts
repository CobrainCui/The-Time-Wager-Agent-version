import {
  type CatalogProjectType,
  ERA_BONUS_LONG,
  ERA_BONUS_SHORT,
} from "./projectCatalog";
import {
  TUTORIAL_REF_DEMO_PROJECT_CARD_DETAIL,
  TUTORIAL_REF_PREVIEW_TABLE_BURST,
  TUTORIAL_REF_PREVIEW_TABLE_RANK,
  TUTORIAL_REF_PREVIEW_TABLE_RETURN,
  TUTORIAL_REF_TIED_RANK_LATER,
  TUTORIAL_SLIDE_TITLE_TIED_RANK,
} from "./playerHelpReference";

export const TUTORIAL_ENERGY_INTRO_LINE =
  "⚡ 精力：用来投资。每轮重置；同一时代两轮相同，越往后越少。";

export const TUTORIAL_ENERGY_SCHEDULE_ROWS: { label: string; energy: number }[] = [
  { label: "青年", energy: 15 },
  { label: "壮年", energy: 13 },
  { label: "中年", energy: 11 },
  { label: "老年", energy: 9 },
];

/** 主持稿用，与精力小表同源 */
export const TUTORIAL_ENERGY_SCHEDULE_HOST_LINE = TUTORIAL_ENERGY_SCHEDULE_ROWS
  .map((row) => `${row.label} ${row.energy}`)
  .join("/");

export type TutorialProjectRuleColumnKey = "settlement" | "base" | "rank" | "era";

export interface TutorialRuleCellCopy {
  brief: string;
  detail: string;
}

export const TUTORIAL_PROJECT_RULE_COLUMNS: { key: TutorialProjectRuleColumnKey; label: string }[] = [
  { key: "settlement", label: "结算时机" },
  { key: "base", label: "基础回报" },
  { key: "rank", label: "排名奖惩" },
  { key: "era", label: "时代加成" },
];

export const TUTORIAL_PROJECT_TYPE_LABEL: Record<CatalogProjectType, string> = {
  short: "短期",
  long: "长期",
  risk: "风险",
};

/** 规则区首行：速览 + 试玩区 */
export const TUTORIAL_PROJECT_TYPES_INTRO_LEAD =
  "点「展开说明」看完整规则。数值与牌面在下方试玩区。";

/** 侧栏玩法指南「项目结算规则」表前说明（与教程表同源，无试玩跳转） */
export const SIDEBAR_PROJECT_TYPES_RULE_LEAD =
  "点「展开说明」看完整规则。数值与对局「项目」表一致。";

export interface TutorialProjectBoardReminderRow {
  topic: string;
  detail: string;
}

export const TUTORIAL_PROJECT_BOARD_REMINDER_ROWS: TutorialProjectBoardReminderRow[] = [
  { topic: "未完成", detail: "跨时代还在牌上" },
  { topic: "撤场", detail: "累计仍为 0，且连续 2 轮无人投（投过的不因空轮撤）" },
  { topic: "离场", detail: "完成、投爆、长期填满：当轮离场" },
  { topic: "换代", detail: "上一时代的风险项目移除" },
  {
    topic: "新项目",
    detail:
      "每时代第 1 轮发一次。第 1 时代 6 个（短期 3、长期 2、风险 1），第 2 至第 4 时代各 4 个（短期 2、长期 1、风险 1）",
  },
  { topic: "查阅", detail: "下方试玩区侧栏「项目」；点项目卡开详情" },
];

const TUTORIAL_ERA_TIE_REF = `历史第 1（并列时如何结算见后文「${TUTORIAL_SLIDE_TITLE_TIED_RANK}」）`;

export const TUTORIAL_PROJECT_RULE_MATRIX: Record<
  CatalogProjectType,
  Record<TutorialProjectRuleColumnKey, TutorialRuleCellCopy>
> = {
  short: {
    settlement: {
      brief: "当轮",
      detail: "阶段结束按本轮投入结算（含排名/超上限罚）；恰好满额或投爆当轮离场。",
    },
    base: {
      brief: "×10/⚡",
      detail: "本轮投入 ×10 财富/⚡，仅本轮投入者。",
    },
    rank: {
      brief: "有奖/罚",
      detail: `按累计投入排名发奖；超上限按名次投爆罚（${TUTORIAL_REF_PREVIEW_TABLE_BURST}）。${TUTORIAL_REF_TIED_RANK_LATER}`,
    },
    era: {
      brief: `满额 +${ERA_BONUS_SHORT}`,
      detail: `契合主题且${TUTORIAL_ERA_TIE_REF}：恰好满额 +${ERA_BONUS_SHORT}；投爆无。`,
    },
  },
  long: {
    settlement: {
      brief: "完成后 / 终局梯度",
      detail:
        "满/超上限一次性结完成回报与排名奖（无短期投爆罚）；未满每轮只更进度。游戏结束（第四时代第二轮）未完成：按全场进度梯度付你的累计——<1/3→1:1，≥1/3→1:5，≥2/3→1:10。",
    },
    base: {
      brief: "×15/⚡",
      detail:
        "完成时个人累计 ×15/⚡（满/超均可）。参投后每轮≥3⚡，否则 1:1 结算累计并退出完成排名与时代加成。",
    },
    rank: {
      brief: "完成时发奖",
      detail: `完成时按累计排名发奖（${TUTORIAL_REF_PREVIEW_TABLE_RANK}）；无投爆罚。${TUTORIAL_REF_TIED_RANK_LATER}`,
    },
    era: {
      brief: `满/超 +${ERA_BONUS_LONG}`,
      detail: `契合主题且${TUTORIAL_ERA_TIE_REF}：满/超上限 +${ERA_BONUS_LONG}。`,
    },
  },
  risk: {
    settlement: {
      brief: "当轮",
      detail: "阶段结束按本轮投入结算；超上限当轮投爆离场，追回历史风险收益。",
    },
    base: {
      brief: "×20 或 ×25",
      detail: `本轮 ×20 或 ×25 财富/⚡，仅本轮投入者。${TUTORIAL_REF_PREVIEW_TABLE_RETURN}；牌面细则：${TUTORIAL_REF_DEMO_PROJECT_CARD_DETAIL}。`,
    },
    rank: {
      brief: "无",
      detail: "无排名奖；超上限投爆追回历史收益（财富可扣负）。",
    },
    era: {
      brief: "无",
      detail: "不参与时代加成。",
    },
  },
};

