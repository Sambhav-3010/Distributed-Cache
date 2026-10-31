import { Router } from "express";
import { errorEnvelope } from "@cachegrid/common/errors";

export function createClusterRouter({ monitoring, rateLimiter }) {
  const router = Router();

  router.get("/cluster/status", (_req, res) => {
    res.json(monitoring.getClusterStatus());
  });

  router.get("/cluster/nodes", (_req, res) => {
    res.json({ nodes: monitoring.getClusterStatus().nodes });
  });

  router.get("/cluster/metrics", (_req, res) => {
    res.json(monitoring.getClusterMetrics());
  });

  router.get("/cluster/events", async (req, res) => {
    res.json(
      await monitoring.getEvents({
        limit: req.query.limit,
        severity: req.query.severity,
        type: req.query.type,
        nodeId: req.query.nodeId,
      }),
    );
  });

  router.get("/nodes/:nodeId/metrics", (req, res) => {
    const node = monitoring.getNodeMetrics(req.params.nodeId);
    if (!node) {
      return res.status(404).json(
        errorEnvelope({
          status: 404,
          code: "NODE_NOT_FOUND",
          message: `Node not found: ${req.params.nodeId}`,
          path: req.originalUrl,
          requestId: req.requestId,
        }),
      );
    }
    return res.json(node);
  });

  router.get("/nodes/:nodeId/health", (req, res) => {
    const health = monitoring.getNodeHealth(req.params.nodeId);
    if (!health) {
      return res.status(404).json(
        errorEnvelope({
          status: 404,
          code: "NODE_NOT_FOUND",
          message: `Node not found: ${req.params.nodeId}`,
          path: req.originalUrl,
          requestId: req.requestId,
        }),
      );
    }
    return res.json(health);
  });

  router.get("/rate-limits/status", (_req, res) => {
    res.json(rateLimiter.snapshot());
  });

  router.get("/rate-limits/metrics", (_req, res) => {
    res.json(monitoring.getRateLimitMetrics());
  });

  router.put("/rate-limits/policies/:policyId", (req, res) => {
    if (req.params.policyId !== "default") {
      return res.status(404).json(
        errorEnvelope({
          status: 404,
          code: "POLICY_NOT_FOUND",
          message: `Policy not found: ${req.params.policyId}`,
          path: req.originalUrl,
          requestId: req.requestId,
        }),
      );
    }

    const capacity = Number(req.body?.capacity);
    const refillPerSecond = Number(req.body?.refillPerSecond);
    if (
      (req.body?.capacity !== undefined && (!Number.isFinite(capacity) || capacity < 1)) ||
      (req.body?.refillPerSecond !== undefined &&
        (!Number.isFinite(refillPerSecond) || refillPerSecond <= 0))
    ) {
      return res.status(400).json(
        errorEnvelope({
          status: 400,
          code: "INVALID_POLICY",
          message:
            "capacity must be >= 1 and refillPerSecond must be a positive number",
          path: req.originalUrl,
          requestId: req.requestId,
        }),
      );
    }

    return res.json({
      policy: rateLimiter.updatePolicy({
        capacity: req.body?.capacity,
        refillPerSecond: req.body?.refillPerSecond,
      }),
      requestId: req.requestId,
    });
  });

  return router;
}
