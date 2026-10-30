import express from "express";
import { CacheService } from "./services/cache.service.js";
import { createCacheRouter } from "./routes/cache.routes.js";
import { createHealthRouter } from "./routes/health.routes.js";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.js";

export function createApp({ cacheService = new CacheService() } = {}) {
  const app = express();

  app.disable("x-powered-by");
  app.use(express.json());
  app.use(createHealthRouter());
  app.use("/cache", createCacheRouter(cacheService));
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
