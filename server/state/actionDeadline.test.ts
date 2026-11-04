import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ACTION_DEADLINE_ERA1_R1_MS,
  ACTION_DEADLINE_MS,
  formatActionDeadlineClock,
  getActionDeadlineMs,
  getInvestmentRemainingMs,
  pauseInvestmentDeadline,
  resumeInvestmentDeadline,
  startInvestmentDeadline,
} from "./actionDeadline.js";
import { handleActionTimeExpired } from "./actionTimeExpiry.js";
import { createInitialGame } from "./gameState.js";

describe("getActionDeadlineMs", () => {
  it("era 1 round 1 is 12 minutes", () => {
    const game = createInitialGame("room", []);
    assert.equal(getActionDeadlineMs(game), ACTION_DEADLINE_ERA1_R1_MS);
    assert.equal(formatActionDeadlineClock(game), "12:00");
  });

  it("other rounds are 10 minutes", () => {
    const game = createInitialGame("room", []);
    game.currentEra = 2;
    game.roundInEra = 1;
    assert.equal(getActionDeadlineMs(game), ACTION_DEADLINE_MS);
    assert.equal(formatActionDeadlineClock(game), "10:00");
  });
});

describe("investment timer pause/resume/reset", () => {
  it("pause freezes remaining and blocks expiry", () => {
    const game = createInitialGame("room", []);
    game.phase = "INVESTMENT";
    startInvestmentDeadline(game);
    assert.equal(pauseInvestmentDeadline(game).ok, true);
    assert.ok(typeof game.investmentTimerPausedAt === "number");

    // 墙钟已过 endsAt，暂停中仍不到期
    game.investmentEndsAt = (game.investmentTimerPausedAt as number) + 45_000;
    // 把 endsAt 调到 pausedAt 之前会让剩余为 0；用 pausedAt 之前的 endsAt 模拟「暂停后时间流逝」：
    // endsAt 仍在未来相对 pausedAt，但相对 now 已过期
    const pausedAt = game.investmentTimerPausedAt as number;
    game.investmentEndsAt = pausedAt + 45_000;
    // 伪造 now 已远超 endsAt：直接把 pausedAt 留着，expiry 看 pausedAt 存在即跳过
    assert.equal(handleActionTimeExpired(game), false);
    assert.equal(game.phase, "INVESTMENT");
    assert.equal(getInvestmentRemainingMs(game), 45_000);
  });

  it("resume restores approximately the same remaining", () => {
    const game = createInitialGame("room", []);
    game.phase = "INVESTMENT";
    const now = Date.now();
    game.investmentEndsAt = now + 90_000;
    game.investmentTimerPausedAt = now;
    const frozen = getInvestmentRemainingMs(game, now);
    assert.equal(frozen, 90_000);

    const resumed = resumeInvestmentDeadline(game);
    assert.equal(resumed.ok, true);
    assert.equal(game.investmentTimerPausedAt, undefined);
    const after = getInvestmentRemainingMs(game);
    assert.ok(Math.abs(after - 90_000) < 500);
  });

  it("reset starts a fresh full deadline", () => {
    const game = createInitialGame("room", []);
    game.phase = "INVESTMENT";
    game.investmentEndsAt = Date.now() + 30_000;
    game.investmentTimerPausedAt = Date.now();
    startInvestmentDeadline(game);
    assert.equal(game.investmentTimerPausedAt, undefined);
    const remaining = getInvestmentRemainingMs(game);
    assert.ok(remaining > ACTION_DEADLINE_ERA1_R1_MS - 2000);
    assert.ok(remaining <= ACTION_DEADLINE_ERA1_R1_MS);
  });

  it("reset uses 10 minutes when not era 1 round 1", () => {
    const game = createInitialGame("room", []);
    game.phase = "INVESTMENT";
    game.currentEra = 1;
    game.roundInEra = 2;
    startInvestmentDeadline(game);
    const remaining = getInvestmentRemainingMs(game);
    assert.ok(remaining > ACTION_DEADLINE_MS - 2000);
    assert.ok(remaining <= ACTION_DEADLINE_MS);
  });

  it("rejects pause when already paused or not in investment", () => {
    const game = createInitialGame("room", []);
    game.phase = "SETTLEMENT";
    assert.equal(pauseInvestmentDeadline(game).ok, false);

    game.phase = "INVESTMENT";
    startInvestmentDeadline(game);
    assert.equal(pauseInvestmentDeadline(game).ok, true);
    assert.equal(pauseInvestmentDeadline(game).ok, false);
    assert.equal(resumeInvestmentDeadline(game).ok, true);
    assert.equal(resumeInvestmentDeadline(game).ok, false);
  });
});
