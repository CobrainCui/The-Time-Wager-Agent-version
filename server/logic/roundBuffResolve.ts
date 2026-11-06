import { randomUUID } from "node:crypto";
import {
  GameState,
  LighterBurnNotice,
  Player,
  RoundBuffPlayRecord,
} from "../state/gameState.js";
import { buffCards } from "../data/game_data.js";
import {
  GOLD_CARD_ID,
  LIGHTER_CARD_ID,
  SLACK_CARD_ID,
  SLACK_ENERGY_DELTA,
  WORK_REST_CARD_ID,
} from "./buffLogic.js";
import { LOTTERY_CARD_ID, removeLotteryBuff } from "./lotterySettle.js";

const RETIRED = new Set(["buff_spirit", "buff_rebound"]);

export function appendRoundBuffPlay(
  game: GameState,
  record: Omit<RoundBuffPlayRecord, "voided">
): void {
  if (!game.roundBuffPlays) game.roundBuffPlays = [];
  game.roundBuffPlays.push({ ...record, voided: false });
}

function cardName(cardId: string): string {
  return buffCards.find((c) => c.id === cardId)?.name ?? cardId;
}

function pushLighterNotice(player: Player, notice: LighterBurnNotice): void {
  if (!player.pendingLighterBurnNotices) player.pendingLighterBurnNotices = [];
  player.pendingLighterBurnNotices.push(notice);
}

function removeOneActiveBuff(player: Player, cardId: string): boolean {
  const idx = player.activeBuffs.findIndex((b) => b.cardId === cardId);
  if (idx === -1) return false;
  player.activeBuffs.splice(idx, 1);
  return true;
}

