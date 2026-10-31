import { Router } from "express";
import {
  errorEnvelope,
  ServiceUnavailableError,
} from "@cachegrid/common/errors";

function parseResponseBody(text) {
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

export function createCacheProxyRouter({
  router,
  registry,
  metrics,
  events,
  rateLimiter,
  timeoutMs = 3000,
  fetchImpl = globalThis.fetch,
}) {
  const api = Router();

  api.use((req, res, next) => {
    const client = req.get("x-api-key") || req.ip || "anonymous";
    const decision = rateLimiter.consume(client);
    req.rateLimit = decision;
    req.rateLimitClient = client;

    res.setHeader("x-ratelimit-limit", decision.limit);
    res.setHeader("x-ratelimit-remaining", decision.remaining);

    metrics.recordRateLimit(decision.allowed);

    if (!decision.allowed) {
      res.setHeader("retry-after", decision.retryAfterSeconds);
      events.add({
        eventType: "RATE_LIMIT_REJECTED",
        severity: "WARN",
        source: "rate-limiter",
        nodeId: null,
        requestId: req.requestId,
        message: "Request rejected by the token bucket",
        attributes: {
          client,
          retryAfterSeconds: decision.retryAfterSeconds,
        },
      });
      return res.status(429).json(
        errorEnvelope({
          status: 429,
          code: "RATE_LIMIT_EXCEEDED",
          message: "Too many requests",
          path: req.originalUrl,
          requestId: req.requestId,
          details: { retryAfterSeconds: decision.retryAfterSeconds },
        }),
      );
    }

    return next();
  });

  async function forward(node, method, path, payload, requestId) {
    const headers = {
      accept: "application/json",
      "x-request-id": requestId,
    };
    if (payload !== undefined) {
      headers["content-type"] = "application/json";
    }

    const response = await fetchImpl(`${node.baseUrl}${path}`, {
      method,
      headers,
      body: payload === undefined ? undefined : JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    });

    const text = await response.text();
    return {
      status: response.status,
      ok: response.ok,
      body: parseResponseBody(text),
    };
  }

  async function routeWithRetry({
    req,
    method,
    path,
    payload,
    allowRetry,
    operation,
  }) {
    const startedAt = performance.now();
    let lastError = null;
    let excludedNodeId = null;
    let attempts = allowRetry ? 2 : 1;
    let node = null;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        node = router.selectNode({ excludeNodeId: excludedNodeId });
        const result = await forward(
          node,
          method,
          path,
          payload,
          req.requestId,
        );
        return { node, result, startedAt };
      } catch (error) {
        lastError = error;
        if (error instanceof ServiceUnavailableError) {
          break;
        }
        if (node) {
          metrics.recordRouteFailure();
          registry.markFailure(node.nodeId, error.message);
          events.add({
            eventType: "ROUTE_FAILED",
            severity: "ERROR",
            source: "cache-router",
            nodeId: node.nodeId,
            requestId: req.requestId,
            message: "Router could not complete a request against a node",
            attributes: {
              operation,
              reason: String(error.message).slice(0, 200),
            },
          });
          excludedNodeId = node.nodeId;
        }
      }
    }

    const unavailable =
      lastError instanceof ServiceUnavailableError
        ? lastError
        : new ServiceUnavailableError("No cache node could serve the request");

    throw unavailable;
  }

  function sendFailure(req, res, error, operation, startedAt) {
    metrics.recordRequest({
      operation,
      result: "error",
      durationMs: performance.now() - startedAt,
    });
    if (error instanceof ServiceUnavailableError) {
      return res.status(503).json(
        errorEnvelope({
          status: 503,
          code: error.code,
          message: error.message,
          path: req.originalUrl,
          requestId: req.requestId,
        }),
      );
    }
    return res.status(502).json(
      errorEnvelope({
        status: 502,
        code: "BAD_GATEWAY",
        message: "Cache node request failed",
        path: req.originalUrl,
        requestId: req.requestId,
      }),
    );
  }

  api.put("/:key", async (req, res) => {
    const startedAt = performance.now();
    try {
      const { node, result } = await routeWithRetry({
        req,
        method: "PUT",
        path: `/api/v1/cache/${encodeURIComponent(req.params.key)}`,
        payload: req.body,
        allowRetry: false,
        operation: "put",
      });

      metrics.recordRequest({
        operation: "put",
        result: result.ok ? "stored" : "error",
        durationMs: performance.now() - startedAt,
      });

      if (!result.ok) {
        return res.status(result.status).json(result.body);
      }

      return res.status(result.status).json({
        ...result.body,
        nodeId: result.body?.nodeId ?? node.nodeId,
        requestId: req.requestId,
      });
    } catch (error) {
      return sendFailure(req, res, error, "put", startedAt);
    }
  });

  api.get("/:key", async (req, res) => {
    const startedAt = performance.now();
    try {
      const { node, result } = await routeWithRetry({
        req,
        method: "GET",
        path: `/api/v1/cache/${encodeURIComponent(req.params.key)}`,
        allowRetry: true,
        operation: "get",
      });

      if (result.ok) {
        metrics.recordRequest({
          operation: "get",
          result: "hit",
          durationMs: performance.now() - startedAt,
        });
        return res.status(result.status).json({
          ...result.body,
          nodeId: result.body?.nodeId ?? node.nodeId,
          requestId: req.requestId,
        });
      }

      metrics.recordRequest({
        operation: "get",
        result: result.status === 404 ? "miss" : "error",
        durationMs: performance.now() - startedAt,
      });

      return res.status(result.status).json(result.body);
    } catch (error) {
      return sendFailure(req, res, error, "get", startedAt);
    }
  });

  api.delete("/:key", async (req, res) => {
    const startedAt = performance.now();
    try {
      const { node, result } = await routeWithRetry({
        req,
        method: "DELETE",
        path: `/api/v1/cache/${encodeURIComponent(req.params.key)}`,
        allowRetry: false,
        operation: "delete",
      });

      if (result.status === 404) {
        metrics.recordRequest({
          operation: "delete",
          result: "miss",
          durationMs: performance.now() - startedAt,
        });
        return res.status(200).json({
          key: req.params.key,
          deleted: false,
          nodeId: node.nodeId,
          requestId: req.requestId,
        });
      }

      metrics.recordRequest({
        operation: "delete",
        result: result.ok ? "deleted" : "error",
        durationMs: performance.now() - startedAt,
      });

      if (!result.ok) {
        return res.status(result.status).json(result.body);
      }

      return res.status(200).json({
        key: req.params.key,
        deleted: true,
        nodeId: node.nodeId,
        requestId: req.requestId,
      });
    } catch (error) {
      return sendFailure(req, res, error, "delete", startedAt);
    }
  });

  return api;
}
