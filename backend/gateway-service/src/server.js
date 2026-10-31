import { createApp } from "./app.js";
import { config } from "./config.js";
import { EventStore } from "@cachegrid/common/events";
import { NodeRegistry } from "./services/node-registry.js";
import { GatewayMetricsService } from "./services/metrics.service.js";
import { TokenBucketRateLimiter } from "./services/rate-limiter.service.js";

const events = new EventStore({ limit: config.eventLimit });
const gatewayMetrics = new GatewayMetricsService();
const rateLimiter = new TokenBucketRateLimiter(config.rateLimit);
const registry = new NodeRegistry({
  nodes: config.nodes,
  events,
  healthIntervalMs: config.healthIntervalMs,
  healthTimeoutMs: config.healthTimeoutMs,
  failureThreshold: config.failureThreshold,
});

await registry.start();

const app = createApp({
  config,
  registry,
  gatewayMetrics,
  events,
  rateLimiter,
});

const server = app.listen(config.port, () => {
  const healthy = registry.getHealthyNodes().length;
  console.log(
    `Cache Gateway is running on http://localhost:${config.port} ` +
      `(${healthy}/${registry.getNodes().length} nodes healthy)`,
  );
});

function shutdown(signal) {
  console.log(`${signal} received, shutting down Cache Gateway`);
  registry.stop();
  server.close(() => process.exit(0));
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
