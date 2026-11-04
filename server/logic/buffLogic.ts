import { randomUUID } from "node:crypto";
import { GameState, ActiveBuff, BuffRoundNote, Player } from "../state/gameState.js";
import { buffCards } from "../data/game_data.js";
import { appendSessionEvent } from "../state/sessionTelemetry.js";
import { resolveInventoryIndexForCard } from "./adminPlayerCard.js";
import {
  afterForceBuyOnFocus,
  isAuctionCardAvailable,
  markAuctionCardDistributed,
  recordAuctionCompletedDeal,
} from "./auctionCards.js";
import { handleInvestmentAfterBookEnergyNegative } from "./investmentLogic.js";
import { appendRoundBuffPlay } from "./roundBuffResolve.js";

export const SLACK_ENERGY_DELTA = 8;
export const WORK_REST_CARD_ID = "buff_work_rest";
export const FORCE_BUY_CARD_ID = "buff_force_buy";
export const LIGHTER_CARD_ID = "buff_lighter";
export const SHORT_CARD_ID = "buff_short";
export const SLACK_CARD_ID = "buff_slack";
export const GOLD_CARD_ID = "buff_gold";

const RETIRED_CARD_IDS = new Set(["buff_spirit", "buff_rebound"]);

function pushNote(player: Player, note: BuffRoundNote): void {
  if (!player.buffRoundNotes) player.buffRoundNotes = [];
  player.buffRoundNotes.push(note);
}

function hasWorkRest(player: Player): boolean {
  return player.activeBuffs.some((b) => b.cardId === WORK_REST_CARD_ID);
}

function ensureWorkRestPassive(target: Player, instanceId: string): void {
  if (hasWorkRest(target)) return;
  target.activeBuffs.push({
    cardId: WORK_REST_CARD_ID,
    targetPlayerId: target.id,
    instanceId,
  });
}

export function applyGoldMultiplier(player: Player, amount: number): number {
  if (!player.activeBuffs.some((b) => b.cardId === GOLD_CARD_ID)) return amount;
  if (amount <= 0) return amount;
  return Math.floor(amount * 1.5);
}

export type UseBuffResult =
  | {
      success: true;
      msg: string;
      notifyTargetId?: string;
      notifyTargetMsg?: string;
      investmentAutoUnlocked?: boolean;
      cancelledOffers?: { offerId: string; playerId: string; cardId: string }[];
      auctionSold?: {
        cardId: string;
        playerId: string;
        cost: number;
        source: "hammer" | "force_buy";
      };
    }
  | { success: false; msg: string };

/**
 * 玩家使用道具卡
 */
