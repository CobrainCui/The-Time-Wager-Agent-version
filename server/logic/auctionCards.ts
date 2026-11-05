import { randomUUID } from "node:crypto";
import {
  AuctionBidRecord,
  AuctionBidStatus,
  AuctionCompletedDeal,
  AuctionOffer,
  GameState,
} from "../state/gameState.js";
import { buffCards } from "../data/game_data.js";

export type PublicAuctionSoldSource = "hammer" | "force_buy";

export function normalizeAuctionSoldSource(
  source?: AuctionCompletedDeal["source"]
): PublicAuctionSoldSource {
  return source === "force_buy" ? "force_buy" : "hammer";
}

export function formatAuctionSoldMessage(
  game: GameState,
  deal: {
    cardId: string;
    playerId: string;
    cost: number;
    source?: AuctionCompletedDeal["source"];
  }
): string {
  const cardName = buffCards.find((c) => c.id === deal.cardId)?.name ?? deal.cardId;
  const playerName = game.players.find((p) => p.id === deal.playerId)?.name ?? deal.playerId;
  if (normalizeAuctionSoldSource(deal.source) === "force_buy") {
    return `【${cardName}】强买强卖 · ${playerName}`;
  }
  return `【${cardName}】成交 · ${playerName} · ${deal.cost}`;
}

export const AUCTION_CARD_IDS_BY_ROUND: Record<number, string[]> = {
  1: ["buff_insurance", "buff_gold", "buff_slack", "buff_work_rest"],
  2: ["buff_force_buy", "buff_slack", "buff_work_rest", "buff_short"],
  3: ["buff_lighter", "buff_lottery", "buff_slack", "buff_work_rest"],
};

export const AUCTION_STARTING_BID = 5;
export const AUCTION_BID_INCREMENT = 5;

export function getAuctionRound(game: GameState): number {
  return Math.max(1, Math.min(game.currentEra - 1, 3));
}

export function getAuctionCardIdsForGame(game: GameState): string[] {
  const round = getAuctionRound(game);
  return AUCTION_CARD_IDS_BY_ROUND[round] || AUCTION_CARD_IDS_BY_ROUND[1];
}

export function findCompletedDealForSession(
  game: GameState,
  cardId: string
): AuctionCompletedDeal | undefined {
  const round = getAuctionRound(game);
  const deals = game.auctionCompletedDeals ?? [];
  const forRound = deals.find((d) => d.cardId === cardId && d.auctionRound === round);
  if (forRound) return forRound;
  if ((game.auctionDistributedCardIds ?? []).includes(cardId)) {
    return deals.find((d) => d.cardId === cardId && d.auctionRound == null);
  }
  return undefined;
}

export function recordAuctionCompletedDeal(
  game: GameState,
  cardId: string,
  playerId: string,
  cost: number,
  source: "hammer" | "force_buy" = "hammer"
): void {
  const round = getAuctionRound(game);
  if (!game.auctionCompletedDeals) game.auctionCompletedDeals = [];
  game.auctionCompletedDeals = game.auctionCompletedDeals.filter(
    (d) => !(d.cardId === cardId && d.auctionRound === round)
  );
  game.auctionCompletedDeals.push({ cardId, playerId, cost, source, auctionRound: round });
}

export function unmarkAuctionCardDistributed(game: GameState, cardId: string): void {
  game.auctionDistributedCardIds = (game.auctionDistributedCardIds || []).filter((id) => id !== cardId);
}

export function markAuctionCardDistributed(game: GameState, cardId: string): void {
  if (!game.auctionDistributedCardIds) game.auctionDistributedCardIds = [];
  if (!game.auctionDistributedCardIds.includes(cardId)) {
    game.auctionDistributedCardIds.push(cardId);
  }
}

export function isAuctionCardAvailable(game: GameState, cardId: string): boolean {
  const pool = getAuctionCardIdsForGame(game);
  if (!pool.includes(cardId)) return false;
  return !(game.auctionDistributedCardIds || []).includes(cardId);
}

export function isValidAuctionCost(cost: unknown): cost is number {
  return typeof cost === "number" && Number.isSafeInteger(cost) && cost >= 0;
}

