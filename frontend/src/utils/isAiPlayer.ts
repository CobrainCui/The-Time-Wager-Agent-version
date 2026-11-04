import { Player } from "../types";

/** 与 server/util/isAiPlayer 规则一致 */
export function isAiPlayer(p: Player): boolean {
  if (p.isAI) return true;
  if (p.name.startsWith("🤖") || p.name.startsWith("AI_")) return true;
  if (p.id.startsWith("ai_")) return true;
  if (/^AI\d+$/i.test(p.id) || /^AI\d+$/i.test(p.name)) return true;
  return false;
}
