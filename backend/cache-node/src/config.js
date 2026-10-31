function integerFromEnv(name, fallback) {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function policyFromEnv() {
  const policy = String(process.env.CACHE_EVICTION_POLICY ?? "LRU").toUpperCase();
  return policy === "LFU" ? "LFU" : "LRU";
}

export const config = {
  port: integerFromEnv("PORT", 8000),
  nodeId: process.env.CACHE_NODE_ID ?? "node-1",
  capacity: integerFromEnv("CACHE_CAPACITY", 10000),
  defaultTtlSeconds: integerFromEnv("CACHE_DEFAULT_TTL_SECONDS", 300),
  evictionPolicy: policyFromEnv(),
  cleanupIntervalMs: integerFromEnv("CACHE_CLEANUP_INTERVAL_MS", 60000),
};