export function isSafeIntegerWealth(wealth: unknown): wealth is number {
  return typeof wealth === "number" && Number.isSafeInteger(wealth);
}

export function ensureAuctionBids(game: GameState): AuctionBidRecord[] {
  if (!game.auctionBids) game.auctionBids = [];
  return game.auctionBids;
}

/** 当前正在拍的卡上的领先出价 */
export function getLeadingBidOnFocus(game: GameState): AuctionBidRecord | undefined {
  const focusId = game.auctionFocusCardId;
  if (!focusId) return undefined;
  return (game.auctionBids ?? []).find((b) => b.cardId === focusId && b.status === "leading");
}

/** 现在最高价；还没人出价时为 0 */
export function getLotCurrentBid(game: GameState): number {
  return getLeadingBidOnFocus(game)?.amount ?? 0;
}

/** 至少要出到：没人出价时为起拍价，否则现在最高价 + 加价幅度 */
export function getMinimumNextBid(game: GameState): number {
  const leading = getLeadingBidOnFocus(game);
  if (!leading) return AUCTION_STARTING_BID;
  return leading.amount + AUCTION_BID_INCREMENT;
}

export function getOpenBidsOnCard(game: GameState, cardId: string): AuctionBidRecord[] {
  return (game.auctionBids ?? []).filter(
    (b) => b.cardId === cardId && (b.status === "leading" || b.status === "outbid")
  );
}

export function voidOpenBidsOnCard(
  game: GameState,
  cardId: string,
  status: Extract<AuctionBidStatus, "void_passed" | "void_force_buy" | "void_lot_changed">
): number {
  let n = 0;
  for (const b of ensureAuctionBids(game)) {
    if (b.cardId !== cardId) continue;
    if (b.status === "leading" || b.status === "outbid") {
      b.status = status;
      n += 1;
    }
  }
  return n;
}

/** 顺序里下一张仍可拍的卡；fromCardId 之后找，找不到则从头找 */
export function findNextAvailableAuctionCard(
  game: GameState,
  fromCardId?: string | null
): string | undefined {
  const pool = getAuctionCardIdsForGame(game);
  const available = pool.filter((id) => isAuctionCardAvailable(game, id));
  if (available.length === 0) return undefined;
  if (!fromCardId) return available[0];
  const idx = pool.indexOf(fromCardId);
  if (idx < 0) return available[0];
  for (let i = idx + 1; i < pool.length; i++) {
    if (isAuctionCardAvailable(game, pool[i])) return pool[i];
  }
  // 绕回开头（跳过前面的卡后，后面可能还有未拍的）
  for (let i = 0; i < idx; i++) {
    if (isAuctionCardAvailable(game, pool[i])) return pool[i];
  }
  return undefined;
}

export function advanceAuctionFocus(game: GameState, fromCardId?: string | null): string | undefined {
  const next = findNextAvailableAuctionCard(game, fromCardId ?? game.auctionFocusCardId);
  game.auctionFocusCardId = next;
  return next;
}

/** 作废所有未落槌的出价（换场次 / 结束拍卖前） */
export function voidAllOpenAuctionBids(
  game: GameState,
  status: Extract<AuctionBidStatus, "void_passed" | "void_force_buy" | "void_lot_changed"> = "void_lot_changed"
): void {
  for (const b of ensureAuctionBids(game)) {
    if (b.status === "leading" || b.status === "outbid") {
      b.status = status;
    }
  }
}

export function beginAuctionSession(game: GameState): void {
  // 保留历史出价与成交供导出；仅作废未完成的出价并重置本场池状态
  voidAllOpenAuctionBids(game, "void_lot_changed");
  game.auctionDistributedCardIds = [];
  game.pendingAuctionOffers = [];
  game.forceBuyUsedPlayerIds = [];
  // 开场不默认正在拍：由主持手动点「改成拍这张」
  game.auctionFocusCardId = undefined;
}

/**
 * 主持改成拍另一张：先作废当前卡未成交出价，再切换。
 * cardId 为空则清空焦点。
 */
