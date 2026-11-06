import { GameState, Player, ActiveProject, SettlementProjectResult, GainBreakdown } from "../state/gameState.js";
import { appendSettlementRound } from "../state/sessionTelemetry.js";
import {
  applyLongTermRoundInvestments,
  refundOnAbandon,
  shouldTreatAsAbandon,
  syncLongTermRecordsFromHistory,
} from "./longTermLogic.js";
import { applyGoldMultiplier } from "./buffLogic.js";
import { resolveRoundBuffsAtSettlement } from "./roundBuffResolve.js";
import { ERA_BONUS_POOL_LONG, ERA_BONUS_POOL_SHORT } from "../config/eraBonus.js";
import { captureSettlementBaseline } from "./settlementBaseline.js";
import { replaceSettlementRound } from "../state/sessionTelemetry.js";

// 辅助：创建零收益对象
const zeroGain = (): GainBreakdown => ({ total: 0, base: 0, rank: 0, era: 0 });

// 辅助：检查是否有 Buff
function hasBuff(player: Player, buffId: string): boolean {
    return player.activeBuffs && player.activeBuffs.some(b => b.cardId === buffId);
}

function insurancePayout(player: Player): number {
  return applyGoldMultiplier(player, 100);
}

/** 点石成金乘过时累计乘前原值（仅正项放大） */
function noteBeforeGold(
  g: GainBreakdown,
  field: "baseBeforeGold" | "rankBeforeGold" | "eraBeforeGold",
  original: number,
  amplified: number
): void {
  if (original > 0 && amplified !== original) {
    g[field] = (g[field] ?? 0) + original;
  }
}

export type SettlePhaseOptions = {
  replacePrevious?: boolean;
  hostAdjusted?: boolean;
  hostRevision?: number;
};

export function settlePhase(game: GameState, options?: SettlePhaseOptions) {
  const replacePrevious = options?.replacePrevious === true;
  if (!replacePrevious && !game.settlementBaseline) {
    game.settlementBaseline = captureSettlementBaseline(game);
    if (!game.adminProjectAdjustments) game.adminProjectAdjustments = [];
    if (typeof game.hostRevision !== "number") game.hostRevision = 0;
  }

  const snapshot: SettlementProjectResult[] = [];
  const logs: string[] = [];
  const lighterResolve = resolveRoundBuffsAtSettlement(game);
  logs.push(`=== ${game.currentEra}时代 第${game.roundInEra}轮 结算 ===`);

  const remainingProjects: ActiveProject[] = [];

  for (const project of game.activeProjects) {
    if (!project.investorRecords) project.investorRecords = {};
    if (!project.earningRecords) project.earningRecords = {}; 
    if (!project.totalPayout) project.totalPayout = 0;

    const result = settleOneProject(game, project, logs);
    snapshot.push(result);

    // 检查连续空投（做空当轮当作新发，不计无人投）
    if (result.shortSold) {
      project.roundsNoInvestment = 0;
    } else if (project.currentInvested === 0) {
      project.roundsNoInvestment = (project.roundsNoInvestment || 0) + 1;
    } else {
      project.roundsNoInvestment = 0;
    }

    if (result.isCompleted) {
        game.completedProjects.push(project);
        if (project.type === "long" && result.isExploded) {
            logs.push(
              `✅ 项目「${project.name}」长期超额完成（${result.totalInvested}/${project.maxEnergy}），移出牌桌`
            );
        } else if (project.type === "long") {
            logs.push(`✅ 项目「${project.name}」长期恰好完成，移出牌桌`);
        } else if (project.type === "short" && result.isExploded) {
            logs.push(`💥 项目「${project.name}」短期投爆，移出牌桌`);
        } else {
            logs.push(`✅ 项目「${project.name}」已结束/完成，移出牌桌`);
        }
    } else if (result.isExploded) {
        game.uncompletedProjects.push(project);
        logs.push(`💥 项目「${project.name}」已爆掉，移出牌桌`);
    } else if (
      project.roundsNoInvestment >= 2 &&
      (project.accumulatedInvested ?? 0) === 0
    ) {
        game.uncompletedProjects.push(project);
        logs.push(`🗑️ 项目「${project.name}」连续2轮无人问津且从未被投入，自动撤资离场`);
    } else {
        remainingProjects.push(project);
    }
  }

  game.activeProjects = remainingProjects;

  // 第四时代第二轮：未完成长期按全场进度梯度结算，写入本轮结算单
  if (game.currentEra === 4 && game.roundInEra === 2) {
    settleUnfinishedLongGradient(game, snapshot, logs);
  }

  game.lastSettlement = {
    round: game.globalRound,
    results: snapshot,
    lighterResolve,
    ...(options?.hostAdjusted
      ? {
          hostAdjusted: true,
          hostRevision: options.hostRevision ?? game.hostRevision ?? 0,
        }
      : {}),
  };
  if (replacePrevious) {
    replaceSettlementRound(game, snapshot);
  } else {
    appendSettlementRound(game, snapshot);
  }
  game.logs.push(...logs);

  if (replacePrevious) {
    for (const p of game.players) {
      if (p.wealthHistory.length > 0) {
        p.wealthHistory[p.wealthHistory.length - 1] = p.wealth;
      } else {
        p.wealthHistory.push(p.wealth);
      }
    }
  } else {
    game.players.forEach((p) => {
      p.wealthHistory.push(p.wealth);
    });
  }
}

