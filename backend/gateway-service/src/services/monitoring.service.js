import { round } from "@cachegrid/common/latency";

function sumMetric(nodes, key) {
  return nodes.reduce((sum, node) => sum + (node.metrics?.[key] ?? 0), 0);
}

export class MonitoringService {
  #registry;
  #gatewayMetrics;
  #rateLimiter;
  #events;
  #clusterId;
  #fetchImpl;
  #timeoutMs;

  constructor({
    registry,
    gatewayMetrics,
    rateLimiter,
    events,
    clusterId,
    timeoutMs = 1500,
    fetchImpl = globalThis.fetch,
  }) {
    this.#registry = registry;
    this.#gatewayMetrics = gatewayMetrics;
    this.#rateLimiter = rateLimiter;
    this.#events = events;
    this.#clusterId = clusterId;
    this.#timeoutMs = timeoutMs;
    this.#fetchImpl = fetchImpl;
  }

  getClusterStatus() {
    const nodes = this.#registry.getNodes();
    return {
      generatedAt: new Date().toISOString(),
      clusterId: this.#clusterId,
      totalNodes: nodes.length,
      healthyNodes: nodes.filter((node) => node.status === "UP").length,
      nodes: nodes.map((node) => ({
        nodeId: node.nodeId,
        baseUrl: node.baseUrl,
        status: node.status,
        lastHeartbeatAt: node.lastHeartbeatAt,
        consecutiveFailures: node.consecutiveFailures,
        lastError: node.lastError,
        cache: node.cache,
      })),
    };
  }

  getClusterMetrics() {
    const nodes = this.#registry.getNodes();
    const nodesWithMetrics = nodes.filter((node) => node.metrics);
    const hitsTotal = sumMetric(nodesWithMetrics, "hitsTotal");
    const missesTotal = sumMetric(nodesWithMetrics, "missesTotal");
    const lookups = hitsTotal + missesTotal;
    const gateway = this.#gatewayMetrics.snapshot();

    return {
      generatedAt: new Date().toISOString(),
      clusterId: this.#clusterId,
      cluster: {
        totalNodes: nodes.length,
        healthyNodes: nodes.filter((node) => node.status === "UP").length,
        entries: sumMetric(nodesWithMetrics, "entries"),
        requestsTotal: sumMetric(nodesWithMetrics, "requestsTotal"),
        hitsTotal,
        missesTotal,
        evictionsTotal: sumMetric(nodesWithMetrics, "evictionsTotal"),
        expirationsTotal: sumMetric(nodesWithMetrics, "expirationsTotal"),
        hitRate: lookups === 0 ? 0 : round((hitsTotal / lookups) * 100),
        latency: gateway.latency,
        staleNodes: nodes.length - nodesWithMetrics.length,
      },
      gateway,
      rateLimits: {
        allowed: gateway.rateLimitAllowedTotal,
        rejected: gateway.rateLimitRejectedTotal,
        policy: this.#rateLimiter.policy,
      },
      nodes: nodes.map((node) => ({
        ...node,
        metrics: node.metrics ?? null,
      })),
    };
  }

  async getEvents({
    limit = 100,
    severity,
    type,
    nodeId,
  } = {}) {
    const boundedLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);
    const nodeEvents = await Promise.all(
      this.#registry
        .getNodes()
        .filter((node) => node.status === "UP")
        .map((node) => this.#fetchNodeEvents(node, boundedLimit)),
    );

    const merged = [...this.#events.list({ limit: 500 }), ...nodeEvents.flat()]
      .filter((event) => !severity || event.severity === severity)
      .filter((event) => !type || event.eventType === type)
      .filter((event) => !nodeId || event.nodeId === nodeId)
      .sort(
        (left, right) =>
          new Date(right.occurredAt).getTime() -
          new Date(left.occurredAt).getTime(),
      )
      .slice(0, boundedLimit);

    return {
      generatedAt: new Date().toISOString(),
      events: merged,
    };
  }

  getRateLimitMetrics() {
    const snapshot = this.#gatewayMetrics.snapshot();
    return {
      allowed: snapshot.rateLimitAllowedTotal,
      rejected: snapshot.rateLimitRejectedTotal,
      ...this.#rateLimiter.snapshot(),
    };
  }

  getNodeMetrics(nodeId) {
    const node = this.#registry.getNode(nodeId);
    return node ? this.#registry.getNodes().find((item) => item.nodeId === nodeId) : null;
  }

  getNodeHealth(nodeId) {
    const node = this.#registry.getNode(nodeId);
    if (!node) {
      return null;
    }
    return {
      nodeId: node.id,
      status: node.status,
      lastHeartbeatAt: node.lastHeartbeatAt,
      consecutiveFailures: node.consecutiveFailures,
      lastError: node.lastError,
    };
  }

  async #fetchNodeEvents(node, limit) {
    try {
      const response = await this.#fetchImpl(
        `${node.baseUrl}/api/v1/events?limit=${limit}`,
        {
          headers: { accept: "application/json" },
          signal: AbortSignal.timeout(this.#timeoutMs),
        },
      );
      if (!response.ok) {
        return [];
      }
      const body = await response.json();
      return Array.isArray(body.events) ? body.events : [];
    } catch {
      return [];
    }
  }
}