export function setAuctionFocusCard(
  game: GameState,
  cardId: string | null | undefined
): { ok: true } | { ok: false; message: string } {
  if (game.phase !== "AUCTION") {
    return { ok: false, message: "现在不能改正在拍的卡" };
  }
  const prev = game.auctionFocusCardId;
  if (cardId == null || cardId === "") {
    if (prev) voidOpenBidsOnCard(game, prev, "void_lot_changed");
    game.auctionFocusCardId = undefined;
    return { ok: true };
  }
  if (!isAuctionCardAvailable(game, cardId)) {
    return { ok: false, message: "只能改成还没拍掉的卡" };
  }
  if (prev && prev !== cardId) {
    voidOpenBidsOnCard(game, prev, "void_lot_changed");
  }
  game.auctionFocusCardId = cardId;
  return { ok: true };
}

/** 该玩家待确认报价已预占财富（旧流程残留） */
export function playerAuctionReservedWealth(
  game: GameState,
  playerId: string,
  opts?: { exceptOfferId?: string; exceptCardId?: string }
): number {
  const pending = game.pendingAuctionOffers ?? [];
  let sum = 0;
  for (const o of pending) {
    if (o.playerId !== playerId) continue;
    if (opts?.exceptOfferId && o.offerId === opts.exceptOfferId) continue;
    if (opts?.exceptCardId && o.cardId === opts.exceptCardId) continue;
    if (isValidAuctionCost(o.cost)) sum += o.cost;
  }
  return sum;
}

/** 本人在当前正在拍的卡上暂时领先的出价（占用可用财富） */
export function playerLeadingBidReservedWealth(
  game: GameState,
  playerId: string,
  opts?: { exceptOwnLeading?: boolean }
): number {
  if (opts?.exceptOwnLeading) return 0;
  const leading = getLeadingBidOnFocus(game);
  if (!leading || leading.playerId !== playerId) return 0;
  return leading.amount;
}

/** 该玩家未完成转出合计（对方收下前不扣账面，但占用可用财富） */
export function playerPendingTransferOutWealth(game: GameState, playerId: string): number {
  let sum = 0;
  for (const tx of game.transactions) {
    if (tx.status !== "pending" || tx.fromId !== playerId) continue;
    if (typeof tx.amount === "number" && Number.isSafeInteger(tx.amount) && tx.amount > 0) {
      sum += tx.amount;
    }
  }
  return sum;
}

/**
 * 可用财富 = 账面 − 待确认旧报价 − 领先出价占用 − 未完成转出。
 * exceptOwnLeading：自己继续加价时不把当前领先算进占用。
 */
export function playerAuctionAvailableWealth(
  game: GameState,
  player: { id: string; wealth: number },
  opts?: { exceptOfferId?: string; exceptCardId?: string; exceptOwnLeading?: boolean }
): number {
  if (!isSafeIntegerWealth(player.wealth)) return 0;
  const reserved =
    playerAuctionReservedWealth(game, player.id, opts) +
    playerLeadingBidReservedWealth(game, player.id, {
      exceptOwnLeading: opts?.exceptOwnLeading,
    }) +
    playerPendingTransferOutWealth(game, player.id);
  return Math.max(0, player.wealth - reserved);
}

/** 转账与拍卖共用的可用额 */
export function playerAvailableWealth(
  game: GameState,
  player: { id: string; wealth: number }
): number {
  return playerAuctionAvailableWealth(game, player);
}

/** 玩家可见的占用说明；没有占用返回空串（含前导逗号，便于拼进错误句） */
export function formatPlayerHoldSuffix(
  game: GameState,
  playerId: string,
  opts?: { exceptOfferId?: string; exceptCardId?: string; exceptOwnLeading?: boolean }
): string {
  const leading = playerLeadingBidReservedWealth(game, playerId, opts);
  const offers = playerAuctionReservedWealth(game, playerId, opts);
  const pending = playerPendingTransferOutWealth(game, playerId);
  const parts: string[] = [];
  if (leading > 0) parts.push(`领先出价 ${leading}`);
  if (offers > 0) parts.push(`待确认报价 ${offers}`);
  if (pending > 0) parts.push(`待对方确认的转账 ${pending}`);
  if (parts.length === 0) return "";
  return `，另占用 ${parts.join("、")}`;
}