/**
 * 第四时代第二轮结算：仍未完成的长期项目按全场累计进度发梯度奖
 * （每点精力返还 1 / 5 / 10 财富），计入本轮 snapshot.playerGains，并移入 uncompletedProjects。
 * 梯度奖属于项目正向收益，持有【点石成金】时同样放大；放弃结算的返还与转账不放大。
 * 含本轮仍在牌面的长期，以及中途撤场（连续空投）已进 uncompleted 的长期。
 */
function settleUnfinishedLongGradient(
  game: GameState,
  snapshot: SettlementProjectResult[],
  logs: string[]
) {
  logs.push("📜 第四时代第二轮：结算未完成的长期项目（进度梯度）...");

  const candidates = new Map<number, ActiveProject>();
  for (const p of game.activeProjects) {
    if (p.type === "long") candidates.set(p.id, p);
  }
  for (const p of game.uncompletedProjects) {
    if (p.adminForceWithdrawn) continue;
    if (p.type === "long" && !p.endGradientPaid) candidates.set(p.id, p);
  }

  const paidIds = new Set<number>();

  for (const proj of candidates.values()) {
    let totalProgress = 0;
    for (const p of game.players) {
      const lt = p.longTerm[proj.id];
      if (!lt || lt.status === "abandoned") continue;
      totalProgress += lt.totalInvested || 0;
    }

    let ratio = 1;
    if (totalProgress >= (proj.maxEnergy * 2) / 3) {
      ratio = 10;
    } else if (totalProgress >= proj.maxEnergy / 3) {
      ratio = 5;
    }

    let result = snapshot.find((r) => r.projectId === proj.id);
    if (!result) {
      result = {
        projectId: proj.id,
        name: proj.name,
        type: proj.type,
        maxEnergy: proj.maxEnergy,
        totalInvested: totalProgress,
        isExploded: false,
        isCompleted: false,
        endGradient: true,
        playerInvestments: {},
        playerGains: {},
      };
      snapshot.push(result);
    } else {
      result.endGradient = true;
    }

    for (const p of game.players) {
      const lt = p.longTerm[proj.id];
      if (!lt || lt.status === "abandoned") continue;
      const myInvest = lt.totalInvested || 0;
      if (myInvest <= 0) continue;

      const baseGain = myInvest * ratio;
      const gain = applyGoldMultiplier(p, baseGain);
      p.wealth += gain;

      // 梯度行的「投入」用个人累计，与结算基数一致
      result.playerInvestments[p.id] = myInvest;

      const g = result.playerGains[p.id] || zeroGain();
      g.base += gain;
      g.total += gain;
      noteBeforeGold(g, "baseBeforeGold", baseGain, gain);
      result.playerGains[p.id] = g;

      if (!proj.earningRecords) proj.earningRecords = {};
      proj.totalPayout = (proj.totalPayout || 0) + gain;
      proj.earningRecords[p.id] = (proj.earningRecords[p.id] || 0) + gain;

      logs.push(
        `📜 ${p.name} 结算长期项目「${proj.name}」(进度${totalProgress}/${proj.maxEnergy}, 每点精力返还${ratio}财富), 获得 ${gain}${gain !== baseGain ? "（点石成金生效）" : ""}`
      );
    }

    proj.endGradientPaid = true;
    paidIds.add(proj.id);
  }

  game.activeProjects = game.activeProjects.filter((p) => !paidIds.has(p.id));
  for (const id of paidIds) {
    const proj = candidates.get(id)!;
    if (!game.uncompletedProjects.some((p) => p.id === id)) {
      game.uncompletedProjects.push(proj);
    }
  }
}

