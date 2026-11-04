import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BUFF_LOCKOUT_REMAINING_MS,
  isInvestmentBuffLockoutActive,
} from "./actionDeadline.js";
import { createInitialGame } from "./gameState.js";

describe("investment buff lockout", () => {
  it("active when remaining is within last 2 minutes", () => {
    const game = createInitialGame("r", []);
    game.phase = "INVESTMENT";
    game.investmentEndsAt = Date.now() + BUFF_LOCKOUT_REMAINING_MS - 1_000;
    assert.equal(isInvestmentBuffLockoutActive(game), true);
  });

  it("inactive when more than 2 minutes remain", () => {
    const game = createInitialGame("r", []);
    game.phase = "INVESTMENT";
    game.investmentEndsAt = Date.now() + BUFF_LOCKOUT_REMAINING_MS + 5_000;
    assert.equal(isInvestmentBuffLockoutActive(game), false);
  });

  it("inactive outside investment phase", () => {
    const game = createInitialGame("r", []);
    game.phase = "BUFF_USAGE";
    game.investmentEndsAt = Date.now() + 30_000;
    assert.equal(isInvestmentBuffLockoutActive(game), false);
  });
});
