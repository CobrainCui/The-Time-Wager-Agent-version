import { buffCards } from "../data/game_data.js";

export const ALLOWED_BUFF_IMAGE_IDS = new Set(buffCards.map((c) => c.id));

export function isAllowedBuffImageId(id: string): boolean {
  return ALLOWED_BUFF_IMAGE_IDS.has(id);
}
