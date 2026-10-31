import express from "express";
import { EventStore } from "@cachegrid/common/events";
import { config as defaultConfig } from "./config.js";
import { CacheService } from "./services/cache.service.js";
import { MetricsService } from "./services/metrics.service.js";
import { createCacheRouter } from "./routes/cache.routes.js";
import { createHealthRouter } from "./routes/health.routes.js";
import { createObservabilityRouter } from "./routes/observability.routes.js";
import { requestIdMiddleware } from "./middleware/request-id.js";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.js";

function createCacheService({ config, metrics, events }) {
  return new CacheService({
    capacity: config.capacity,
    defaultTtlSeconds: config.defaultTtlSeconds,
    evictionPolicy: config.evictionPolicy,
    onEviction: () => {
      metrics.recordEviction();
      events.add({
        eventType: "CACHE_EVICTION",
        severity: "INFO",
        source: `cache-node:${config.nodeId}`,
        nodeId: config.nodeId,
        message: "Entry evicted because the cache reached capacity",
        attributes: { policy: config.evictionPolicy },
      });
    },
    onExpiration: () => {
      metrics.recordExpiration();
      events.add({
        eventType: "CACHE_TTL_EXPIRED",
        severity: "INFO",
        source: `cache-node:${config.nodeId}`,
        nodeId: config.nodeId,
        message: "Entry removed after reaching its TTL",
        attributes: {},
      });
    },
  });
}

export function createApp({
  config = defaultConfig,
  cacheService,
  metrics = new MetricsService(),
  events = new EventStore({ limit: 500 }),
} = {}) {
  const activeCacheService =
    cacheService ?? createCacheService({ config, metrics, events });
  const app = express();

  app.disable("x-powered-by");
  app.use(requestIdMiddleware);
  app.use(express.json({ limit: "64kb" }));

  app.use(
    createHealthRouter({
      cacheService: activeCacheService,
      metrics,
      nodeId: config.nodeId,
    }),
  );

  const observabilityRouter = createObservabilityRouter({
    cacheService: activeCacheService,
    metrics,
    events,
    nodeId: config.nodeId,
  });
  app.use("/api/v1", observabilityRouter);

  const cacheRouter = createCacheRouter({
    cacheService: activeCacheService,
    metrics,
    nodeId: config.nodeId,
  });
  app.use("/cache", cacheRouter);
  app.use("/api/v1/cache", cacheRouter);

  app.locals.cacheService = activeCacheService;
  app.locals.metrics = metrics;
  app.locals.events = events;

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
