import { createApp } from "./app.js";
import { config } from "./config.js";

const app = createApp();

const server = app.listen(config.port, () => {
  console.log(
    `Cache Node ${config.nodeId} is running on http://localhost:${config.port}`,
  );
});

function shutdown(signal) {
  console.log(`${signal} received, shutting down Cache Node`);
  server.close(() => process.exit(0));
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
