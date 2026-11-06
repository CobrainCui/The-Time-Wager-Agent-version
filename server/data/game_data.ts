export type ProjectType = 'short' | 'long' | 'risk';

export interface ProjectCard {
  id: number;
  name: string;
  type: ProjectType;
  maxEnergy: number;
  era?: string;
  rankRewards?: number[];
  overInvestPenalty?: number[];
  eraBonusApplicable?: boolean;
  startRound?: number;
}

export interface EventOption {
  energyChange: number;
  wealthChange?: number;
  description: string;
}

export interface EventCard {
  id: number;
  name: string;
  description: string;
  optionA: {
    energyChange: number;
    wealthChange: number;
    description: string;
  };
  optionB: {
    energyChange: number;
    wealthChange: number;
    description: string;
  };
}

export interface EraCard {
  id: number;
  name: string;
  era: string;    
  description: string;
  themeColor: string;
}

export type BuffType = 'gain' | 'interfere' | 'special';

export interface BuffCard {
  id: string; 
  name: string;
  type: BuffType;
  description: string;
}

// ====== Buff 卡池（description 与 frontend/src/config/buffCards.ts 字符级同步） ======
export const buffCards: BuffCard[] = [
  { id: 'buff_insurance', name: '保险', type: 'special', description: '你**整局曾经投入过**的风险项目，若在本卡生效轮次内投资失败（爆掉），则**赔付 100 财富**（历史投入也算，即使本卡生效轮次内没有再投）。点石成金会把保险赔付作为正向收益按 **1.5 倍向下取整**。只保风险项目，短期与长期项目不赔。' },
  { id: 'buff_gold', name: '点石成金', type: 'gain', description: '所有由项目结算、彩票、保险产生的**正向收益**（基础收益、排名奖励、时代加成、第四时代未完成长期项目的进度奖、彩票奖金、保险赔付）都按 **1.5 倍结算并向下取整**；**放弃结算的返还与玩家间转账不放大**。**惩罚不放大**。' },
  { id: 'buff_slack', name: '摸鱼传染', type: 'interfere', description: '指定一名在局玩家（含自己），使其精力 **减少 8 点（可以低于 0）**。若对方在本卡生效轮次内已有【劳逸结合】被动（含他人为其指定），改为 **增加 8 点精力**。摸鱼传染、劳逸结合在每场拍卖各可出现一张。' },
  { id: 'buff_force_buy', name: '强买强卖', type: 'special', description: '**仅能在拍卖阶段**使用，**每张只能用一次**；**默认整局仅出现一张**（管理端补发除外）。**免费**获得当前正在拍卖的那张道具卡。' },
  { id: 'buff_work_rest', name: '劳逸结合', type: 'special', description: '指定一名在局玩家（含他人）：该玩家在本卡生效轮次内被「摸鱼传染」时**不减精力，反而增加 8 点精力**；发动时**追溯改判本卡生效轮次内已经发生的摸鱼**（多个劳逸结合不叠加）。打火机作废某次摸鱼时，对应的改判也一并撤销；被撤销后劳逸结合不会退回手牌，仍作为本卡生效轮次内的被动保留。摸鱼传染、劳逸结合在每场拍卖各可出现一张。' },
  { id: 'buff_short', name: '项目做空', type: 'special', description: '投资阶段（提交锁定前）声明，**结算页判定**：指定一个本卡生效轮次内可投入的项目。**全员**在该项目**已积累的精力全部清零**（含长期进度与本卡生效轮次内已投入的精力，**含使用者自己**）；**已经入账的财富不追回**；本卡生效轮次内该项目不再发放回报。' },
  { id: 'buff_lighter', name: '打火机', type: 'special', description: '· 发动时机：投资阶段（提交锁定前）；倒计时最后 2 分钟不可用\n· 指定另一名玩家 + 一种道具；**不可指定自己或打火机**；使用时**立即消耗**打火机；你看不到对方手牌，也无法知道对方有没有这种卡\n· 使用后你只会看到「已使用」，**不会得知是否烧中**；只有被指定者会看到自己是否被烧\n· **结算页判定**（不是使用时立刻烧）\n· **先**作废本卡生效轮次内已打出的一张该种类；若没有，再查手牌烧一张；**同种类有多张时只处理一张**\n· 手牌命中：**私下提示**，对方**确认后**移除一张\n· 没烧中：被指定者会收到「未烧中」提示；**无效但仍消耗**；详情**仅当事人可见**' },
  { id: 'buff_lottery', name: '彩票', type: 'special', description: '打出后由系统调用线上随机源掷 1 颗六面骰，点数决定奖金：掷出 1 点没有奖金；2 点 30 财富；3 点 60 财富；4 点 90 财富；5 点 120 财富；6 点 200 财富。若在本卡生效轮次内持有点石成金，奖金作为正向收益按 **1.5 倍向下取整**。' },
];

