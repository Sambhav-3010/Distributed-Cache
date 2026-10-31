import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { EventStore } from "@cachegrid/common/events";
import { NodeRegistry } from "../src/services/node-registry.js";
import { RouterService } from "../src/services/router.service.js";
import { TokenBucketRateLimiter } from "../src/services/rate-limiter.service.js";

describe("TokenBucketRateLimiter", () => {
  test("allows capacity requests, rejects the next, then refills", () => {
    let now = 1_000;
    const limiter = new TokenBucketRateLimiter({
      capacity: 2,
      refillPerSecond: 1,
      clock: () => now,
    });

    assert.equal(limiter.consume("client").allowed, true);
    assert.equal(limiter.consume("client").allowed, true);

    const rejected = limiter.consume("client");
    assert.equal(rejected.allowed, false);
    assert.equal(rejected.retryAfterSeconds, 1);

    now += 1_000;
    assert.equal(limiter.consume("client").allowed, true);
  });

  test("isolates clients and applies policy updates", () => {
    const limiter = new TokenBucketRateLimiter({
      capacity: 1,
      refillPerSecond: 1,
    });

    assert.equal(limiter.consume("alpha").allowed, true);
    assert.equal(limiter.consume("beta").allowed, true);
    assert.equal(limiter.consume("alpha").allowed, false);

    limiter.updatePolicy({ capacity: 5, refillPerSecond: 2 });
    assert.equal(limiter.policy.capacity, 5);
    assert.equal(limiter.policy.refillPerSecond, 2);
  });
});

describe("RouterService", () => {
  const nodes = [
    { nodeId: "node-1", baseUrl: "http://one", status: "UP" },
    { nodeId: "node-2", baseUrl: "http://two", status: "UP" },
    { nodeId: "node-3", baseUrl: "http://three", status: "DOWN" },
  ];

  test("round-robins over healthy nodes", () => {
    const registry = {
      getHealthyNodes: () => nodes.filter((item) => item.status === "UP"),
    };
    const router = new RouterService({ registry });

    assert.equal(router.selectNode().nodeId, "node-1");
    assert.equal(router.selectNode().nodeId, "node-2");
    assert.equal(router.selectNode().nodeId, "node-1");
  });

  test("can exclude a failed node and fails when none remain", () => {
    const registry = {
      getHealthyNodes: () => nodes.filter((item) => item.status === "UP"),
    };
    const router = new RouterService({ registry });

    assert.equal(
      router.selectNode({ excludeNodeId: "node-1" }).nodeId,
      "node-2",
    );

    const onlyOne = {
      getHealthyNodes: () => [{ nodeId: "node-1", baseUrl: "http://one" }],
    };
    assert.throws(
      () => new RouterService({ registry: onlyOne }).selectNode({
        excludeNodeId: "node-1",
      }),
      /No healthy cache nodes/,
    );
  });
});

describe("NodeRegistry", () => {
  test("marks a node down after the failure threshold and recovers", async () => {
    let healthy = false;
    const events = new EventStore({ limit: 100 });
    const registry = new NodeRegistry({
      nodes: [{ id: "node-1", baseUrl: "http://node-1" }],
      events,
      failureThreshold: 2,
      fetchImpl: async () => {
        if (!healthy) {
          throw new Error("connection refused");
        }
        return new Response(
          JSON.stringify({
            metrics: { entries: 1 },
            cache: { evictionPolicy: "LRU" },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
    });

    await registry.checkAll();
    assert.equal(registry.getNode("node-1").status, "UNKNOWN");

    await registry.checkAll();
    assert.equal(registry.getNode("node-1").status, "DOWN");
    assert.equal(
      events.list().some((event) => event.eventType === "NODE_UNHEALTHY"),
      true,
    );

    healthy = true;
    await registry.checkAll();
    assert.equal(registry.getNode("node-1").status, "UP");
    assert.equal(
      events.list().some((event) => event.eventType === "NODE_RECOVERED"),
      true,
    );
  });
});