export function settleOneProject(
  game: GameState, 
  project: ActiveProject, 
  logs: string[]
): SettlementProjectResult {
  
  const result: SettlementProjectResult = {
    projectId: project.id,
    name: project.name,
    type: project.type,
    maxEnergy: project.maxEnergy,
    totalInvested: 0,
    isExploded: false,
    isCompleted: false,
    playerInvestments: {},
    playerGains: {}
  };

  // === 项目做空：只清零该项目已积累精力，已入账财富不追回 ===
  const shortedBy = game.players.find((p) =>
    p.activeBuffs.some((b) => b.cardId === "buff_short" && b.targetProjectId === project.id)
  );
  if (shortedBy) {
    const priorRecords = { ...(project.investorRecords || {}) };
    const wipedInvestors = Object.keys(priorRecords);
    result.shortSold = true;
    for (const p of game.players) {
      const roundAmt = p.investment?.[project.id] || 0;
      const wipedAmt = (priorRecords[p.id] || 0) + roundAmt;
      // 含历史累计：本轮 0 投入的旧股东也能在结算单看到被清零
      if (wipedAmt > 0) result.playerInvestments[p.id] = wipedAmt;
      if (p.investment) p.investment[project.id] = 0;
      if (p.longTerm?.[project.id]) {
        delete p.longTerm[project.id];
      }
      // 账本清零、不改财富：当作新项目，避免日后投爆误追做空前分红
      if (p.riskGains?.[project.id]) p.riskGains[project.id] = 0;
    }
    project.investorRecords = {};
    project.investorRoundSlices = {};
    project.accumulatedInvested = 0;
    project.currentInvested = 0;
    project.earningRecords = {};
    project.totalPayout = 0;
    project.roundsNoInvestment = 0;
    project.investedThisRound = false;
    result.totalInvested = 0;
    logs.push(
      `📉 「${project.name}」被 ${shortedBy.name} 【项目做空】：已积累精力清零，已入账财富不追回，本轮不再发放回报；项目留在桌上可再投（曾累计投入人数 ${wipedInvestors.length}）`
    );
    return result;
  }

  // === 0. 长期项目放弃检测 ===
  if (project.type === 'long') {
      syncLongTermRecordsFromHistory(project, game.players);
      game.players.forEach(p => {
          const record = p.longTerm[project.id];
          const currentAmount = p.investment?.[project.id] || 0;
          if (!shouldTreatAsAbandon(record, currentAmount)) return;

          const totalRefund = refundOnAbandon(record!, currentAmount);
          // 牌桌进度只含历史；本轮 currentAmount 尚未写入 accumulated / investorRecords
          const historicalOnBoard = record!.totalInvested;

          p.wealth += totalRefund;
          let abandonSlices = [...(record!.roundSlices ?? [])];
          if (currentAmount > 0) abandonSlices.push(currentAmount);
          let abandonSliceSum = abandonSlices.reduce((s, x) => s + x, 0);
          if (abandonSliceSum !== totalRefund) {
            if (!record!.roundSlices?.length) {
              abandonSlices =
                currentAmount > 0
                  ? [historicalOnBoard, currentAmount]
                  : [totalRefund];
            } else if (abandonSliceSum < totalRefund) {
              abandonSlices.push(totalRefund - abandonSliceSum);
            } else {
              let excess = abandonSliceSum - totalRefund;
              const trimmed = [...abandonSlices];
              trimmed[trimmed.length - 1] = Math.max(0, trimmed[trimmed.length - 1]! - excess);
              abandonSlices = trimmed.filter((x) => x > 0);
            }
          }
          record!.status = "abandoned";
          record!.totalInvested = 0;
          record!.roundSlices = abandonSlices;

          p.investedLongEnergy = Math.max(0, p.investedLongEnergy - totalRefund);

          const priorOnBoard = project.investorRecords[p.id] ?? historicalOnBoard;
          if (currentAmount > 0) {
            project.investorRecords[p.id] = priorOnBoard + currentAmount;
            project.accumulatedInvested = (project.accumulatedInvested || 0) + currentAmount;
          } else if (priorOnBoard > 0) {
            project.investorRecords[p.id] = priorOnBoard;
          }

          project.totalPayout += totalRefund;
          project.earningRecords[p.id] = (project.earningRecords[p.id] || 0) + totalRefund;

          logs.push(`🚫 ${p.name} 对「${project.name}」追加投资不足3，判定放弃。结算 ${totalRefund}，退出排名。`);

          // 结算单「投入」记 1:1 结算的累计（含本轮），避免显示 0 投入却结算 N
          result.playerInvestments[p.id] = totalRefund;
          result.playerGains[p.id] = { total: totalRefund, base: totalRefund, rank: 0, era: 0 };

          if (p.investment) p.investment[project.id] = 0;
      });
  }

  // === 1. 统计本轮投资者并更新记录 ===
  // 这一步只处理"本轮"的投入，更新 accumulated 和 investorRecords
  const currentRoundInvestors = game.players
    .map(p => ({ player: p, amount: p.investment?.[project.id] || 0 }))
    .filter(i => {
        if (i.amount <= 0) return false;
        if (project.type === 'long') {
            const status = i.player.longTerm[project.id]?.status;
            if (status === 'abandoned' || status === 'completed') return false;
        }
        return true;
    });

  // 更新总进度和个人记录
  currentRoundInvestors.forEach(i => {
      // 记录本轮投入，用于前端显示
      result.playerInvestments[i.player.id] = i.amount;
      // 初始化收益对象
      if (!result.playerGains[i.player.id]) result.playerGains[i.player.id] = zeroGain();
      
      const pid = i.player.id;
      const amount = i.amount;
      const prior = project.investorRecords[pid] || 0;
      project.investorRecords[pid] = prior + amount;
      if (project.type === "short" || project.type === "risk") {
        if (!project.investorRoundSlices) project.investorRoundSlices = {};
        if (!project.investorRoundSlices[pid]?.length && prior > 0) {
          project.investorRoundSlices[pid] = [prior];
        }
        if (!project.investorRoundSlices[pid]) project.investorRoundSlices[pid] = [];
        project.investorRoundSlices[pid].push(amount);
      }
  });

  applyLongTermRoundInvestments(project, currentRoundInvestors);
  
  const roundTotal = currentRoundInvestors.reduce((s, i) => s + i.amount, 0);
  project.currentInvested = roundTotal; 
  project.accumulatedInvested += roundTotal; 

  const totalAccumulated = project.accumulatedInvested;
  const isExploded = totalAccumulated > project.maxEnergy;
  const isCompleted = totalAccumulated >= project.maxEnergy;

  result.totalInvested = totalAccumulated;
  result.isExploded = isExploded;
  result.isCompleted = isCompleted;

  // === 辅助：构建全历史投资人列表 (用于排名) ===
  // 排除已放弃的长期投资者
  const allInvestorIds = Object.keys(project.investorRecords);
  const allInvestors = allInvestorIds.map(id => {
      const p = game.players.find(pl => pl.id === id);
      return { 
          player: p, 
          total: project.investorRecords[id] 
      };
  })
  .filter(item => {
      if (!item.player) return false;
      if (project.type === 'long') {
          return item.player.longTerm[project.id]?.status !== 'abandoned';
      }
      return true;
  })
  .sort((a, b) => b.total - a.total);

  // （旧版做空猜空/猜满已下线；新版做空在 settleProject 开头短路）

  // === 1. 计算基础回报与排名 ===

  if (currentRoundInvestors.length === 0 && !isExploded && !isCompleted) return result; 

  // === A. Risk (风险项目) ===
  if (project.type === 'risk') {
    if (isExploded) {
      logs.push(`💥 风险项目「${project.name}」累计${totalAccumulated}，投入超过上限，投爆！`);
      game.players.forEach(p => {
        // 【保险】整局曾投入过该风险项目（历史累计投入 > 0）且投爆：赔付 100（点石成金可×1.5）
        // 历史参与也算，即使本轮没有再投；短期/长期项目不触发保险。
        const everInvested =
          (project.investorRecords?.[p.id] ?? 0) > 0 ||
          (p.investment?.[project.id] ?? 0) > 0;
        if (hasBuff(p, 'buff_insurance') && everInvested) {
            const payout = insurancePayout(p);
            p.wealth += payout;
            logs.push(`🛡️ ${p.name} 触发【保险】(风险项目)，获得赔付 ${payout} 财富！`);
            
            project.totalPayout += payout;
            project.earningRecords[p.id] = (project.earningRecords[p.id] || 0) + payout;
            
            const g = result.playerGains[p.id] || zeroGain();
            g.base += payout;
            g.total += payout;
            noteBeforeGold(g, "baseBeforeGold", 100, payout);
            result.playerGains[p.id] = g;
        }

        const historyGain = p.riskGains?.[project.id] || 0;
        if (historyGain > 0) {
          // 全额追回；财富不够也扣成负数，不得截断到 0
          p.wealth -= historyGain;
          p.riskGains[project.id] = 0;
          logs.push(`  💸 ${p.name} 被追回历史收益 -${historyGain}`);
          
          project.totalPayout -= historyGain;
          project.earningRecords[p.id] = (project.earningRecords[p.id] || 0) - historyGain;

          const g = result.playerGains[p.id] || zeroGain();
          g.base -= historyGain;
          g.total -= historyGain;
          result.playerGains[p.id] = g;
        }
      });
    } else {
      let rate = 20; 
      if (project.name.includes("成瘾") || project.name.includes("完美") || project.name.includes("幸福")) rate = 25;

      // 风险项目回报只给本轮投资者
      currentRoundInvestors.forEach(({ player, amount }) => {
        let gain = amount * rate;
        const original = gain;

        if (hasBuff(player, 'buff_gold')) {
            gain = Math.floor(gain * 1.5);
            logs.push(`✨ ${player.name} 【点石成金】生效，收益 ${original} -> ${gain}`);
        }

        player.wealth += gain;
        
        if (!player.riskGains) player.riskGains = {};
        player.riskGains[project.id] = (player.riskGains[project.id] || 0) + gain;

        const g = result.playerGains[player.id] || zeroGain();
        g.base += gain;
        g.total += gain;
        noteBeforeGold(g, "baseBeforeGold", original, gain);
        result.playerGains[player.id] = g;
        
        project.totalPayout += gain;
        project.earningRecords[player.id] = (project.earningRecords[player.id] || 0) + gain;
        
        logs.push(`  💰 ${player.name} 风险回报 +${gain}`);
      });
    }
    return result;
  }

  // === B. Long (长期项目) ===
  // 时代加成：累计 >= maxEnergy（含超填）结束时，主题契合的历史第一 +50/+100（见 applyRankAndEraBonus）
  if (project.type === 'long') {
    // 处理本轮投资者的投入记录逻辑已经在上面完成了
    // Long项目的特性：未完成不发钱
    if (isCompleted) {
      if (isExploded) {
        logs.push(
          `  ✅ 长期项目「${project.name}」超额完成（${totalAccumulated}/${project.maxEnergy}）！发放累计收益与排名奖励。`
        );
      } else {
        logs.push(
          `  ✅ 长期项目「${project.name}」恰好完成！发放累计收益与排名奖励。`
        );
      }
      
      // ✅ 核心修正：遍历所有历史投资人 (allInvestors) 发放收益
      allInvestors.forEach(({ player, total }) => {
        if (!player) return;

        // 1. 基础收益 = 累计投入 * 15
        let baseGain = total * 15;
        const original = baseGain;

        if (hasBuff(player, 'buff_gold')) {
            baseGain = Math.floor(baseGain * 1.5);
            logs.push(`✨ ${player.name} 【点石成金】生效，收益 ${original} -> ${baseGain}`);
        }

        player.wealth += baseGain;
        
        // 记录到结果 (注意：该玩家可能本轮没投，playerGains可能为空，需初始化)
        const g = result.playerGains[player.id] || zeroGain();
        g.base += baseGain;
        g.total += baseGain;
        noteBeforeGold(g, "baseBeforeGold", original, baseGain);
        result.playerGains[player.id] = g;
        
        project.totalPayout += baseGain;
        project.earningRecords[player.id] = (project.earningRecords[player.id] || 0) + baseGain;

        if (player.longTerm[project.id]) player.longTerm[project.id].status = 'completed';
      });

      // 2. 排名与时代奖励 (也是针对所有历史投资人)
      applyRankAndEraBonus(game, project, allInvestors, result, logs);

    } else {
      logs.push(`  ⏳ 长期项目进度 ${totalAccumulated}/${project.maxEnergy}`);
    }
    return result;
  }

  // === C. Short (短期项目) ===
  // 时代加成：仅恰好满额（isCompleted && !isExploded）时发放；超上限爆掉无时代加成。风险项目永不参与。
  if (project.type === 'short') {
    // 1. 基础收益：只发给本轮投资者
    currentRoundInvestors.forEach(({ player, amount }) => {
        let baseGain = amount * 10;
        const original = baseGain;

        if (hasBuff(player, 'buff_gold') && baseGain > 0) {
            baseGain = Math.floor(baseGain * 1.5);
            logs.push(`✨ ${player.name} 【点石成金】生效，收益 ${original} -> ${baseGain}`);
        }

        player.wealth += baseGain;
        
        const g = result.playerGains[player.id] || zeroGain();
        g.base += baseGain;
        g.total += baseGain;
        noteBeforeGold(g, "baseBeforeGold", original, baseGain);
        result.playerGains[player.id] = g;
        
        project.totalPayout += baseGain;
        project.earningRecords[player.id] = (project.earningRecords[player.id] || 0) + baseGain;

        logs.push(`  💰 ${player.name} 短期收益 ${baseGain}`);
    });

    // 2. 排名惩罚 (超上限投爆时) -> 针对所有历史投资人，投入相同则并列共享惩罚
    if (isExploded) {
        logs.push(`  💥 ${project.name} 投爆！执行排名惩罚。`);

        const groups = groupInvestorsByTiedTotal(allInvestors);
        for (const group of groups) {
            const penaltyEach = sharedPoolAmount(project.overInvestPenalty, group.startIndex, group.size);
            for (const { player } of group.members) {
                if (!player) continue;
                if (penaltyEach !== 0) {
                    player.wealth += penaltyEach;

                    const g = result.playerGains[player.id] || zeroGain();
                    g.rank += penaltyEach;
                    g.total += penaltyEach;
                    result.playerGains[player.id] = g;

                    project.totalPayout += penaltyEach;
                    project.earningRecords[player.id] = (project.earningRecords[player.id] || 0) + penaltyEach;

                    logs.push(
                      group.size > 1
                        ? `    💀 ${player.name} 并列第${group.startIndex + 1}（${group.size}人共享），惩罚 ${penaltyEach}`
                        : `    💀 ${player.name} 排名第${group.startIndex + 1}，受到惩罚 ${penaltyEach}`
                    );
                }
            }
        }
    }

    // 3. 排名奖励 (恰好完成时) -> 针对所有历史投资人
    else if (isCompleted && !isExploded) {
         logs.push(`  🏅 ${project.name} 恰好完成！发放排名奖励与时代加成。`);
         applyRankAndEraBonus(game, project, allInvestors, result, logs);
    } 
    
    return result;
  }

  return result;
}