// ====== 短期项目 (无变化) ======
export const shortTermProjects: ProjectCard[] = [
  {id: 1, name:'新能源汽车', type:'short', maxEnergy:23, era:'气候', rankRewards:[80,55,35,25,20,10], overInvestPenalty:[-35,-20,-15,-10,-5,-5], eraBonusApplicable:true},
  {id: 2, name:'兴建巨型水坝', type:'short', maxEnergy:30, era:'气候', rankRewards:[105,65,50,40,30,10], overInvestPenalty:[-40,-25,-20,-15,-5,-5], eraBonusApplicable:true},
  {id: 3, name:'视频会议', type:'short', maxEnergy:23, era:'科技', rankRewards:[80,55,35,25,20,10], overInvestPenalty:[-35,-20,-15,-10,-5,-5], eraBonusApplicable:true},
  {id: 4, name:'数字地图', type:'short', maxEnergy:18, era:'科技', rankRewards:[65,45,35,20,10,10], overInvestPenalty:[-25,-15,-10,-10,-5,-5], eraBonusApplicable:true},
  {id: 5, name:'国际文化艺术节', type:'short', maxEnergy:18, era:'文化', rankRewards:[65,45,35,20,10,10], overInvestPenalty:[-25,-15,-10,-10,-5,-5], eraBonusApplicable:true},
  {id: 6, name:'民俗主题公园', type:'short', maxEnergy:30, era:'文化', rankRewards:[105,65,50,40,30,10], overInvestPenalty:[-40,-25,-20,-15,-5,-5], eraBonusApplicable:true},
  {id: 7, name:'公共体育设施免费开放', type:'short', maxEnergy:23, era:'健康', rankRewards:[80,55,35,25,20,10], overInvestPenalty:[-35,-20,-15,-10,-5,-5], eraBonusApplicable:true},
  {id: 8, name:'“全民健身日”嘉年华', type:'short', maxEnergy:18, era:'健康', rankRewards:[65,45,35,20,10,10], overInvestPenalty:[-25,-15,-10,-10,-5,-5], eraBonusApplicable:true},
  {id: 9, name:'数字排毒', type:'short', maxEnergy:23, era:'心理', rankRewards:[80,55,35,25,20,10], overInvestPenalty:[-35,-20,-15,-10,-5,-5], eraBonusApplicable:true},
  {id: 10, name:'EAP全面推行', type:'short', maxEnergy:30, era:'心理', rankRewards:[105,65,50,40,30,10], overInvestPenalty:[-40,-25,-20,-15,-5,-5], eraBonusApplicable:true}
];

// ====== 长期项目 (移除 requiredWisdom) ======
export const longTermProjects: ProjectCard[] = [
  {id:101, name:'植树造林', type:'long', maxEnergy:90, era:'气候', rankRewards:[80,55,40,30,25,10]},
  {id:102, name:'城市海绵体改造', type:'long', maxEnergy:100, era:'气候', rankRewards:[85,60,50,35,30,15]},
  {id:103, name:'数字图书馆', type:'long', maxEnergy:90, era:'科技', rankRewards:[80,55,40,30,25,10]},
  {id:104, name:'遗产保护基金', type:'long', maxEnergy:90, era:'文化', rankRewards:[80,55,40,30,25,10]},
  {id:105, name:'文化桥梁使者', type:'long', maxEnergy:100, era:'文化', rankRewards:[85,60,50,35,30,15]},
  {id:106, name:'建立体育俱乐部', type:'long', maxEnergy:90, era:'健康', rankRewards:[80,55,40,30,25,10]},
  {id:107, name:'心理学教育普及', type:'long', maxEnergy:110, era:'心理', rankRewards:[90,65,55,40,30,20]}
];

// ====== 风险项目 (保持不变) ======
export const riskProjects: ProjectCard[] = [
  {id:201, name:'开采化石能源', type:'risk', maxEnergy:12, era:'气候'},
  {id:202, name:'成瘾算法', type:'risk', maxEnergy:8, era:'科技'},
  {id:203, name:'数据监控', type:'risk', maxEnergy:12, era:'科技'},
  {id:204, name:'文化商品化', type:'risk', maxEnergy:12, era:'文化'},
  {id:205, name:'营养代餐', type:'risk', maxEnergy:12, era:'健康'},
  {id:206, name:'完美身材', type:'risk', maxEnergy:8, era:'健康'},
  {id:207, name:'幸福药丸', type:'risk', maxEnergy:8, era:'心理'},
  {id:208, name:'大师速成班', type:'risk', maxEnergy:12, era:'心理'}
];

export const eraCards: EraCard[] = [
  { id: 1, name: "蔚蓝星球计划", era: "气候", description: "全球聚焦气候行动", themeColor: "green" },
  { id: 2, name: "数字星河时代", era: "科技", description: "信息技术爆发", themeColor: "blue" },
  { id: 3, name: "多元文明交响", era: "文化", description: "文化交流与认同", themeColor: "red" },
  { id: 4, name: "生命活力运动", era: "健康", description: "全民健康意识提升", themeColor: "orange" },
  { id: 5, name: "心灵觉醒浪潮", era: "心理", description: "心理健康成为核心议题", themeColor: "yellow" }
];

export const eventCards: EventCard[] = [];
