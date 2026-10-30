import { Router } from "express";
import { InvalidInputError, KeyNotFoundError } from "../errors.js";

export function createCacheRouter(cacheService) {
  const router = Router();

  router.post("/", (req, res, next) => {
    try {
      const { key, value } = req.query;
      const normalizedKey = typeof key === "string" ? key.trim() : "";

      if (!normalizedKey) {
        throw new InvalidInputError("Key must not be null or empty");
      }
      if (typeof value !== "string") {
        throw new InvalidInputError("Value must not be null");
      }

      const entry = cacheService.put(normalizedKey, value);
      res.status(201).json(entry);
    } catch (error) {
      next(error);
    }
  });

  router.get("/:key", (req, res, next) => {
    try {
      const entry = cacheService.get(req.params.key);
      if (!entry) {
        throw new KeyNotFoundError(req.params.key);
      }
      res.json(entry);
    } catch (error) {
      next(error);
    }
  });

  router.delete("/:key", (req, res, next) => {
    try {
      const deleted = cacheService.delete(req.params.key);
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