// 排名奖励(rankRewards) + 时代加成(eraBonus)，财富计入 player.wealth。
// 投入相同则并列：共享所占用名次池（floor(sum/k)）；时代加成仅第一名并列组共享。
//   短期 +50：仅 totalAccumulated === maxEnergy（调用方须为 !isExploded 分支）
//   长期 +100：totalAccumulated >= maxEnergy（含超填）
//   风险：不进入本函数；短期超上限投爆：不进入本函数
type InvestorEntry = { player: Player | undefined; total: number };

type TiedInvestorGroup = {
  members: InvestorEntry[];
  startIndex: number;
  size: number;
};

/** 按累计投入降序后的列表，将相同投入归为并列组 */
export function groupInvestorsByTiedTotal(investors: InvestorEntry[]): TiedInvestorGroup[] {
  const groups: TiedInvestorGroup[] = [];
  let i = 0;
  while (i < investors.length) {
    const total = investors[i].total;
    let j = i + 1;
    while (j < investors.length && investors[j].total === total) j += 1;
    groups.push({
      members: investors.slice(i, j),
      startIndex: i,
      size: j - i,
    });
    i = j;
  }
  return groups;
}

/** 均分名次数组中 [start, start+size) 的合计（向零取整，正负对称） */
export function sharedPoolAmount(values: number[] | undefined, startIndex: number, size: number): number {
  if (!values || size <= 0) return 0;
  let sum = 0;
  for (let i = 0; i < size; i++) {
    const v = values[startIndex + i];
    if (typeof v === "number") sum += v;
  }
  return Math.trunc(sum / size);
}