export function placeAuctionBid(
  game: GameState,
  playerId: string,
  amount: unknown
):
  | { ok: true; bid: AuctionBidRecord; outbidPlayerId?: string }
  | { ok: false; message: string } {
  if (game.phase !== "AUCTION") {
    return { ok: false, message: "现在不能出价" };
  }
  const focusId = game.auctionFocusCardId;
  if (!focusId) {
    return { ok: false, message: "现在没有正在拍的卡" };
  }
  if (!isAuctionCardAvailable(game, focusId)) {
    return { ok: false, message: "这张卡已经拍掉了" };
  }
  const player = game.players.find((p) => p.id === playerId);
  if (!player || player.isAI) {
    return { ok: false, message: "无法出价" };
  }
  const prevLeading = getLeadingBidOnFocus(game);
  // 对标公开增价拍卖：暂时领先的人不必再加价
  if (prevLeading && prevLeading.playerId === playerId) {
    return { ok: false, message: "你已暂时领先，无需再出" };
  }
  if (typeof amount !== "number" || !Number.isSafeInteger(amount) || amount < 0) {
    return { ok: false, message: "出价必须是整数" };
  }
  const bidAmount = amount;
  const minNext = getMinimumNextBid(game);
  if (bidAmount < minNext) {
    return { ok: false, message: `至少要出到 ${minNext}` };
  }
  const available = playerAuctionAvailableWealth(game, player, { exceptOwnLeading: true });
  if (bidAmount > available) {
    return {
      ok: false,
      message: `可用财富不够（可用 ${available}${formatPlayerHoldSuffix(game, player.id, {
        exceptOwnLeading: true,
      })}）`,
    };
  }

  let outbidPlayerId: string | undefined;
  if (prevLeading) {
    prevLeading.status = "outbid";
    outbidPlayerId = prevLeading.playerId;
  }

  const ratio =
    available > 0 ? Math.round((bidAmount / available) * 10000) / 10000 : null;
  const bid: AuctionBidRecord = {
    bidId: randomUUID(),
    auctionRound: getAuctionRound(game),
    cardId: focusId,
    playerId: player.id,
    playerName: player.name,
    amount: bidAmount,
    wealthAtBid: player.wealth,
    availableWealthAtBid: available,
    bidToAvailableRatio: ratio,
    timestamp: Date.now(),
    status: "leading",
  };
  ensureAuctionBids(game).push(bid);
  game.logs.push(`📢 ${player.name} 对 [${focusId}] 出价 ${bidAmount}`);
  return { ok: true, bid, outbidPlayerId };
}

export function hammerAuctionLot(
  game: GameState,
  opts?: { expectedBidId?: string; expectedAmount?: number; expectedPlayerId?: string }
):
  | { ok: true; cardId: string; playerId: string; cost: number; playerName: string }
  | { ok: false; message: string } {
  if (game.phase !== "AUCTION") {
    return { ok: false, message: "现在不能确认成交" };
  }
  const focusId = game.auctionFocusCardId;
  if (!focusId) {
    return { ok: false, message: "现在没有正在拍的卡" };
  }
  if (!isAuctionCardAvailable(game, focusId)) {
    return { ok: false, message: "这张卡已经拍掉了" };
  }
  const leading = getLeadingBidOnFocus(game);
  if (!leading || leading.amount <= 0) {
    return { ok: false, message: "还没有人出价，不能确认成交" };
  }
  if (opts?.expectedBidId && opts.expectedBidId !== leading.bidId) {
    return { ok: false, message: "出价已变化，请再看一眼现在最高价后再确认" };
  }
  if (opts?.expectedAmount != null && opts.expectedAmount !== leading.amount) {
    return { ok: false, message: "出价已变化，请再看一眼现在最高价后再确认" };
  }
  if (opts?.expectedPlayerId && opts.expectedPlayerId !== leading.playerId) {
    return { ok: false, message: "出价最高的人已变化，请再确认" };
  }
  const winner = game.players.find((p) => p.id === leading.playerId);
  if (!winner || !isSafeIntegerWealth(winner.wealth)) {
    return { ok: false, message: "出价最高的人数据异常" };
  }
  // 与出价时同一套可用财富：账面须覆盖领先价，且扣除未完成转出后仍够付
  const spendable = playerAuctionAvailableWealth(game, winner, { exceptOwnLeading: true });
  if (leading.amount > spendable || winner.wealth < leading.amount) {
    return {
      ok: false,
      message: `出价最高的人现在付不起（需付 ${leading.amount}，可用 ${spendable}${formatPlayerHoldSuffix(
        game,
        winner.id,
        { exceptOwnLeading: true }
      )}）。可点「这张先跳过」或等对方处理转账后再试。`,
    };
  }

  winner.wealth -= leading.amount;
  winner.inventory.push(focusId);
  markAuctionCardDistributed(game, focusId);
  recordAuctionCompletedDeal(game, focusId, winner.id, leading.amount, "hammer");
  leading.status = "won";
  game.logs.push(`✅ ${winner.name} 以 ${leading.amount} 财富拍得 [${focusId}]`);
  advanceAuctionFocus(game, focusId);
  return {
    ok: true,
    cardId: focusId,
    playerId: winner.id,
    cost: leading.amount,
    playerName: winner.name,
  };
}

