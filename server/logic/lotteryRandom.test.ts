import test from "node:test";
import assert from "node:assert/strict";
import {
  buildLotteryDraw,
  drawLotteryRoll,
  isValidLotteryRoll,
  lotteryAmountForRoll,
  serverRandomRoll,
} from "./lotteryRandom.js";
import { LOTTERY_PRIZE_BY_ROLL } from "../config/lottery.js";

test("lottery prize table maps dice faces to non-negative amounts", () => {
  assert.deepEqual([...LOTTERY_PRIZE_BY_ROLL], [0, 30, 60, 90, 120, 200]);
  for (let roll = 1; roll <= 6; roll++) {
    assert.equal(lotteryAmountForRoll(roll), LOTTERY_PRIZE_BY_ROLL[roll - 1]);
  }
  assert.equal(isValidLotteryRoll(0), false);
  assert.equal(isValidLotteryRoll(7), false);
  assert.equal(isValidLotteryRoll(3), true);
  assert.throws(() => lotteryAmountForRoll(9));
});

test("server fallback roll is always 1-6", () => {
  for (let i = 0; i < 50; i++) {
    const roll = serverRandomRoll();
    assert.ok(roll >= 1 && roll <= 6, `roll ${roll} out of range`);
  }
});

test("buildLotteryDraw carries source and amount", () => {
  const draw = buildLotteryDraw(6, "random.org", 123);
  assert.deepEqual(draw, { roll: 6, amount: 200, source: "random.org", drawnAt: 123 });
});

test("online draw uses random.org when the response is a valid dice face", async () => {
  const draw = await drawLotteryRoll({
    online: true,
    timeoutMs: 100,
    fetchImpl: async () => ({ ok: true, text: async () => "4\n" }),
  });
  assert.equal(draw.source, "random.org");
  assert.equal(draw.roll, 4);
  assert.equal(draw.amount, 90);
});

test("online draw falls back to server crypto on invalid responses", async () => {
  const draw = await drawLotteryRoll({
    online: true,
    timeoutMs: 100,
    fetchImpl: async () => ({ ok: true, text: async () => "<html>blocked</html>" }),
  });
  assert.equal(draw.source, "server");
  assert.ok(draw.roll >= 1 && draw.roll <= 6);
  assert.equal(draw.amount, lotteryAmountForRoll(draw.roll));
});

test("online draw falls back when the request throws", async () => {
  const draw = await drawLotteryRoll({
    online: true,
    timeoutMs: 100,
    fetchImpl: async () => {
      throw new Error("network down");
    },
  });
  assert.equal(draw.source, "server");
  assert.ok(draw.roll >= 1 && draw.roll <= 6);
});

test("online=false never calls the network", async () => {
  let called = false;
  const draw = await drawLotteryRoll({
    online: false,
    fetchImpl: async () => {
      called = true;
      return { ok: true, text: async () => "1" };
    },
  });
  assert.equal(called, false);
  assert.equal(draw.source, "server");
});