export function useBuffCard(
  game: GameState,
  playerId: string,
  cardId: string,
  params: {
    targetPlayerId?: string;
    targetProjectId?: number;
    burnFromInventory?: boolean;
    burnCardId?: string;
    inventoryIndex?: unknown;
    extraData?: unknown;
  }
): UseBuffResult {
  const player = game.players.find((p) => p.id === playerId);
  if (!player) return { success: false, msg: "玩家不存在" };

  const resolved = resolveInventoryIndexForCard(player.inventory || [], cardId, params.inventoryIndex);
  if (!resolved.ok) {
    if (resolved.error === "stale") {
      return { success: false, msg: "手牌已变化，请重试" };
    }
    return { success: false, msg: "你没有这张卡" };
  }
  const cardIndex = resolved.index;

  if (RETIRED_CARD_IDS.has(cardId)) {
    return { success: false, msg: "该道具已下线，无法使用" };
  }

  const cardDef = buffCards.find((c) => c.id === cardId);
  if (!cardDef) return { success: false, msg: "未知卡牌数据" };

  let notifyTargetId: string | undefined;
  let notifyTargetMsg: string | undefined;
  let usedText = `使用了【${cardDef.name}】`;
  let hitNote: BuffRoundNote | undefined;
  const effect: Record<string, unknown> = {};

  const playId = randomUUID();
  const buff: ActiveBuff = {
    instanceId: playId,
    cardId,
    targetPlayerId: params.targetPlayerId,
    targetProjectId: params.targetProjectId,
    extraData: params.extraData,
  };
  let roundPlayEnergyDeltas: { playerId: string; delta: number }[] = [];

  if (cardId === SLACK_CARD_ID) {
    const target = game.players.find((p) => p.id === params.targetPlayerId);
    if (!target) return { success: false, msg: "未指定目标" };

    let slackInvestmentAutoUnlocked = false;
    const workRestActive = hasWorkRest(target);
    if (workRestActive) {
      target.energy += SLACK_ENERGY_DELTA;
      effect.energyDelta = SLACK_ENERGY_DELTA;
      effect.energyAfter = target.energy;
      effect.workRestTriggered = true;
      game.logs.push(
        `⚖️ ${player.name} 对 ${target.name} 使用【摸鱼传染】，触发【劳逸结合】！${target.name} 获得 ${SLACK_ENERGY_DELTA} 精力`
      );
      usedText = `对 ${target.name} 使用摸鱼传染（对方劳逸结合，对方获得 ${SLACK_ENERGY_DELTA} 精力）`;
      hitNote = {
        cardId,
        role: "hit",
        text: `有人对你使用摸鱼传染，劳逸结合生效：获得 ${SLACK_ENERGY_DELTA} 精力`,
      };
      notifyTargetMsg = hitNote.text;
    } else {
      target.energy = target.energy - SLACK_ENERGY_DELTA;
      if (!target.slackedBy) target.slackedBy = [];
      if (!target.slackEnergyLost) target.slackEnergyLost = [];
      target.slackedBy.push(player.id);
      target.slackEnergyLost.push(SLACK_ENERGY_DELTA);
      const negativeEnergy = handleInvestmentAfterBookEnergyNegative(game, target.id);
      if (negativeEnergy.unlocked) {
        effect.investmentAutoUnlocked = true;
        slackInvestmentAutoUnlocked = true;
      }
      effect.energyDelta = -SLACK_ENERGY_DELTA;
      effect.energyAfter = target.energy;
      effect.workRestTriggered = false;
      game.logs.push(
        `💤 ${player.name} 对 ${target.name} 使用【摸鱼传染】，${target.name} 精力 -${SLACK_ENERGY_DELTA}`
      );
      usedText = `对 ${target.name} 使用摸鱼传染（对方精力 -${SLACK_ENERGY_DELTA}）`;
      const slackHitBase = `有人对你使用摸鱼传染，精力 -${SLACK_ENERGY_DELTA}`;
      const unlockSuffix =
        "你已自动解锁投资方案，精力已退回，请调整后重新提交。";
      hitNote = {
        cardId,
        role: "hit",
        text: negativeEnergy.unlocked ? `${slackHitBase}。${unlockSuffix}` : slackHitBase,
      };
      notifyTargetMsg = hitNote.text;
    }
    if (!target.pendingSlackHits) target.pendingSlackHits = [];
    target.pendingSlackHits.push({
      id: randomUUID(),
      fromName: target.id === player.id ? "你自己" : "有人",
      energyDelta: workRestActive ? SLACK_ENERGY_DELTA : -SLACK_ENERGY_DELTA,
      energyAfter: target.energy,
      ...(slackInvestmentAutoUnlocked ? { investmentAutoUnlocked: true } : {}),
    });
    notifyTargetId = target.id;
    // 自用摸鱼：不 push slack hit（含劳逸结合 +8）；弹窗靠 pendingSlackHits，说明在 result.msg
    if (target.id === player.id) {
      hitNote = undefined;
      notifyTargetId = undefined;
      notifyTargetMsg = undefined;
    }
    roundPlayEnergyDeltas = [
      {
        playerId: target.id,
        delta: workRestActive ? SLACK_ENERGY_DELTA : -SLACK_ENERGY_DELTA,
      },
    ];
  } else if (cardId === WORK_REST_CARD_ID) {
    const targetId = params.targetPlayerId ?? player.id;
    const target = game.players.find((p) => p.id === targetId);
    if (!target) return { success: false, msg: "未指定目标玩家" };

    const pending = Math.max(target.slackEnergyLost?.length ?? 0, target.slackedBy?.length ?? 0);
    let restored = 0;
    if (pending > 0) {
      const lost = target.slackEnergyLost ?? [];
      for (let i = 0; i < pending; i++) {
        const deducted = lost[i] ?? SLACK_ENERGY_DELTA;
        restored += deducted + SLACK_ENERGY_DELTA;
      }
      target.energy += restored;
      target.slackedBy = [];
      target.slackEnergyLost = [];
      target.pendingSlackHits = [];
      effect.restoredEnergy = restored;
      effect.slackHitsResolved = pending;
      effect.energyAfter = target.energy;
    }

    ensureWorkRestPassive(target, playId);
    effect.workRestGranted = true;
    effect.targetPlayerId = target.id;
    if (restored > 0) {
      roundPlayEnergyDeltas = [{ playerId: target.id, delta: restored }];
    }

    const passiveHint = "本卡生效轮次内被摸鱼传染 +8 精力"; // 用语同 buffCards BUFF_COPY_*
    if (target.id === player.id) {
      if (pending > 0) {
        usedText = `为自己发动劳逸结合（改判 ${pending} 次摸鱼，精力 +${restored}；${passiveHint}）`;
        game.logs.push(
          `⚖️ ${player.name} 为自己发动【劳逸结合】，改判 ${pending} 次摸鱼（精力 +${restored}）`
        );
      } else {
        usedText = `为自己发动劳逸结合（${passiveHint}）`;
        game.logs.push(`⚖️ ${player.name} 为自己发动【劳逸结合】`);
      }
    } else {
      if (pending > 0) {
        usedText = `对 ${target.name} 发动劳逸结合（改判摸鱼，其精力 +${restored}；${passiveHint}）`;
        game.logs.push(
          `⚖️ ${player.name} 对 ${target.name} 发动【劳逸结合】，改判 ${pending} 次摸鱼（精力 +${restored}）`
        );
      } else {
        usedText = `对 ${target.name} 发动劳逸结合（${passiveHint}）`;
        game.logs.push(`⚖️ ${player.name} 对 ${target.name} 发动【劳逸结合】`);
      }
      hitNote = {
        cardId: WORK_REST_CARD_ID,
        role: "hit",
        text: `${player.name} 为你发动了劳逸结合，${passiveHint}${pending > 0 ? `（改判摸鱼，精力 +${restored}）` : ""}`,
      };
      notifyTargetId = target.id;
      notifyTargetMsg = hitNote.text;
    }
  } else if (cardId === SHORT_CARD_ID) {
    const project = game.activeProjects.find((p) => p.id === params.targetProjectId);
    if (!project) return { success: false, msg: "请选择可投入项目" };
    game.logs.push(`📉 ${player.name} 对「${project.name}」使用【项目做空】，结算时已积累精力清零，已入账财富不追回`);
    usedText = `做空「${project.name}」（结算时已积累精力清零，已入账财富不追回）`;
  } else if (cardId === LIGHTER_CARD_ID) {
    const target = game.players.find((p) => p.id === params.targetPlayerId);
    if (!target) return { success: false, msg: "未指定烧毁目标玩家" };
    if (target.id === player.id) return { success: false, msg: "打火机不能烧毁自己的卡" };
    const burnId = typeof params.burnCardId === "string" ? params.burnCardId : "";
    if (!burnId) return { success: false, msg: "未指定要烧毁的卡" };
    const cardMeta = buffCards.find((c) => c.id === burnId);
    if (!cardMeta || RETIRED_CARD_IDS.has(burnId) || burnId === LIGHTER_CARD_ID) {
      return { success: false, msg: "未知或不可烧毁的卡" };
    }

    if (!game.lighterBurnDeclarations) game.lighterBurnDeclarations = [];
    game.lighterBurnDeclarations.push({
      id: randomUUID(),
      casterId: player.id,
      casterName: player.name,
      targetPlayerId: target.id,
      burnCardId: burnId,
    });
    effect.burnCardId = burnId;
    effect.deferredToSettlement = true;

    const burnedName = cardMeta.name;
    usedText = `对${target.name}使用打火机，指定【${burnedName}】（结算时判定）`;
    game.logs.push(`🔥 ${player.name} 对 ${target.name} 使用【打火机】，指定【${burnedName}】`);
  } else if (cardId === FORCE_BUY_CARD_ID) {
    return { success: false, msg: "强买强卖请在拍卖阶段对当前焦点卡使用" };
  } else if (cardId === "buff_lottery" || cardId === "buff_gold" || cardId === "buff_insurance") {
    game.logs.push(`🃏 ${player.name} 使用了卡牌【${cardDef.name}】，将在结算或开奖时生效`);
    usedText = `使用【${cardDef.name}】（待结算/开奖生效）`;
  } else {
    return { success: false, msg: "未知或不可用的道具" };
  }

  player.inventory.splice(cardIndex, 1);
  if (cardId !== LIGHTER_CARD_ID && cardId !== WORK_REST_CARD_ID) {
    player.activeBuffs.push(buff);
  }

  if (cardId !== LIGHTER_CARD_ID) {
    appendRoundBuffPlay(game, {
      playId,
      ownerId: player.id,
      cardId,
      targetPlayerId: params.targetPlayerId,
      targetProjectId: params.targetProjectId,
      energyDeltas: roundPlayEnergyDeltas,
    });
  }

  pushNote(player, { cardId, role: "used", text: usedText });
  if (hitNote && notifyTargetId) {
    const hitPlayer = game.players.find((p) => p.id === notifyTargetId);
    if (hitPlayer) pushNote(hitPlayer, hitNote);
  }

  appendSessionEvent(
    game,
    "buff_used",
    {
      cardId,
      targetPlayerId: params.targetPlayerId ?? null,
      targetProjectId: params.targetProjectId ?? null,
      success: true,
      ...effect,
    },
    playerId
  );

  return {
    success: true,
    msg: usedText,
    notifyTargetId,
    notifyTargetMsg,
    investmentAutoUnlocked: effect.investmentAutoUnlocked === true,
  };
}