function voidPlayRecord(game: GameState, play: RoundBuffPlayRecord): {
  energyRefund: number;
  wealthRefund: number;
} {
  if (play.voided) return { energyRefund: 0, wealthRefund: 0 };
  play.voided = true;
  let energyRefund = 0;

  // 摸鱼已被劳逸结合改判：打火机作废这次摸鱼时，必须同步撤销对应的 +8 改判，
  // 否则会出现「-8 被返还 + 劳逸仍给 +16」的双倍收益。
  if (play.cardId === SLACK_CARD_ID && play.convertedByPlayId) {
    const victimId = play.targetPlayerId ?? play.ownerId;
    const workRestPlay = (game.roundBuffPlays ?? []).find(
      (p) => p.playId === play.convertedByPlayId
    );
    if (workRestPlay && !workRestPlay.voided) {
      const slackDelta =
        play.energyDeltas.find((d) => d.playerId === victimId)?.delta ?? -SLACK_ENERGY_DELTA;
      const deducted = Math.max(0, -slackDelta);
      const convertAmount = deducted + SLACK_ENERGY_DELTA;
      const entry = workRestPlay.energyDeltas.find((d) => d.playerId === victimId);
      if (entry) entry.delta -= convertAmount;
      const victim = game.players.find((p) => p.id === victimId);
      if (victim) victim.energy -= convertAmount;
      energyRefund -= convertAmount;
      workRestPlay.convertedSlackPlayIds = (workRestPlay.convertedSlackPlayIds ?? []).filter(
        (id) => id !== play.playId
      );
    }
  }

  // 再回滚这张卡本身的精力变化
  for (const d of play.energyDeltas) {
    const p = game.players.find((x) => x.id === d.playerId);
    if (!p) continue;
    p.energy -= d.delta;
    energyRefund += -d.delta;
  }
  let wealthRefund = 0;
  if (play.wealthCredited && play.wealthCredited > 0) {
    const owner = game.players.find((x) => x.id === play.ownerId);
    if (owner) {
      owner.wealth -= play.wealthCredited;
      wealthRefund = play.wealthCredited;
    }
  }
  if (play.cardId === SLACK_CARD_ID) {
    play.passiveWorkRestInstanceId = undefined;
    const victimId = play.targetPlayerId;
    if (victimId) {
      const victim = game.players.find((p) => p.id === victimId);
      if (victim) {
        // 只重建仍未作废、且尚未被劳逸结合的摸鱼记录，不能一把清空其它摸鱼。
        const remaining = (game.roundBuffPlays ?? []).filter(
          (p) =>
            !p.voided &&
            p.cardId === SLACK_CARD_ID &&
            p.targetPlayerId === victimId &&
            !p.convertedByPlayId
        );
        victim.slackedBy = remaining.map((p) => p.ownerId);
        victim.slackEnergyLost = remaining.map((p) => {
          const delta =
            p.energyDeltas.find((d) => d.playerId === victimId)?.delta ??
            -SLACK_ENERGY_DELTA;
          return Math.max(0, -delta);
        });
        const before = victim.pendingSlackHits?.length ?? 0;
        let hits = (victim.pendingSlackHits ?? []).filter(
          (h) => h.sourcePlayId !== play.playId
        );
        // 旧局提示没有 sourcePlayId：按剩余摸鱼数量裁剪最早的多余提示
        if (hits.length === before && hits.length > remaining.length) {
          hits = hits.slice(0, remaining.length);
        }
        victim.pendingSlackHits = hits;
        if (energyRefund !== 0) {
          if (!victim.buffRoundNotes) victim.buffRoundNotes = [];
          victim.buffRoundNotes.push({
            cardId: SLACK_CARD_ID,
            role: "hit",
            text:
              energyRefund > 0
                ? `打火机作废了相关摸鱼，你的精力恢复 +${energyRefund}`
                : `打火机作废了相关摸鱼，你的精力调整 ${energyRefund}`,
          });
        }
      }
    }
  }
  if (play.cardId === WORK_REST_CARD_ID) {
    // 若摸鱼是在这张劳逸结合被动生效期间打出的，作废劳逸后摸鱼应恢复为 -8。
    for (const slackPlay of game.roundBuffPlays ?? []) {
      if (
        slackPlay.voided ||
        slackPlay.cardId !== SLACK_CARD_ID ||
        slackPlay.passiveWorkRestInstanceId !== play.playId
      ) {
        continue;
      }
      const victimId = slackPlay.targetPlayerId;
      const entry = slackPlay.energyDeltas.find((d) => d.playerId === victimId);
      if (entry && entry.delta !== -SLACK_ENERGY_DELTA) {
        const adjustment = -SLACK_ENERGY_DELTA - entry.delta;
        entry.delta = -SLACK_ENERGY_DELTA;
        const victim = game.players.find((p) => p.id === victimId);
        if (victim) victim.energy += adjustment;
        energyRefund += adjustment;
      }
      slackPlay.passiveWorkRestInstanceId = undefined;
    }
    // 劳逸结合被作废：把已改判的摸鱼恢复为“未改判”，之后仍可被新的劳逸结合处理。
    for (const slackPlayId of play.convertedSlackPlayIds ?? []) {
      const slackPlay = (game.roundBuffPlays ?? []).find((p) => p.playId === slackPlayId);
      if (slackPlay && !slackPlay.voided) slackPlay.convertedByPlayId = undefined;
    }
    play.convertedSlackPlayIds = [];
  }
  if (play.cardId === LOTTERY_CARD_ID) {
    const owner = game.players.find((x) => x.id === play.ownerId);
    if (owner) removeLotteryBuff(owner);
    game.pendingLotteryOffers = (game.pendingLotteryOffers ?? []).filter(
      (o) => o.playerId !== play.ownerId
    );
    // 即使奖金为 0，也要撤掉已开奖记录，避免导出留下一条已被作废的彩票
    game.lotteryCompletedDeals = (game.lotteryCompletedDeals ?? []).filter(
      (d) => d.playerId !== play.ownerId
    );
  }
  return { energyRefund, wealthRefund };
}

function findPlayedBurnTarget(
  game: GameState,
  target: Player,
  burnCardId: string
): "activeBuff" | "roundPlay" | null {
  if (target.activeBuffs.some((b) => b.cardId === burnCardId)) return "activeBuff";
  const plays = game.roundBuffPlays ?? [];
  if (
    plays.some(
      (p) =>
        !p.voided &&
        p.cardId === burnCardId &&
        (p.ownerId === target.id || p.targetPlayerId === target.id)
    )
  ) {
    return "roundPlay";
  }
  return null;
}

function voidPlayedCardOnPlayer(
  game: GameState,
  target: Player,
  burnCardId: string
): { energyRefund: number; wealthRefund: number } {
  const play = (game.roundBuffPlays ?? []).find(
    (p) =>
      !p.voided &&
      p.cardId === burnCardId &&
      (p.ownerId === target.id || p.targetPlayerId === target.id)
  );
  if (play) {
    // buff 可能挂在施放者或实际受益者身上（如摸鱼挂在施放者、劳逸结合挂在目标），
    // 两个位置都尝试移除一张，避免残留 activeBuff。
    const bearerIds = [play.targetPlayerId, play.ownerId].filter(
      (id): id is string => typeof id === "string" && id.length > 0
    );
    for (const bearerId of new Set(bearerIds)) {
      const bearer = game.players.find((p) => p.id === bearerId);
      if (bearer && removeOneActiveBuff(bearer, burnCardId)) break;
    }
    return voidPlayRecord(game, play);
  }
  if (removeOneActiveBuff(target, burnCardId)) {
    return { energyRefund: 0, wealthRefund: 0 };
  }
  return { energyRefund: 0, wealthRefund: 0 };
}

