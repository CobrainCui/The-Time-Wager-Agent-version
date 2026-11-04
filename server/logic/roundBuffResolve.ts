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
    const victimId = play.targetPlayerId;
    if (victimId) {
      const victim = game.players.find((p) => p.id === victimId);
      if (victim) {
        victim.slackedBy = [];
        victim.slackEnergyLost = [];
        victim.pendingSlackHits = [];
        const slackDelta = play.energyDeltas.find((d) => d.playerId === victimId);
        if (slackDelta && slackDelta.delta !== 0) {
          const restored = -slackDelta.delta;
          if (!victim.buffRoundNotes) victim.buffRoundNotes = [];
          victim.buffRoundNotes.push({
            cardId: SLACK_CARD_ID,
            role: "hit",
            text:
              restored > 0
                ? `打火机作废了相关摸鱼，你的精力恢复 +${restored}`
                : `打火机作废了相关摸鱼，你的精力调整 ${restored}`,
          });
        }
      }
    }
  }
  if (play.cardId === LOTTERY_CARD_ID) {
    const owner = game.players.find((x) => x.id === play.ownerId);
    if (owner) removeLotteryBuff(owner);
    game.pendingLotteryOffers = (game.pendingLotteryOffers ?? []).filter(
      (o) => o.playerId !== play.ownerId
    );
    if (play.wealthCredited && play.wealthCredited > 0) {
      game.lotteryCompletedDeals = (game.lotteryCompletedDeals ?? []).filter(
        (d) => d.playerId !== play.ownerId
      );
    }
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
    removeOneActiveBuff(target, burnCardId);
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
