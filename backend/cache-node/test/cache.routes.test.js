import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";
import request from "supertest";
import { createApp } from "../src/app.js";
import { EventStore } from "@cachegrid/common/events";
import { CacheService } from "../src/services/cache.service.js";
import { MetricsService } from "../src/services/metrics.service.js";

describe("Cache routes", () => {
  let app;
  let cacheService;
  let metrics;
  let events;

  beforeEach(() => {
    metrics = new MetricsService();
    events = new EventStore({ limit: 100 });
    cacheService = new CacheService({
      capacity: 2,
      defaultTtlSeconds: 300,
      evictionPolicy: "LRU",
      onEviction: () => metrics.recordEviction(),
      onExpiration: () => metrics.recordExpiration(),
    });
    app = createApp({
      config: {
        nodeId: "node-test",
        capacity: 2,
        defaultTtlSeconds: 300,
        evictionPolicy: "LRU",
        cleanupIntervalMs: 60000,
      },
      cacheService,
      metrics,
      events,
    });
  });

  test("stores and retrieves an entry through the legacy route", async () => {
    const created = await request(app)
      .post("/cache")
      .query({ key: "user:101", value: "Sambhav" });

    assert.equal(created.status, 201);
    assert.equal(created.body.key, "user:101");
    assert.equal(created.body.value, "Sambhav");
    assert.equal(created.body.nodeId, "node-test");

    const retrieved = await request(app).get("/cache/user:101");

    assert.equal(retrieved.status, 200);
    assert.equal(retrieved.body.value, "Sambhav");
    assert.equal(retrieved.body.nodeId, "node-test");
  });

  test("stores with a TTL through the v1 route", async () => {
    const created = await request(app)
      .put("/api/v1/cache/user:101")
      .send({ value: "Sambhav", ttlSeconds: 60 });

    assert.equal(created.status, 201);
    assert.equal(created.body.key, "user:101");
    assert.equal(created.body.value, "Sambhav");
    assert.ok(created.body.expiresAt);
  });

  test("rejects invalid TTLs", async () => {
    const response = await request(app)
      .put("/api/v1/cache/user:101")
      .send({ value: "Sambhav", ttlSeconds: 0 });

    assert.equal(response.status, 400);
    assert.equal(response.body.code, "INVALID_TTL");
  });

  test("updates and deletes an entry", async () => {
    cacheService.put("user:101", "Sambhav");

    const updated = await request(app)
      .put("/api/v1/cache/user:101")
      .send({ value: "Sambhav Tripathi" });

    assert.equal(updated.status, 201);

    const retrieved = await request(app).get("/api/v1/cache/user:101");
    assert.equal(retrieved.body.value, "Sambhav Tripathi");

    const deleted = await request(app).delete("/api/v1/cache/user:101");
    assert.equal(deleted.status, 204);

    const missing = await request(app).get("/api/v1/cache/user:101");
    assert.equal(missing.status, 404);
  });

  test("rejects blank keys and missing values", async () => {
    const blankKey = await request(app)
      .post("/cache")
      .query({ key: "   ", value: "value" });

    assert.equal(blankKey.status, 400);
    assert.equal(blankKey.body.status, 400);

    const missingValue = await request(app)
      .post("/cache")
      .query({ key: "user:101" });

    assert.equal(missingValue.status, 400);
    assert.equal(missingValue.body.status, 400);
  });

  test("returns 404 for missing keys on get and delete", async () => {
    const missingGet = await request(app).get("/cache/does-not-exist");
    assert.equal(missingGet.status, 404);
    assert.equal(missingGet.body.code, "CACHE_KEY_NOT_FOUND");

    const missingDelete = await request(app).delete("/cache/does-not-exist");
    assert.equal(missingDelete.status, 404);
    assert.equal(missingDelete.body.code, "CACHE_KEY_NOT_FOUND");
  });

  test("evicts at capacity and exposes metrics", async () => {
    await request(app).put("/api/v1/cache/a").send({ value: "1" });
    await request(app).put("/api/v1/cache/b").send({ value: "2" });
    await request(app).put("/api/v1/cache/c").send({ value: "3" });

    const metricsResponse = await request(app).get("/api/v1/metrics");
    assert.equal(metricsResponse.status, 200);
    assert.equal(metricsResponse.body.metrics.entries, 2);
    assert.equal(metricsResponse.body.metrics.evictionsTotal, 1);
    assert.equal(metricsResponse.body.metrics.putsTotal, 3);
  });

  test("handles parallel HTTP writes", async () => {
    const writes = Array.from({ length: 100 }, (_, index) =>
      request(app)
        .post("/cache")
        .query({ key: `key:${index}`, value: `value:${index}` }),
    );

    const responses = await Promise.all(writes);

    for (const response of responses) {
      assert.equal(response.status, 201);
    }
    assert.equal(cacheService.size(), 2);
  });

  test("returns a 404 envelope for unknown routes", async () => {
    const response = await request(app).get("/unknown");

    assert.equal(response.status, 404);
    assert.equal(response.body.code, "ROUTE_NOT_FOUND");
  });
});

describe("Health and observability routes", () => {
  const app = createApp();

  test("exposes the health endpoint", async () => {
    const response = await request(app).get("/health");

    assert.equal(response.status, 200);
    assert.equal(response.text, "Cache Node is running");
  });

  test("exposes an actuator-style health endpoint", async () => {
    const response = await request(app).get("/actuator/health");

    assert.equal(response.status, 200);
    assert.equal(response.body.status, "UP");
    assert.equal(response.body.nodeId, "node-1");
  });

  test("exposes node status", async () => {
    const response = await request(app).get("/api/v1/status");

    assert.equal(response.status, 200);
    assert.equal(response.body.status, "UP");
    assert.equal(response.body.cache.evictionPolicy, "LRU");
    assert.equal(typeof response.body.metrics.requestsTotal, "number");
  });
});
