export class NodeRegistry {
  #nodes = new Map();
  #events;
  #healthIntervalMs;
  #healthTimeoutMs;
  #failureThreshold;
  #fetchImpl;
  #timer = null;

  constructor({
    nodes,
    events,
    healthIntervalMs = 5000,
    healthTimeoutMs = 1500,
    failureThreshold = 3,
    fetchImpl = globalThis.fetch,
  }) {
    this.#events = events;
    this.#healthIntervalMs = healthIntervalMs;
    this.#healthTimeoutMs = healthTimeoutMs;
    this.#failureThreshold = failureThreshold;
    this.#fetchImpl = fetchImpl;

    for (const node of nodes) {
      this.#nodes.set(node.id, {
        id: node.id,
        baseUrl: node.baseUrl,
        status: "UNKNOWN",
        lastHeartbeatAt: null,
        consecutiveFailures: 0,
        lastError: null,
        lastMetrics: null,
        cache: null,
      });
    }
  }

  async start() {
    await this.checkAll();
    this.#timer = setInterval(() => {
      void this.checkAll();
    }, this.#healthIntervalMs);
    this.#timer.unref();
  }

  stop() {
    if (this.#timer) {
      clearInterval(this.#timer);
      this.#timer = null;
    }
  }

  async checkAll() {
    await Promise.all(
      [...this.#nodes.values()].map((node) => this.#checkNode(node)),
    );
  }

  async #checkNode(node) {
    try {
      const response = await this.#fetchImpl(`${node.baseUrl}/api/v1/status`, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(this.#healthTimeoutMs),
      });

      if (!response.ok) {
        throw new Error(`status endpoint returned ${response.status}`);
      }

      const body = await response.json();
      const wasDown = node.status === "DOWN";

      node.status = "UP";
      node.lastHeartbeatAt = new Date().toISOString();
      node.consecutiveFailures = 0;
      node.lastError = null;
      node.lastMetrics = body.metrics ?? null;
      node.cache = body.cache ?? null;

      if (wasDown) {
        this.#events.add({
          eventType: "NODE_RECOVERED",
          severity: "INFO",
          source: "cache-router",
          nodeId: node.id,
          message: "Node health check succeeded again",
          attributes: {},
        });
      }
    } catch (error) {
      this.markFailure(node, error.message, { source: "health-check" });
    }
  }

  markFailure(nodeOrId, reason, { source = "router" } = {}) {
    const node =
      typeof nodeOrId === "string" ? this.#nodes.get(nodeOrId) : nodeOrId;
    if (!node) {
      return;
    }

    node.consecutiveFailures += 1;
    node.lastError = String(reason);

    if (
      node.consecutiveFailures >= this.#failureThreshold &&
      node.status !== "DOWN"
    ) {
      node.status = "DOWN";
      this.#events.add({
        eventType: "NODE_UNHEALTHY",
        severity: "WARN",
        source,
        nodeId: node.id,
        message: "Node marked unhealthy after repeated failures",
        attributes: {
          consecutiveFailures: node.consecutiveFailures,
          reason: String(reason).slice(0, 200),
        },
      });
    }
  }

  getNode(nodeId) {
    return this.#nodes.get(nodeId) ?? null;
  }

  getNodes() {
    return [...this.#nodes.values()].map((node) => this.#publicNode(node));
  }

  getHealthyNodes() {
    return [...this.#nodes.values()]
      .filter((node) => node.status === "UP")
      .map((node) => this.#publicNode(node));
  }

  #publicNode(node) {
    return {
      nodeId: node.id,
      baseUrl: node.baseUrl,
      status: node.status,
      lastHeartbeatAt: node.lastHeartbeatAt,
      consecutiveFailures: node.consecutiveFailures,
      lastError: node.lastError,
      cache: node.cache,
      metrics: node.lastMetrics,
    };
  }
}
