import { Router } from "express";
import {
  InvalidInputError,
  KeyNotFoundError,
} from "@cachegrid/common/errors";

function validateKey(key) {
  const normalizedKey = typeof key === "string" ? key.trim() : "";
  if (!normalizedKey) {
    throw new InvalidInputError("Key must not be null or empty");
  }
  return normalizedKey;
}

function validateValue(value) {
  if (typeof value !== "string") {
    throw new InvalidInputError("Value must not be null");
  }
  return value;
}

function parseTtl(ttlSeconds) {
  if (ttlSeconds === undefined || ttlSeconds === null || ttlSeconds === "") {
    return null;
  }

  const parsed = Number(ttlSeconds);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new InvalidInputError(
      "ttlSeconds must be a positive number",
      "INVALID_TTL",
    );
  }
  return parsed;
}

export function createCacheRouter({ cacheService, metrics, nodeId }) {
  const router = Router();

  function store({ key, value, ttlSeconds, requestId, res }) {
    const startedAt = performance.now();
    const normalizedKey = validateKey(key);
    const normalizedValue = validateValue(value);
    const parsedTtl = parseTtl(ttlSeconds);

    const entry = cacheService.put(
      normalizedKey,
      normalizedValue,
      parsedTtl,
    );

    metrics.recordRequest({
      operation: "put",
      result: "stored",
      durationMs: performance.now() - startedAt,
    });

    return res.status(201).json({
      ...entry,
      nodeId,
      requestId,
    });
  }

  router.post("/", (req, res, next) => {
    try {
      store({
        key: req.query.key,
        value: req.query.value,
        ttlSeconds: req.query.ttlSeconds,
        requestId: req.requestId,
        res,
      });
    } catch (error) {
      if (!(error instanceof InvalidInputError)) {
        metrics.recordRequest({
          operation: "put",
          result: "error",
          durationMs: 0,
        });
      }
      next(error);
    }
  });

  router.put("/:key", (req, res, next) => {
    try {
      store({
        key: req.params.key,
        value: req.body?.value,
        ttlSeconds: req.body?.ttlSeconds,
        requestId: req.requestId,
        res,
      });
    } catch (error) {
      if (!(error instanceof InvalidInputError)) {
        metrics.recordRequest({
          operation: "put",
          result: "error",
          durationMs: 0,
        });
      }
      next(error);
    }
  });

  router.get("/:key", (req, res, next) => {
    const startedAt = performance.now();
    try {
      const entry = cacheService.get(req.params.key);
      metrics.recordRequest({
        operation: "get",
        result: entry ? "hit" : "miss",
        durationMs: performance.now() - startedAt,
      });

      if (!entry) {
        throw new KeyNotFoundError(req.params.key);
      }

      res.json({ ...entry, nodeId, requestId: req.requestId });
    } catch (error) {
      next(error);
    }
  });

  router.delete("/:key", (req, res, next) => {
    const startedAt = performance.now();
    try {
      const deleted = cacheService.delete(req.params.key);
      metrics.recordRequest({
        operation: "delete",
        result: deleted ? "deleted" : "miss",
        durationMs: performance.now() - startedAt,
      });

      if (!deleted) {
        throw new KeyNotFoundError(req.params.key);
      }

      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  return router;
}
