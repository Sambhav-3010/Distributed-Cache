import express from "express";
import { EventStore } from "@cachegrid/common/events";
import { config as defaultConfig } from "./config.js";
import { GatewayMetricsService } from "./services/metrics.service.js";
import { NodeRegistry } from "./services/node-registry.js";
import { RouterService } from "./services/router.service.js";
import { TokenBucketRateLimiter } from "./services/rate-limiter.service.js";
import { MonitoringService } from "./services/monitoring.service.js";
import { createCacheProxyRouter } from "./routes/cache-proxy.routes.js";
import { createClusterRouter } from "./routes/cluster.routes.js";
import { requestIdMiddleware } from "./middleware/request-id.js";
import { corsMiddleware } from "./middleware/cors.js";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.js";

export function createApp({
  config = defaultConfig,
  registry,
  gatewayMetrics = new GatewayMetricsService(),
  events = new EventStore({ limit: config.eventLimit }),
  rateLimiter = new TokenBucketRateLimiter(config.rateLimit),
  routerService,
  monitoring,
  fetchImpl = globalThis.fetch,
} = {}) {
  const activeRegistry =
    registry ??
    new NodeRegistry({
      nodes: config.nodes,
      events,
      healthIntervalMs: config.healthIntervalMs,
      healthTimeoutMs: config.healthTimeoutMs,
      failureThreshold: config.failureThreshold,
      fetchImpl,
    });
  const activeRouterService =
    routerService ?? new RouterService({ registry: activeRegistry });
  const activeMonitoring =
    monitoring ??
    new MonitoringService({
      registry: activeRegistry,
      gatewayMetrics,
      rateLimiter,
      events,
      clusterId: config.clusterId,
      timeoutMs: config.healthTimeoutMs,
      fetchImpl,
    });

  const app = express();
  app.disable("x-powered-by");
  app.use(corsMiddleware(config.corsOrigin));
  app.use(requestIdMiddleware);
  app.use(express.json({ limit: "64kb" }));

  app.get("/health", (_req, res) => {
    res.type("text/plain").send("Cache Gateway is running");
  });

  app.get("/actuator/health", (_req, res) => {
    const status = activeMonitoring.getClusterStatus();
    res.json({
      status: "UP",
      gateway: "UP",
      clusterId: config.clusterId,
      healthyNodes: status.healthyNodes,
      totalNodes: status.totalNodes,
    });
  });

  app.use(
    "/api/v1/cache",
    createCacheProxyRouter({
      router: activeRouterService,
      registry: activeRegistry,
      metrics: gatewayMetrics,
      events,
      rateLimiter,
      timeoutMs: config.routerTimeoutMs,
      fetchImpl,
    }),
  );

  app.use(
    "/api/v1",
    createClusterRouter({
      monitoring: activeMonitoring,
      rateLimiter,
    }),
  );

  app.locals.registry = activeRegistry;
  app.locals.gatewayMetrics = gatewayMetrics;
  app.locals.events = events;
  app.locals.rateLimiter = rateLimiter;

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
