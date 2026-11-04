/**
 * 运行：npx tsx --test src/config/playerHelpReference.buffSort.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BUFF_CARD_DEFS, LIGHTER_CARD_BULLETS } from "./buffCards";
import {
  BUFF_SIDEBAR_BRIEF,
  buildBuffHelpEntries,
  sortBuffHelpEntries,
  type BuffHelpEntry,
} from "./playerHelpReference";

describe("sortBuffHelpEntries", () => {
  it("places every-auction cards before round-specific cards", () => {
    const sorted = buildBuffHelpEntries();
    const firstEveryIdx = sorted.findIndex((e) => e.everyAuction);
    const firstRoundIdx = sorted.findIndex((e) => !e.everyAuction);
    assert.ok(firstEveryIdx >= 0);
    assert.ok(firstRoundIdx >= 0);
    assert.ok(firstEveryIdx < firstRoundIdx);
    assert.equal(sorted.filter((e) => e.everyAuction).length, 2);
  });

  it("sorts round-specific cards by auctionRound ascending", () => {
    const roundOnly = buildBuffHelpEntries().filter((e) => !e.everyAuction);
    for (let i = 1; i < roundOnly.length; i++) {
      const prev = roundOnly[i - 1];
      const cur = roundOnly[i];
      assert.ok(
        prev.auctionRound < cur.auctionRound ||
          (prev.auctionRound === cur.auctionRound &&
            prev.name.localeCompare(cur.name, "zh") <= 0)
      );
    }
  });

  it("has sidebar brief for every buff card def", () => {
    for (const cardId of Object.keys(BUFF_CARD_DEFS)) {
      assert.ok(BUFF_SIDEBAR_BRIEF[cardId]?.length, `missing brief for ${cardId}`);
    }
  });

  it("lighter sidebar brief matches LIGHTER_CARD_BULLETS", () => {
    assert.deepEqual(BUFF_SIDEBAR_BRIEF.buff_lighter, [...LIGHTER_CARD_BULLETS]);
  });

  it("treats missing everyAuction as non-every-auction tier", () => {
    const entries: BuffHelpEntry[] = [
      {
        cardId: "a",
        icon: "",
        name: "专场",
        desc: "",
        color: "#fff",
        auctionRound: 1,
      },
      {
        cardId: "buff_slack",
        icon: "",
        name: "摸鱼传染",
        desc: "",
        color: "#fff",
        everyAuction: true,
        auctionRound: 0,
      },
    ];
    const sorted = sortBuffHelpEntries(entries);
    assert.equal(sorted[0].cardId, "buff_slack");
  });
});
