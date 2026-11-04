import { BUFF_AUCTION_REFERENCE_PRICE, BUFF_CARD_DEFS, type BuffCardDef } from "../config/buffCards";

export type BuffDefView = BuffCardDef & { price?: number };

/** 由 catalog 派生，禁止在此手写 desc */
export const BUFF_DEFS: Record<string, BuffDefView> = Object.fromEntries(
  Object.entries(BUFF_CARD_DEFS).map(([id, def]) => [
    id,
    { ...def, price: BUFF_AUCTION_REFERENCE_PRICE[id] },
  ])
) as Record<string, BuffDefView>;
