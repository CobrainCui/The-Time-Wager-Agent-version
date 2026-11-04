import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { AUCTION_CARD_IDS_BY_ROUND } from "./auctionCards.js";

function frontendIdsForRound(src: string, round: number): string[] {
  const marker = `${round}: [`;
  const start = src.indexOf(marker);
  assert.ok(start >= 0, `missing AUCTION_CARDS_BY_ROUND[${round}]`);
  let i = start + marker.length;
  let depth = 1;
  while (i < src.length && depth > 0) {
    const ch = src[i];
    if (ch === "[") depth += 1;
    else if (ch === "]") depth -= 1;
    i += 1;
  }
  const chunk = src.slice(start, i);
  return [...chunk.matchAll(/id:\s*"([^"]+)"/g)].map((m) => m[1]);
}

describe("auction pool catalog sync", () => {
  it("frontend buffCards.ts pools match server AUCTION_CARD_IDS_BY_ROUND", () => {
    const catalogPath = join(
      dirname(fileURLToPath(import.meta.url)),
      "../../../frontend/src/config/buffCards.ts"
    );
    const src = readFileSync(catalogPath, "utf8");
    for (const round of [1, 2, 3] as const) {
      assert.deepEqual(
        frontendIdsForRound(src, round),
        AUCTION_CARD_IDS_BY_ROUND[round],
        `auction round ${round}`
      );
    }
  });
});
