import { GameState } from "./gameState.js";
import { 
  isEveryoneReady, 
  isEveryoneReadyToLeaveBuff,
  isInvestmentComplete, 
  resetAllReady 
} from "./gameActions.js";
import { settlePhase } from "../logic/projectSettlement.js";
import { clearAdminProjectAdjustState } from "../logic/adminProjectAdjust.js";
import { ensureProjectsDrawnForEra, stripExpiredRiskProjects, updateEraCard } from "../state/gameEra.js";
import { beginAuctionSession } from "../logic/auctionCards.js";
import { ensureSessionStarted, recordPhaseChange } from "./sessionTelemetry.js";
import {
  clearActionDeadline,
  getActionDeadlineMs,
  startInvestmentDeadline,
} from "./actionDeadline.js";
import { applyRoundEnergy } from "../logic/energySchedule.js";
import { syncActiveLongTermRecords } from "../logic/longTermLogic.js";

export function tryAdvancePhase(game: GameState) {
  const initialPhase = game.phase;
  if (game.phase === "ROOM_WAITING") return;
  
  // 1. ERA_INTRO -> INVESTMENT（含道具操作；不再经「进入讨论」闸门）
  if (game.phase === "ERA_INTRO") {
    if (isEveryoneReady(game)) {
      ensureProjectsDrawnForEra(game);

      syncActiveLongTermRecords(game);
      game.phase = "INVESTMENT";
      startInvestmentDeadline(game);
      const deadlineMin = getActionDeadlineMs(game) / (60 * 1000);
      game.logs.push(
        game.currentEra === 1
          ? `⏱️ ${deadlineMin} 分钟倒计时开始（投资阶段）`
          : `⏱️ ${deadlineMin} 分钟倒计时开始（投资与道具）`
      );

      resetAllReady(game);
    }
  }

  // 2. 遗留 BUFF_USAGE（旧局/主持跳转）：全员 ready 后并入投资开表
  else if (game.phase === "BUFF_USAGE") {
      if (isEveryoneReadyToLeaveBuff(game)) {
          ensureProjectsDrawnForEra(game);
          syncActiveLongTermRecords(game);
          game.phase = "INVESTMENT";
          startInvestmentDeadline(game);
          const deadlineMin = getActionDeadlineMs(game) / (60 * 1000);
          game.logs.push(`⏱️ ${deadlineMin} 分钟倒计时开始（投资与道具）`);
          resetAllReady(game);
      }
  }

  // 3. INVESTMENT -> SETTLEMENT
  else if (game.phase === "INVESTMENT") {
    if (isInvestmentComplete(game)) {
      settlePhase(game);
      clearActionDeadline(game);
      
      if (game.currentEra > 4) {
          game.phase = "COMMUNITY_NAMING";
      } else {
          game.phase = "SETTLEMENT";
      }
      resetAllReady(game);
    }
  }

  // 4. SETTLEMENT -> ERA_INTRO (或 AUCTION)
  else if (game.phase === "SETTLEMENT") {
    if (isEveryoneReady(game)) {
      advanceRound(game);
      // advanceRound 内部会处理 phase 变更（如果是换代且有拍卖）
      
      // ✅ 修复 Bug：使用类型断言 (as string) 绕过 TS 的类型收窄检查
      const currentPhase = game.phase as string;
      if (
          currentPhase !== "AUCTION" && 
          currentPhase !== "COMMUNITY_NAMING" && 
          currentPhase !== "GAME_OVER"
      ) {
          game.phase = "ERA_INTRO";
      }
      resetAllReady(game);
    }
  }

  if (game.phase !== initialPhase) {
    if (game.phase === "INVESTMENT") {
      ensureSessionStarted(game);
    }
    recordPhaseChange(game, initialPhase, game.phase, "tryAdvancePhase");
  }
}

function advanceRound(game: GameState) {
  clearAdminProjectAdjustState(game);
  clearActionDeadline(game);
  // 清理临时 Buff 与本轮道具短记录
  game.players.forEach((p) => {
    p.activeBuffs = [];
    p.buffRoundNotes = [];
    p.slackedBy = [];
    p.slackEnergyLost = [];
    p.pendingSlackHits = [];
    p.pendingLighterBurnNotices = [];
  });
  game.lighterBurnDeclarations = [];
  game.roundBuffPlays = [];

  // 第 4 时代第 2 轮结算后直接进入命名：不再把 currentEra/globalRound 推到 5/9。
  if (game.currentEra >= 4 && game.roundInEra >= 2) {
    game.phase = "COMMUNITY_NAMING";
    return;
  }

  game.globalRound += 1;
  game.roundInEra += 1;

  // 检查是否需要换代
  const isNewEra = game.roundInEra > 2;

  if (isNewEra) {
    // === 换代逻辑 ===
    game.roundInEra = 1;
    game.currentEra += 1;
    
    // 超过 Era 4 -> 社区命名（未完成长期已在第四时代第二轮 settlePhase 发完）
    if (game.currentEra > 4) {
      game.phase = "COMMUNITY_NAMING";
      return;
    }

    // 更新时代卡；换代即清旧风险，避免拍卖/时代介绍仍显示上代风险
    updateEraCard(game);
    stripExpiredRiskProjects(game);
    
    // 换代前插入拍卖阶段
    game.phase = "AUCTION";
    beginAuctionSession(game);
    game.logs.push(`🔨 第 ${game.currentEra - 1} 轮拍卖会开启`);
  } else {
    // 时代内轮转，不做特殊处理
  }

  // 重置玩家状态
  game.players.forEach(p => {
    p.ready = false;
    p.investment = {};
    p.investmentDraft = undefined;
    p.preSubmitInvestmentDraft = undefined;
  });

  applyRoundEnergy(game);
}