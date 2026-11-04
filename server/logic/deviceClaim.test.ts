import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  removeDeviceClaimBySocket,
  takeDeviceClaimForPlayer,
  upsertDeviceClaim,
} from "./deviceClaim.js";
import { createInitialGame } from "../state/gameState.js";

describe("deviceClaim queue", () => {
  it("upsert replaces prior claim for same player", () => {
    const game = createInitialGame("room", []);
    const first = upsertDeviceClaim(game, "p1", "sock-a");
    assert.equal(first, undefined);
    const second = upsertDeviceClaim(game, "p1", "sock-b");
    assert.equal(second?.socketId, "sock-a");
    assert.equal(game.pendingDeviceClaims?.length, 1);
    assert.equal(game.pendingDeviceClaims?.[0]?.socketId, "sock-b");
  });

  it("takeDeviceClaimForPlayer removes matching claim", () => {
    const game = createInitialGame("room", []);
    upsertDeviceClaim(game, "p1", "sock-a");
    const taken = takeDeviceClaimForPlayer(game, "p1", "sock-a");
    assert.ok(taken);
    assert.equal(game.pendingDeviceClaims, undefined);
  });

  it("removeDeviceClaimBySocket clears entry", () => {
    const game = createInitialGame("room", []);
    upsertDeviceClaim(game, "p1", "sock-a");
    assert.equal(removeDeviceClaimBySocket(game, "sock-a"), true);
    assert.equal(game.pendingDeviceClaims, undefined);
  });
});
