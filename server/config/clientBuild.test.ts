import { describe, it, afterEach } from "node:test";
import assert from "node:assert";
import { isClientBuildStale, requiredClientBuildId } from "./clientBuild.js";

describe("clientBuild", () => {
  const prev = process.env.REQUIRED_CLIENT_BUILD_ID;

  afterEach(() => {
    if (prev === undefined) delete process.env.REQUIRED_CLIENT_BUILD_ID;
    else process.env.REQUIRED_CLIENT_BUILD_ID = prev;
  });

  it("does not require build id when env unset", () => {
    delete process.env.REQUIRED_CLIENT_BUILD_ID;
    assert.equal(requiredClientBuildId(), undefined);
    assert.equal(isClientBuildStale("abc"), false);
  });

  it("flags mismatch when env set", () => {
    process.env.REQUIRED_CLIENT_BUILD_ID = "deploy-abc";
    assert.equal(isClientBuildStale("deploy-abc"), false);
    assert.equal(isClientBuildStale("old"), true);
    assert.equal(isClientBuildStale("dev"), false);
    assert.equal(isClientBuildStale(""), true);
    assert.equal(isClientBuildStale(undefined), true);
  });
});