export function passAuctionLot(
  game: GameState
): { ok: true; cardId: string; nextFocusId?: string } | { ok: false; message: string } {
  if (game.phase !== "AUCTION") {
    return { ok: false, message: "现在不能跳过" };
  }
  const focusId = game.auctionFocusCardId;
  if (!focusId) {
    return { ok: false, message: "现在没有正在拍的卡" };
  }
  voidOpenBidsOnCard(game, focusId, "void_passed");
  const next = findNextAvailableAuctionCard(game, focusId);
  if (!next) {
    game.logs.push(`⏭️ [${focusId}] 只剩这一张，当前出价作废，重新从起拍价开始`);
    return { ok: true, cardId: focusId, nextFocusId: focusId };
  }
  game.logs.push(`⏭️ 跳过 [${focusId}]，暂不成交`);
  game.auctionFocusCardId = next;
  return { ok: true, cardId: focusId, nextFocusId: next };
}

/** 强买拿走焦点卡后：作废出价并顺延焦点 */
export function afterForceBuyOnFocus(game: GameState, focusId: string): void {
  voidOpenBidsOnCard(game, focusId, "void_force_buy");
  game.pendingAuctionOffers = (game.pendingAuctionOffers ?? []).filter((o) => o.cardId !== focusId);
  advanceAuctionFocus(game, focusId);
}

/** 公开出价记录（不含可用财富/比例） */
export function publicBidHistoryForCard(
  game: GameState,
  cardId: string | undefined
): {
  bidId: string;
  playerId: string;
  playerName: string;
  amount: number;
  incrementFromPrevious: number;
  timestamp: number;
  status: "leading" | "outbid" | "won" | "void_passed" | "void_force_buy" | "void_lot_changed";
}[] {
  if (!cardId) return [];
  const bids = (game.auctionBids ?? [])
    .filter((b) => b.cardId === cardId)
    .filter((b) => b.status === "leading" || b.status === "outbid")
    .sort((a, b) => a.timestamp - b.timestamp);
  let prevAmount = AUCTION_STARTING_BID;
  const rows = bids.map((b) => {
    const incrementFromPrevious = b.amount - prevAmount;
    prevAmount = b.amount;
    return {
      bidId: b.bidId,
      playerId: b.playerId,
      playerName: b.playerName,
      amount: b.amount,
      incrementFromPrevious,
      timestamp: b.timestamp,
      status: b.status as "leading" | "outbid",
    };
  });
  // 新的在上
  return rows.reverse();
}

