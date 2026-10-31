import { summarizeLatencies } from "@cachegrid/common/latency";

const MAX_LATENCY_SAMPLES = 2000;

export class GatewayMetricsService {
  #counters = {
    requestsTotal: 0,
    routedTotal: 0,
    routeFailuresTotal: 0,
    rateLimitAllowedTotal: 0,
    rateLimitRejectedTotal: 0,
    errorsTotal: 0,
    putsTotal: 0,
    getsTotal: 0,
    deletesTotal: 0,
  };

  #latencies = [];
  #startedAt = Date.now();

  recordRequest({ operation, result, durationMs }) {
    this.#counters.requestsTotal += 1;
    this.#counters.errorsTotal += result === "error" ? 1 : 0;
    this.#counters.routedTotal += result === "error" ? 0 : 1;

    if (operation === "put") {
      this.#counters.putsTotal += 1;
    } else if (operation === "get") {
      this.#counters.getsTotal += 1;
    } else if (operation === "delete") {
      this.#counters.deletesTotal += 1;
    }

    if (Number.isFinite(durationMs)) {
      this.#latencies.push(durationMs);
      if (this.#latencies.length > MAX_LATENCY_SAMPLES) {
        this.#latencies.shift();
      }
    }
  }

  recordRouteFailure() {
    this.#counters.routeFailuresTotal += 1;
  }

  recordRateLimit(allowed) {
    if (allowed) {
      this.#counters.rateLimitAllowedTotal += 1;
    } else {
      this.#counters.rateLimitRejectedTotal += 1;
    }
  }

  snapshot() {
    return {
      ...this.#counters,
      uptimeSeconds: Math.round((Date.now() - this.#startedAt) / 1000),
      latency: summarizeLatencies(this.#latencies),
    };
  }
}