function applyRankAndEraBonus(
    game: GameState, 
    project: ActiveProject, 
    rankedInvestors: InvestorEntry[], 
    result: SettlementProjectResult,
    logs: string[],
) {
    if (rankedInvestors.length === 0) return;
    const currentTheme = game.currentEraCard?.era; 
    const isEraMatch = project.era === currentTheme;
    const eraPool = project.type === 'long' ? ERA_BONUS_POOL_LONG : ERA_BONUS_POOL_SHORT;

    const groups = groupInvestorsByTiedTotal(rankedInvestors);
    for (const group of groups) {
        const rankExtra = sharedPoolAmount(project.rankRewards, group.startIndex, group.size);
        const eraExtra =
          isEraMatch && group.startIndex === 0
            ? Math.trunc(eraPool / group.size)
            : 0;

        for (const { player } of group.members) {
            if (!player) continue;

            if (rankExtra !== 0) {
                logs.push(
                  group.size > 1
                    ? `    🏆 ${player.name} 并列第${group.startIndex + 1}（${group.size}人共享）奖励 +${rankExtra}`
                    : `    🏆 ${player.name} 排名第${group.startIndex + 1} 奖励 +${rankExtra}`
                );
            }
            if (eraExtra !== 0) {
                logs.push(
                  group.size > 1
                    ? `    🌟 ${player.name} 时代契合(并列第一共享)加成 +${eraExtra}`
                    : `    🌟 ${player.name} 时代契合(第一名)加成 +${eraExtra}`
                );
            }

            let rankPaid = rankExtra;
            let eraPaid = eraExtra;

            // 点石成金：各正项分别 ×1.5 向下取整（分解栏与总回报一致；惩罚不放大）
            if (hasBuff(player, 'buff_gold')) {
                if (rankPaid > 0) rankPaid = Math.floor(rankPaid * 1.5);
                if (eraPaid > 0) eraPaid = Math.floor(eraPaid * 1.5);
            }

            const totalExtra = rankPaid + eraPaid;

            if (totalExtra !== 0) {
                player.wealth += totalExtra;

                const g = result.playerGains[player.id] || zeroGain();
                g.rank += rankPaid;
                g.era += eraPaid;
                g.total += totalExtra;
                noteBeforeGold(g, "rankBeforeGold", rankExtra, rankPaid);
                noteBeforeGold(g, "eraBeforeGold", eraExtra, eraPaid);
                result.playerGains[player.id] = g;

                project.totalPayout += totalExtra;
                project.earningRecords[player.id] = (project.earningRecords[player.id] || 0) + totalExtra;
            }
        }
    }
}