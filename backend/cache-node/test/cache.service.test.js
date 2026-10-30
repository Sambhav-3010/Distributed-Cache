import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";
import { CacheService } from "../src/services/cache.service.js";

describe("CacheService", () => {
  let cacheService;

  beforeEach(() => {
    cacheService = new CacheService();
  });

  test("stores and retrieves an entry", () => {
    cacheService.put("user:101", "Sambhav");

    assert.deepEqual(cacheService.get("user:101"), {
      key: "user:101",
      value: "Sambhav",
    });
  });

  test("returns null for a missing key", () => {
    assert.equal(cacheService.get("non-existent"), null);
  });

  test("updates an existing key", () => {
    cacheService.put("user:101", "Sambhav");
    cacheService.put("user:101", "Sambhav Tripathi");

    assert.equal(cacheService.get("user:101").value, "Sambhav Tripathi");
    assert.equal(cacheService.size(), 1);
  });

  test("deletes an existing key", () => {
    cacheService.put("user:101", "Sambhav");

    assert.equal(cacheService.delete("user:101"), true);
    assert.equal(cacheService.get("user:101"), null);
  });

  test("reports a missing key as not deleted", () => {
    assert.equal(cacheService.delete("non-existent"), false);
  });

  test("checks key existence", () => {
    cacheService.put("user:101", "Sambhav");

    assert.equal(cacheService.exists("user:101"), true);
    assert.equal(cacheService.exists("user:999"), false);
  });

  test("handles concurrent writes without losing entries", async () => {
    const writes = Array.from({ length: 1000 }, (_, index) => {
      const key = `key:${index}`;
      const value = `value:${index}`;
      return Promise.resolve().then(() => cacheService.put(key, value));
    });

    await Promise.all(writes);

    assert.equal(cacheService.size(), 1000);
  });
});