export function publicSoldLots(game: GameState): {
  cardId: string;
  playerId: string;
  playerName: string;
  cost: number;
  source: PublicAuctionSoldSource;
}[] {
  const round = getAuctionRound(game);
  const pool = new Set(getAuctionCardIdsForGame(game));
  const distributed = new Set(game.auctionDistributedCardIds ?? []);
  return (game.auctionCompletedDeals ?? [])
    .filter((d) => {
      if (!pool.has(d.cardId) || !distributed.has(d.cardId)) return false;
      if (d.auctionRound != null) return d.auctionRound === round;
      return true;
    })
    .map((d) => ({
      cardId: d.cardId,
      playerId: d.playerId,
      playerName: game.players.find((p) => p.id === d.playerId)?.name ?? d.playerId,
      cost: d.cost,
      source: normalizeAuctionSoldSource(d.source),
    }))
    .reverse();
}

/** 本局全部拍卖成交记录（玩家公开情报；以 auctionCompletedDeals 为准，跨拍卖场保留） */
export function publicSessionAuctionWins(game: GameState): {
  cardId: string;
  playerId: string;
  playerName: string;
  cost: number;
  auctionRound?: number;
  source: PublicAuctionSoldSource;
}[] {
  // 成交记录跨拍卖场保留；distributed 仅表示当前场池内已拍出，新场 begin 会清空
  const sorted = [...(game.auctionCompletedDeals ?? [])].sort((a, b) => {
    const roundDelta = (a.auctionRound ?? 0) - (b.auctionRound ?? 0);
    if (roundDelta !== 0) return roundDelta;
    const cardDelta = a.cardId.localeCompare(b.cardId);
    if (cardDelta !== 0) return cardDelta;
    return a.playerId.localeCompare(b.playerId);
  });
  return sorted.map((d) => ({
    cardId: d.cardId,
    playerId: d.playerId,
    playerName: game.players.find((p) => p.id === d.playerId)?.name ?? d.playerId,
    cost: d.cost,
    auctionRound: d.auctionRound,
    source: normalizeAuctionSoldSource(d.source),
  }));
}

export function buildAuctionLotPublicView(game: GameState) {
  const focusId = game.auctionFocusCardId;
  const leading = getLeadingBidOnFocus(game);
  return {
    auctionStartingBid: AUCTION_STARTING_BID,
    auctionCurrentBid: getLotCurrentBid(game),
    auctionHighBidderId: leading?.playerId ?? null,
    auctionHighBidderName: leading?.playerName ?? null,
    auctionHighBidId: leading?.bidId ?? null,
    auctionMinimumNextBid: focusId ? getMinimumNextBid(game) : AUCTION_STARTING_BID,
    auctionBidHistory: publicBidHistoryForCard(game, focusId),
    auctionSoldLots: publicSoldLots(game),
  };
}

// ——— 旧「填价确认」已下线；仅保留清空逻辑，供旧局/阶段切换清理残留 ———

export function clearAuctionOffers(game: GameState): void {
  game.pendingAuctionOffers = [];
}

export type RevokeAuctionGrantResult =
  | { ok: true; kind: "pending"; playerId: string; offerId: string }
  | { ok: true; kind: "completed"; playerId: string; cost: number }
  | { ok: false; message: string };

function clearAuctionGrantMarkers(game: GameState, cardId: string): void {
  const round = getAuctionRound(game);
  const wasDistributed = (game.auctionDistributedCardIds ?? []).includes(cardId);
  unmarkAuctionCardDistributed(game, cardId);
  game.auctionCompletedDeals = (game.auctionCompletedDeals ?? []).filter((d) => {
    if (d.cardId !== cardId) return true;
    if (d.auctionRound != null) return d.auctionRound !== round;
    return !wasDistributed;
  });
  game.pendingAuctionOffers = (game.pendingAuctionOffers ?? []).filter((o) => o.cardId !== cardId);
}

const FORCE_BUY_CARD_ID = "buff_force_buy";

/** 撤回强买成交：退回强买强卖并解除本场已用标记 */
function restoreForceBuyAfterRevoke(game: GameState, playerId: string): void {
  if (!playerId) return;
  const player = game.players.find((p) => p.id === playerId);
  if (!player) return;
  if (!(player.inventory || []).includes(FORCE_BUY_CARD_ID)) {
    player.inventory.push(FORCE_BUY_CARD_ID);
  }
  game.forceBuyUsedPlayerIds = (game.forceBuyUsedPlayerIds ?? []).filter((id) => id !== playerId);
  const usedIdx = (player.usedCards ?? []).lastIndexOf(FORCE_BUY_CARD_ID);
  if (usedIdx >= 0) player.usedCards.splice(usedIdx, 1);
  if (player.buffRoundNotes?.length) {
    const noteIdx = player.buffRoundNotes.findIndex(
      (n) => n.role === "used" && n.cardId === FORCE_BUY_CARD_ID
    );
    if (noteIdx >= 0) player.buffRoundNotes.splice(noteIdx, 1);
  }
}

