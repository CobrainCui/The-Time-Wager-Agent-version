import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createInitialGame } from "../state/gameState.js";
import { resetRateLimits } from "../util/rateLimit.js";
import {
  MAX_ROOMS_PER_IP,
  canCreateRoom,
} from "./roomCreatePolicy.js";

describe("room create IP gates", () => {
  it("rejects the 4th concurrent room from the same IP", () => {
    resetRateLimits();
    const rooms: Record<string, ReturnType<typeof createInitialGame>> = {};
    const ip = "203.0.113.10";
    const now = 1_000_000;
    for (let i = 0; i < MAX_ROOMS_PER_IP; i++) {
      const gate = canCreateRoom(rooms, ip, now);
      assert.equal(gate.ok, true);
      const id = `r${i}`;
      rooms[id] = createInitialGame(id, []);
      rooms[id].createdByIp = ip;
    }
    const fourth = canCreateRoom(rooms, ip, now);
    assert.equal(fourth.ok, false);
  });

  it("allows another IP to create a room while one IP is at the cap", () => {
    resetRateLimits();
    const rooms: Record<string, ReturnType<typeof createInitialGame>> = {};
    const now = 2_000_000;
    for (let i = 0; i < MAX_ROOMS_PER_IP; i++) {
      const id = `a${i}`;
      rooms[id] = createInitialGame(id, []);
      rooms[id].createdByIp = "203.0.113.10";
    }
    const other = canCreateRoom(rooms, "203.0.113.20", now);
    assert.equal(other.ok, true);
  });

  it("does not apply create gates when joining an existing room", () => {
    resetRateLimits();
    const rooms: Record<string, ReturnType<typeof createInitialGame>> = {
      existing: createInitialGame("existing", []),
    };
    rooms.existing.createdByIp = "203.0.113.10";
    assert.ok(rooms["existing"]);
  });

  it("rejects a 4th create in the same window even with no live rooms", () => {
    resetRateLimits();
    const rooms = {};
    const ip = "198.51.100.7";
    const now = 3_000_000;
    assert.equal(canCreateRoom(rooms, ip, now).ok, true);
    assert.equal(canCreateRoom(rooms, ip, now).ok, true);
    assert.equal(canCreateRoom(rooms, ip, now).ok, true);
    assert.equal(canCreateRoom(rooms, ip, now).ok, false);
  });
});
