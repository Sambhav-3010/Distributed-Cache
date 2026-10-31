import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";
import { CacheService } from "../src/services/cache.service.js";

describe("CacheService", () => {
  let cacheService;
  let now;
  let evictions;
  let expirations;

  beforeEach(() => {
    now = 1_000_000;
    evictions = 0;
    expirations = 0;
    cacheService = new CacheService({
      capacity: 100,
      defaultTtlSeconds: 300,
      evictionPolicy: "LRU",
      clock: () => now,
      onEviction: () => {
        evictions += 1;
      },
      onExpiration: () => {
        expirations += 1;
      },
    });
  });

  test("stores and retrieves an entry with metadata", () => {
    cacheService.put("user:101", "Sambhav", 60);
    const entry = cacheService.get("user:101");

    assert.equal(entry.key, "user:101");
    assert.equal(entry.value, "Sambhav");
    assert.equal(entry.frequency, 2);
    assert.equal(entry.expiresAt, new Date(now + 60_000).toISOString());
  });

  test("returns null for a missing key", () => {
    assert.equal(cacheService.get("non-existent"), null);
  });

  test("expires entries at the TTL boundary", () => {
    cacheService.put("user:101", "Sambhav", 10);

    now += 9_999;
    assert.equal(cacheService.get("user:101").value, "Sambhav");

    now += 1;
    assert.equal(cacheService.get("user:101"), null);
    assert.equal(expirations, 1);
    assert.equal(cacheService.size(), 0);
  });

  test("uses the default TTL when none is supplied", () => {
    cacheService.put("user:101", "Sambhav");

    now += 300_001;
    assert.equal(cacheService.get("user:101"), null);
  });

  test("supports entries without expiry when default TTL is zero", () => {
    cacheService = new CacheService({
      defaultTtlSeconds: 0,
      clock: () => now,
    });

    cacheService.put("user:101", "Sambhav");
    now += 10_000_000;

    assert.equal(cacheService.get("user:101").value, "Sambhav");
    assert.equal(cacheService.get("user:101").expiresAt, null);
  });

  test("updates an existing key without increasing entry count", () => {
    cacheService.put("user:101", "Sambhav");
    now += 1;
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

  test("evicts the least recently used entry", () => {
    cacheService = new CacheService({
      capacity: 2,
      defaultTtlSeconds: 0,
      evictionPolicy: "LRU",
      clock: () => now,
      onEviction: () => {
        evictions += 1;
      },
    });

    cacheService.put("a", "1");
    now += 1;
    cacheService.put("b", "2");
    now += 1;
    cacheService.get("a");
    now += 1;
    cacheService.put("c", "3");

    assert.equal(cacheService.get("a").value, "1");
    assert.equal(cacheService.get("b"), null);
    assert.equal(cacheService.get("c").value, "3");
    assert.equal(evictions, 1);
  });

  test("evicts the least frequently used entry with a deterministic tie-break", () => {
    cacheService = new CacheService({
      capacity: 2,
      defaultTtlSeconds: 0,
      evictionPolicy: "LFU",
      clock: () => now,
      onEviction: () => {
        evictions += 1;
      },
    });

    cacheService.put("a", "1");
    now += 1;
    cacheService.put("b", "2");
    now += 1;
    cacheService.put("c", "3");

    assert.equal(cacheService.get("a"), null);
    assert.equal(cacheService.get("b").value, "2");
    assert.equal(cacheService.get("c").value, "3");
    assert.equal(evictions, 1);
  });

  test("keeps frequently accessed entries under LFU", () => {
    cacheService = new CacheService({
      capacity: 2,
      defaultTtlSeconds: 0,
      evictionPolicy: "LFU",
      clock: () => now,
    });

    cacheService.put("hot", "1");
    cacheService.get("hot");
    cacheService.get("hot");
    now += 1;
    cacheService.put("warm", "2");
    now += 1;
    cacheService.put("cold", "3");

    assert.equal(cacheService.get("hot").value, "1");
    assert.equal(cacheService.get("warm"), null);
    assert.equal(cacheService.get("cold").value, "3");
  });

  test("cleans up expired entries", () => {
    cacheService.put("a", "1", 10);
    cacheService.put("b", "2", 20);
    now += 15_000;

    assert.equal(cacheService.cleanupExpired(), 1);
    assert.equal(expirations, 1);
    assert.equal(cacheService.size(), 1);
  });

  test("handles concurrent writes without losing entries", async () => {
    cacheService = new CacheService({
      capacity: 1000,
      defaultTtlSeconds: 0,
      evictionPolicy: "LRU",
      clock: () => now,
    });

    const writes = Array.from({ length: 1000 }, (_, index) => {
      const key = `key:${index}`;
      const value = `value:${index}`;
      return Promise.resolve().then(() => cacheService.put(key, value));
    });

    await Promise.all(writes);

    assert.equal(cacheService.size(), 1000);
  });
});