function revokeCompletedAuctionGrant(
  game: GameState,
  cardId: string
): { ok: true; playerId: string; cost: number } | { ok: false; message: string } {
  if (!(game.auctionDistributedCardIds || []).includes(cardId)) {
    return { ok: false, message: "该道具没有待确认或已成交记录" };
  }

  const deal = findCompletedDealForSession(game, cardId);
  const cost = deal?.cost ?? 0;
  const dealPlayer = deal ? game.players.find((p) => p.id === deal.playerId) : undefined;
  const holder =
    dealPlayer && (dealPlayer.inventory || []).includes(cardId)
      ? dealPlayer
      : game.players.find((p) => (p.inventory || []).includes(cardId));

  if (!holder) {
    if (dealPlayer && cost > 0) dealPlayer.wealth += cost;
    clearAuctionGrantMarkers(game, cardId);
    if (deal && cost === 0) {
      restoreForceBuyAfterRevoke(game, deal.playerId);
      game.logs.push(
        `↩️ 撤回 [${cardId}]：强买成交已撤销，已退回【强买强卖】并重新开放发放`
      );
    } else {
      game.logs.push(
        deal
          ? `↩️ 撤回 [${cardId}]：成交得主手牌已无该道具，已退款 ${cost} 并重新开放发放`
          : `↩️ 撤回 [${cardId}]：无成交记录且无人持有，已重新开放发放`
      );
    }
    return { ok: true, playerId: dealPlayer?.id ?? "", cost };
  }

  if (!deal) {
    game.logs.push(
      `↩️ 撤回 [${cardId}]：无成交明细，已从 ${holder.name} 收回手牌（退款 0，请核对）`
    );
  }

  const invIdx = holder.inventory.indexOf(cardId);
  holder.inventory.splice(invIdx, 1);
  const refundTarget = dealPlayer ?? holder;
  if (cost > 0) refundTarget.wealth += cost;
  clearAuctionGrantMarkers(game, cardId);
  if (deal && cost === 0) {
    restoreForceBuyAfterRevoke(game, deal.playerId);
    game.logs.push(
      `↩️ 撤回 [${cardId}]：已收回强买所得，退回【强买强卖】给 ${refundTarget.name}，可再次使用`
    );
  }
  return { ok: true, playerId: refundTarget.id, cost };
}

/**
 * 撤回发放：待确认则取消报价；已成交则退款并收手牌。仅拍卖阶段有效。
 */
export function revokeAuctionGrant(game: GameState, cardId: string): RevokeAuctionGrantResult {
  if (game.phase !== "AUCTION") {
    return { ok: false, message: "仅拍卖阶段可撤销发放" };
  }
  const pool = getAuctionCardIdsForGame(game);
  if (!pool.includes(cardId)) {
    return { ok: false, message: "该道具不在本场拍卖池" };
  }

  const offers = game.pendingAuctionOffers ?? [];
  const pendingIdx = offers.findIndex((o) => o.cardId === cardId);
  if (pendingIdx >= 0) {
    const [offer] = offers.splice(pendingIdx, 1);
    game.pendingAuctionOffers = offers;
    return { ok: true, kind: "pending", playerId: offer.playerId, offerId: offer.offerId };
  }

  const completed = revokeCompletedAuctionGrant(game, cardId);
  if (!completed.ok) return completed;
  // 撤回后若当前没有正在拍的卡，自动把这张设回正在拍
  if (!game.auctionFocusCardId && isAuctionCardAvailable(game, cardId)) {
    game.auctionFocusCardId = cardId;
  }
  return { ok: true, kind: "completed", playerId: completed.playerId, cost: completed.cost };
}
