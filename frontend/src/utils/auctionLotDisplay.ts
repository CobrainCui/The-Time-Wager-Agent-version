export type AuctionLotSource = "hammer" | "force_buy";

export function normalizeAuctionLotSource(source?: AuctionLotSource): AuctionLotSource {
  return source === "force_buy" ? "force_buy" : "hammer";
}

export function resolveAuctionLotSource(cost: number, source?: AuctionLotSource): AuctionLotSource {
  if (source === "force_buy" || source === "hammer") return source;
  // 旧档无 source：本场强买固定 cost=0，落槌成交价至少为起拍价 5
  return cost === 0 ? "force_buy" : "hammer";
}

/** 看板上的价格/方式文案 */
export function formatAuctionLotPrice(cost: number, source?: AuctionLotSource): string {
  if (resolveAuctionLotSource(cost, source) === "force_buy") return "强买强卖";
  return `${cost}`;
}
