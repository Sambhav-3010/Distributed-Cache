import { Router } from "express";

export function createObservabilityRouter({
  cacheService,
  metrics,
  events,
  nodeId,
}) {
  const router = Router();

  function snapshot() {
    const nodeMetrics = metrics.snapshot({ entries: cacheService.size() });
    return {
      generatedAt: new Date().toISOString(),
      nodeId,
      status: "UP",
      cache: {
        capacity: cacheService.capacity,
        defaultTtlSeconds: cacheService.defaultTtlSeconds,
        evictionPolicy: cacheService.evictionPolicy,
      },
      metrics: nodeMetrics,
    };
  }

  router.get("/status", (_req, res) => {
    res.json(snapshot());
  });

  router.get("/metrics", (_req, res) => {
    res.json(snapshot());
  });

  router.get("/events", (req, res) => {
    res.json({
      generatedAt: new Date().toISOString(),
      nodeId,
      events: events.list({
        limit: Number(req.query.limit) || 100,
        severity: req.query.severity,
        type: req.query.type,
        nodeId,
      }),
    });
  });

  return router;
}