function resolveOneLighter(
  game: GameState,
  decl: { casterName: string; targetPlayerId: string; burnCardId: string }
): boolean {
  const target = game.players.find((p) => p.id === decl.targetPlayerId);
  if (!target) return false;
  const burnCardId = decl.burnCardId;
  if (
    RETIRED.has(burnCardId) ||
    burnCardId === LIGHTER_CARD_ID
  ) {
    return false;
  }

  const playedKind = findPlayedBurnTarget(game, target, burnCardId);
  const inInventory = target.inventory.includes(burnCardId);

  if (playedKind) {
    const { energyRefund, wealthRefund } = voidPlayedCardOnPlayer(
      game,
      target,
      burnCardId
    );
    const name = cardName(burnCardId);
    let message = `${decl.casterName} 的打火机作废了你在本卡生效轮次内打出的【${name}】`; // 用语同 buffCards
    if (energyRefund !== 0) {
      message += `，精力 ${energyRefund > 0 ? "+" : ""}${energyRefund}`;
    }
    if (wealthRefund > 0) {
      message += `，财富 -${wealthRefund}`;
    }
    pushLighterNotice(target, {
      id: randomUUID(),
      cardId: burnCardId,
      cardName: name,
      kind: "played",
      casterName: decl.casterName,
      message,
      energyRefund: energyRefund !== 0 ? energyRefund : undefined,
      wealthRefund: wealthRefund > 0 ? wealthRefund : undefined,
    });
    return true;
  }

  if (inInventory) {
    const name = cardName(burnCardId);
    pushLighterNotice(target, {
      id: randomUUID(),
      cardId: burnCardId,
      cardName: name,
      kind: "inventory",
      casterName: decl.casterName,
      message: `${decl.casterName} 的打火机烧毁了你的【${name}】（确认后从手牌移除）`,
    });
    return true;
  }

  // 没打到任何卡：只告诉被指定者「未烧中」；使用者始终只看到「已使用」。
  const name = cardName(burnCardId);
  pushLighterNotice(target, {
    id: randomUUID(),
    cardId: burnCardId,
    cardName: name,
    kind: "miss",
    casterName: decl.casterName,
    message: `${decl.casterName} 对你使用了打火机，指定【${name}】，但没有烧掉你的任何卡`,
  });
  return false;
}

/** 结算前：统一处理打火机，作废效果或生成待确认烧毁提示 */
export function resolveRoundBuffsAtSettlement(game: GameState): {
  hits: number;
  misses: number;
} {
  const decls = game.lighterBurnDeclarations ?? [];
  let hits = 0;
  let misses = 0;
  for (const decl of decls) {
    if (resolveOneLighter(game, decl)) hits += 1;
    else misses += 1;
  }
  game.lighterBurnDeclarations = [];
  return { hits, misses };
}

export function ackLighterBurnNotice(
  game: GameState,
  playerId: string,
  noticeId: unknown
): boolean {
  const player = game.players.find((p) => p.id === playerId);
  const notices = player?.pendingLighterBurnNotices;
  if (!player || !notices?.length) return false;
  const idx =
    typeof noticeId === "string"
      ? notices.findIndex((n) => n.id === noticeId)
      : 0;
  if (idx < 0) return false;
  const [notice] = notices.splice(idx, 1);
  if (notice.kind === "inventory") {
    const invIdx = player.inventory.indexOf(notice.cardId);
    if (invIdx !== -1) player.inventory.splice(invIdx, 1);
  }
  return true;
}

/** 彩票入账时登记，便于结算前打火机扣回 */
export function recordLotteryWealthPlay(
  game: GameState,
  ownerId: string,
  playId: string,
  credited: number
): void {
  appendRoundBuffPlay(game, {
    playId,
    ownerId,
    cardId: LOTTERY_CARD_ID,
    energyDeltas: [],
    wealthCredited: credited,
  });
}