/** 本人确认最早一条摸鱼提示 */
export function ackSlackHit(game: GameState, playerId: string, hitId: unknown): boolean {
  const player = game.players.find((p) => p.id === playerId);
  const hits = player?.pendingSlackHits;
  if (!player || !hits?.length) return false;
  const idx = typeof hitId === "string" ? hits.findIndex((h) => h.id === hitId) : 0;
  if (idx < 0) return false;
  hits.splice(idx, 1);
  return true;
}

/** 拍卖阶段：强买强卖 */
export function useForceBuyCard(
  game: GameState,
  playerId: string
): UseBuffResult {
  if (game.phase !== "AUCTION") {
    return { success: false, msg: "仅拍卖阶段可使用强买强卖" };
  }
  const player = game.players.find((p) => p.id === playerId);
  if (!player) return { success: false, msg: "玩家不存在" };

  const cardIndex = player.inventory.indexOf(FORCE_BUY_CARD_ID);
  if (cardIndex === -1) return { success: false, msg: "你没有强买强卖" };

  if ((game.forceBuyUsedPlayerIds ?? []).includes(playerId)) {
    return { success: false, msg: "该卡牌（强买强卖）只能用一次" };
  }

  const focusId = game.auctionFocusCardId;
  if (!focusId) return { success: false, msg: "现在没有正在拍的卡" };
  if (focusId === FORCE_BUY_CARD_ID) {
    return { success: false, msg: "不能强买强卖本身" };
  }
  if (!isAuctionCardAvailable(game, focusId)) {
    return { success: false, msg: "焦点卡已不在拍卖池中" };
  }

  player.inventory.splice(cardIndex, 1);
  player.inventory.push(focusId);
  markAuctionCardDistributed(game, focusId);
  recordAuctionCompletedDeal(game, focusId, player.id, 0, "force_buy");
  if (!game.forceBuyUsedPlayerIds) game.forceBuyUsedPlayerIds = [];
  game.forceBuyUsedPlayerIds.push(playerId);
  afterForceBuyOnFocus(game, focusId);

  const focusName = buffCards.find((c) => c.id === focusId)?.name || focusId;
  const text = `强买强卖：免费获得【${focusName}】`;
  game.logs.push(`🤝 ${player.name} 使用【强买强卖】，免费获得【${focusName}】`);
  pushNote(player, { cardId: FORCE_BUY_CARD_ID, role: "used", text });
  if (!player.usedCards) player.usedCards = [];
  player.usedCards.push(FORCE_BUY_CARD_ID);

  appendSessionEvent(
    game,
    "buff_used",
    { cardId: FORCE_BUY_CARD_ID, focusCardId: focusId, success: true },
    playerId
  );

  return {
    success: true,
    msg: text,
    auctionSold: {
      cardId: focusId,
      playerId: player.id,
      cost: 0,
      source: "force_buy",
    },
  };
}
