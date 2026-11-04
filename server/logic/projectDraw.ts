import { shortTermProjects, longTermProjects, riskProjects, ProjectCard } from "../data/game_data.js";

export interface DrawResult {
  drawn: ProjectCard[];
  remainingShort: ProjectCard[];
  remainingLong: ProjectCard[];
  remainingRisk: ProjectCard[];
}

// 洗牌辅助函数
function shuffle<T>(array: T[]): T[] {
  return array.sort(() => 0.5 - Math.random());
}

/**
 * @param era 当前时代 1~5
 * @param round 当前轮次 1~2
 * @param prevProjects 上一轮未完成项目
 */
export function drawProjects(era: number, round: number, prevProjects: ProjectCard[]): DrawResult {
  let shortDeck = [...shortTermProjects];
  let longDeck = [...longTermProjects];
  let riskDeck = [...riskProjects];
  
  const drawn: ProjectCard[] = [...prevProjects]; // 保留未完成项目

  if (era === 1 && round === 1) {
    // 第一时代第一轮固定放入“心理学教育普及”
    const fixed = longDeck.find(p => p.name === "心理学教育普及");
    if (fixed) {
      drawn.push(fixed);
      longDeck = longDeck.filter(p => p.id !== fixed.id);
    }
    // 补抽短期 x3, 长期 x2, 风险 x1
    drawn.push(...shuffle(shortDeck).slice(0, 3));
    drawn.push(...shuffle(longDeck).slice(0, 1)); // 剩余长期项目再抽一张
    drawn.push(...shuffle(riskDeck).slice(0, 1));
  } else if (era === 1 && round === 2) {
    // 第一时代第二轮固定放入”海绵城市“和”文化桥梁使者“
    const fixed1 = longDeck.find(p => p.name === "海绵城市");
    const fixed2 = longDeck.find(p => p.name === "文化桥梁使者");
    if (fixed1) { drawn.push(fixed1); longDeck = longDeck.filter(p => p.id !== fixed1.id); }
    if (fixed2) { drawn.push(fixed2); longDeck = longDeck.filter(p => p.id !== fixed2.id); }
    // 抽取 3 张新项目：短期 1, 长期 1, 风险 1
    drawn.push(...shuffle(shortDeck).slice(0, 1));
    drawn.push(...shuffle(longDeck).slice(0, 1));
    drawn.push(...shuffle(riskDeck).slice(0, 1));
  } else if (era >= 2 && era <= 3) {
    // 第2-3时代：抽短期、长期、风险各1
    drawn.push(...shuffle(shortDeck).slice(0, 1));
    drawn.push(...shuffle(longDeck).slice(0, 1));
    drawn.push(...shuffle(riskDeck).slice(0, 1));
  } else if (era >= 4 && era <= 5) {
    // 第4-5时代：从短期和风险牌堆中抽取
    drawn.push(...shuffle(shortDeck).slice(0, 2));
    drawn.push(...shuffle(riskDeck).slice(0, 1));
  }

  return {
    drawn,
    remainingShort: shortDeck,
    remainingLong: longDeck,
    remainingRisk: riskDeck
  };
}
