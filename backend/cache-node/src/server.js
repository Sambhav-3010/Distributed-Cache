import { createApp } from "./app.js";
import { config } from "./config.js";

const app = createApp({ config });

const server = app.listen(config.port, () => {
  console.log(
    `Cache Node ${config.nodeId} is running on http://localhost:${config.port} ` +
      `(policy=${config.evictionPolicy}, capacity=${config.capacity})`,
  );
});

const cleanupTimer = setInterval(() => {
  const removed = app.locals.cacheService?.cleanupExpired() ?? 0;
  if (removed > 0) {
    console.log(`Expired ${removed} cache ${removed === 1 ? "entry" : "entries"}`);
  }
}, config.cleanupIntervalMs);
cleanupTimer.unref();

function shutdown(signal) {
  console.log(`${signal} received, shutting down Cache Node`);
  clearInterval(cleanupTimer);
  server.close(() => process.exit(0));
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
