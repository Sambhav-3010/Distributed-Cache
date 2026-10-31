function integerFromEnv(name, fallback) {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function numberFromEnv(name, fallback) {
  const parsed = Number.parseFloat(process.env[name] ?? "");
  return Number.isNaN(parsed) ? fallback : parsed;
}

function parseNodes(rawValue) {
  return String(rawValue)
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part, index) => {
      const separator = part.indexOf("=");
      if (separator === -1) {
        return { id: `node-${index + 1}`, baseUrl: part.replace(/\/$/, "") };
      }
      return {
        id: part.slice(0, separator).trim(),
        baseUrl: part.slice(separator + 1).trim().replace(/\/$/, ""),
      };
    });
}

const nodes = parseNodes(
  process.env.CACHE_NODES ?? "node-1=http://localhost:8000",
);

export const config = {
  port: integerFromEnv("PORT", 8001),
  clusterId: process.env.CLUSTER_ID ?? "cachegrid-local",
  nodes,
  healthIntervalMs: integerFromEnv("NODE_HEALTH_INTERVAL_MS", 5000),
  healthTimeoutMs: integerFromEnv("NODE_HEALTH_TIMEOUT_MS", 1500),
  failureThreshold: integerFromEnv("NODE_FAILURE_THRESHOLD", 3),
  routerTimeoutMs: integerFromEnv("ROUTER_TIMEOUT_MS", 3000),
  eventLimit: integerFromEnv("EVENT_HISTORY_LIMIT", 500),
  corsOrigin: process.env.CORS_ORIGIN ?? "*",
  rateLimit: {
    capacity: integerFromEnv("RATE_LIMIT_CAPACITY", 60),
    refillPerSecond: numberFromEnv("RATE_LIMIT_REFILL_PER_SECOND", 1),
  },
};
