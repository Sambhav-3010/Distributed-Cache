import assert from "node:assert/strict";
import { describe, test } from "node:test";
import request from "supertest";
import { EventStore } from "@cachegrid/common/events";
import { createApp } from "../src/app.js";
import { GatewayMetricsService } from "../src/services/metrics.service.js";
import { RouterService } from "../src/services/router.service.js";
import { TokenBucketRateLimiter } from "../src/services/rate-limiter.service.js";

function node(nodeId, baseUrl, status = "UP") {
  return {
    nodeId,
    baseUrl,
    status,
    lastHeartbeatAt: new Date().toISOString(),
    consecutiveFailures: 0,
    lastError: null,
    cache: {
      capacity: 100,
      defaultTtlSeconds: 300,
      evictionPolicy: "LRU",
    },
    metrics: {
      requestsTotal: 10,
      hitsTotal: 6,
      missesTotal: 4,
      evictionsTotal: 1,
      expirationsTotal: 0,
      entries: 3,
      latency: { samples: 10, avgMs: 2, p50Ms: 1, p95Ms: 4, p99Ms: 5 },
    },
  };
}

class FakeRegistry {
  constructor(nodes) {
    this.nodes = nodes;
    this.failures = [];
  }

  getNodes() {
    return this.nodes;
  }

  getHealthyNodes() {
    return this.nodes.filter((item) => item.status === "UP");
  }

  getNode(nodeId) {
    return this.nodes.find((item) => item.nodeId === nodeId) ?? null;
  }

  markFailure(nodeId, reason) {
    this.failures.push({ nodeId, reason });
  }
}

function createTestApp({
  nodes = [node("node-1", "http://node-1")],
  fetchImpl,
  rateLimiter = new TokenBucketRateLimiter({
    capacity: 100,
    refillPerSecond: 10,
  }),
} = {}) {
  const registry = new FakeRegistry(nodes);
  const events = new EventStore({ limit: 100 });
  const gatewayMetrics = new GatewayMetricsService();
  const app = createApp({
    config: {
      clusterId: "test-cluster",
      eventLimit: 100,
      healthTimeoutMs: 1000,
      routerTimeoutMs: 1000,
      corsOrigin: "*",
      rateLimit: { capacity: 100, refillPerSecond: 10 },
    },
    registry,
    gatewayMetrics,
    events,
    rateLimiter,
    routerService: new RouterService({ registry }),
    fetchImpl,
  });

  return { app, registry, gatewayMetrics, events };
}

function response(status, body) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("Gateway cache proxy", () => {
  test("proxies GET requests to a healthy node", async () => {
    const calls = [];
    const { app } = createTestApp({
      fetchImpl: async (url, options) => {
        calls.push({ url, options });
        return response(200, {
          key: "user:101",
          value: "Sambhav",
          nodeId: "node-1",
        });
      },
    });

    const result = await request(app)
      .get("/api/v1/cache/user:101")
      .set("x-request-id", "req-test");

    assert.equal(result.status, 200);
    assert.equal(result.body.value, "Sambhav");
    assert.equal(result.body.requestId, "req-test");
    assert.equal(calls[0].url, "http://node-1/api/v1/cache/user%3A101");
    assert.equal(calls[0].options.headers["x-request-id"], "req-test");
  });

  test("proxies PUT bodies", async () => {
    const calls = [];
    const { app } = createTestApp({
      fetchImpl: async (url, options) => {
        calls.push({ url, options });
        return response(201, {
          key: "user:101",
          value: "Sambhav",
          nodeId: "node-1",
        });
      },
    });

    const result = await request(app)
      .put("/api/v1/cache/user:101")
      .send({ value: "Sambhav", ttlSeconds: 60 });

    assert.equal(result.status, 201);
    assert.equal(calls[0].options.method, "PUT");
    assert.deepEqual(JSON.parse(calls[0].options.body), {
      value: "Sambhav",
      ttlSeconds: 60,
    });
  });

  test("turns a node 404 delete into an idempotent success", async () => {
    const { app } = createTestApp({
      fetchImpl: async () =>
        response(404, { code: "CACHE_KEY_NOT_FOUND", message: "missing" }),
    });

    const result = await request(app).delete("/api/v1/cache/user:101");

    assert.equal(result.status, 200);
    assert.equal(result.body.deleted, false);
  });

  test("returns 503 when no nodes are healthy", async () => {
    const { app } = createTestApp({
      nodes: [node("node-1", "http://node-1", "DOWN")],
      fetchImpl: async () => response(200, {}),
    });

    const result = await request(app).get("/api/v1/cache/user:101");

    assert.equal(result.status, 503);
    assert.equal(result.body.code, "NO_HEALTHY_NODES");
  });

  test("rejects requests over the rate limit", async () => {
    let now = 1_000;
    const rateLimiter = new TokenBucketRateLimiter({
      capacity: 1,
      refillPerSecond: 1,
      clock: () => now,
    });
    const { app } = createTestApp({
      rateLimiter,
      fetchImpl: async () =>
        response(200, { key: "user:101", value: "Sambhav" }),
    });

    const first = await request(app).get("/api/v1/cache/user:101");
    const second = await request(app).get("/api/v1/cache/user:101");

    assert.equal(first.status, 200);
    assert.equal(second.status, 429);
    assert.equal(second.body.code, "RATE_LIMIT_EXCEEDED");
    assert.ok(Number(second.headers["retry-after"]) >= 1);

    now += 2_000;
    const third = await request(app).get("/api/v1/cache/user:101");
    assert.equal(third.status, 200);
  });
});

describe("Gateway cluster routes", () => {
  test("returns cluster status and aggregate metrics", async () => {
    const { app } = createTestApp();

    const status = await request(app).get("/api/v1/cluster/status");
    assert.equal(status.status, 200);
    assert.equal(status.body.totalNodes, 1);
    assert.equal(status.body.healthyNodes, 1);

    const metrics = await request(app).get("/api/v1/cluster/metrics");
    assert.equal(metrics.status, 200);
    assert.equal(metrics.body.cluster.entries, 3);
    assert.equal(metrics.body.cluster.hitRate, 60);
  });

  test("exposes rate limit status and metrics", async () => {
    const { app } = createTestApp();

    const status = await request(app).get("/api/v1/rate-limits/status");
    assert.equal(status.status, 200);
    assert.equal(status.body.policy.capacity, 100);

    const metrics = await request(app).get("/api/v1/rate-limits/metrics");
    assert.equal(metrics.status, 200);
    assert.equal(metrics.body.allowed, 0);
  });
});
