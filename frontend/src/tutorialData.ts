import type { TutorialDemoKey } from "./tutorial/demoKeys";
import { COFFEE_ENERGY_GAIN, COFFEE_WEALTH_COST } from "./config/coffeeConfig";
import { STARTING_WEALTH } from "./config/startingWealth";
import { ERA_BONUS_LONG, ERA_BONUS_SHORT } from "./config/projectCatalog";
import {
  TUTORIAL_ENERGY_INTRO_LINE,
  TUTORIAL_ENERGY_SCHEDULE_HOST_LINE,
} from "./config/tutorialProjectTypes";
import {
  TUTORIAL_AUCTION_BULLETS,
  TUTORIAL_RESOURCE_COFFEE_LINE,
  TUTORIAL_RESOURCE_WEALTH_LINE,
  TUTORIAL_SLIDE_TITLE_TIED_RANK,
  TUTORIAL_TRANSFER_BULLETS,
} from "./config/playerHelpReference";

export { TUTORIAL_SLIDE_TITLE_TIED_RANK };

export interface TutorialSlide {
    title: string;
    content: string[];
    hostNotes: string;
    icon: string;
    demoKey?: TutorialDemoKey;
    /** 大号排版：与欢迎页同档字号，容器更宽（欢迎页、核心资源页等） */
    intro?: boolean;
    /** 收束页：更大字号与留白（如「准备出发」） */
    finale?: boolean;
    /** 标题区用开源法槌图标，不用 emoji icon */
    gavelIcon?: boolean;
}

export const TUTORIAL_SLIDES: TutorialSlide[] = [
    {
        title: "欢迎来到《光阴对赌》",
        icon: "⚖️",
        intro: true,
        content: [
            "这是一款关于时间、选择与人生博弈的游戏。",
            "在接下来的旅程中，你们将度过青年、壮年、中年、老年四个阶段。",
            "每一个决定，都将塑造独一无二的人生轨迹。"
        ],
        hostNotes: "欢迎大家。现在我们开始讲解规则。",
    },
    {
        title: "认识你的核心资源",
        icon: "💎",
        content: [TUTORIAL_ENERGY_INTRO_LINE, TUTORIAL_RESOURCE_WEALTH_LINE, TUTORIAL_RESOURCE_COFFEE_LINE],
        hostNotes: `重点解释精力每轮重置、同时代两轮相同、时代越往后越少（${TUTORIAL_ENERGY_SCHEDULE_HOST_LINE}）。鼓励花完当轮精力。开局 ${STARTING_WEALTH} 财富可先买咖啡或留作拍卖/转账。可提一句咖啡 ${COFFEE_WEALTH_COST} 财富/杯。`,
        intro: true,
        demoKey: "resources",
    },
    {
        title: "投资项目类型",
        icon: "📋",
        content: [],
        hostNotes:
            "强调三种结算节奏：短期/风险当轮结，长期完成后结与第四时代第二轮未完成梯度；断供与超上限投爆风险。可点项目卡演示详情弹窗。",
        demoKey: "projectTypes",
    },
    {
        title: "时代主题与加成",
        icon: "🌍",
        content: [
            "每个时代都有一个主题（如气候、科技、文化）。",
            `主题契合且历史总投入第 1：短期恰好满额 +${ERA_BONUS_SHORT}，长期满额或超出上限 +${ERA_BONUS_LONG}。`,
            "短期超上限投爆无时代加成；风险项目不参与时代加成。"
        ],
        hostNotes: "强调：短期要「恰好满额」才有加成，投爆没有；长期填满或超填都可以；风险永远不参与。可点试玩卡看时代 UP。",
        intro: true,
        demoKey: "eraTheme",
    },
    {
        title: TUTORIAL_SLIDE_TITLE_TIED_RANK,
        icon: "🤝",
        intro: true,
        content: [
            "项目结算只按历史累计投入排名。",
            "投入相同则并列：共享所占用名次的奖励或惩罚，再均分（向零取整）。",
            `时代加成仅第一名并列组共享；短期恰好满额 +${ERA_BONUS_SHORT}，长期满额或超填 +${ERA_BONUS_LONG}。`
        ],
        hostNotes: "强调：并列是均分所占用档位合计，不是各拿第一名全额。",
        demoKey: "tiedRank",
    },
    {
        title: "转账、私信与群聊",
        icon: "💬",
        content: [...TUTORIAL_TRANSFER_BULLETS],
        hostNotes: "演示右侧折叠对话框；可试玩「插入待收转账」；私信可不填金额、只写留言；群聊演示「全场」与自建群。",
        demoKey: "transferAndMessage",
    },
    {
        title: "拍卖会",
        icon: "",
        gavelIcon: true,
        content: [...TUTORIAL_AUCTION_BULLETS],
        hostNotes: "主持用「确认成交 / 这张先跳过 / 改成拍这张」控场；不要再手动填价选人。",
        demoKey: "auction",
    },
    {
        title: "准备出发",
        icon: "🚀",
        content: [
            "游戏共 4 个时代，每个时代 2 轮。",
            "每一轮结束都会结算。",
            "祝各位在光阴的博弈中，此生无悔。"
        ],
        hostNotes: "规则讲解结束。主持人点击'结束教程'以进入游戏第一轮。",
        finale: true,
    }
];