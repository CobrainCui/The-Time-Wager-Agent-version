import { GameState, Player, ActiveProject } from "./gameState.js";

// 玩家对项目投资
export function investInProjects(
  game: GameState,
  playerId: string,
  investments: Record<number, number> // { projectId: energyAmount }
) {
  const player = game.players.find(p => p.id === playerId);
  if (!player) throw new Error("玩家不存在");

  for (const projectIdStr in investments) {
    const projectId = parseInt(projectIdStr);
    const energy = investments[projectId];

    const project = game.activeProjects.find(p => p.id === projectId);
    if (!project) continue;

    // 检查玩家精力
    if (player.energy < energy) continue;

    // 投资限制
    const prevInvestment = player.investment[projectId] || 0;
    const totalInvestment = prevInvestment + energy;
    const maxAllowed = project.maxEnergy;
    const finalInvestment = Math.min(totalInvestment, maxAllowed);

    // 扣除玩家精力
    const actualDeduct = finalInvestment - prevInvestment;
    player.energy -= actualDeduct;

    // 更新玩家投资记录
    player.investment[projectId] = finalInvestment;

    // 更新项目标记
    project.investedThisRound = true;
  }

  // 记录日志
  game.logs.push(`${player.name} 完成投资: ${JSON.stringify(investments)}`);
}
