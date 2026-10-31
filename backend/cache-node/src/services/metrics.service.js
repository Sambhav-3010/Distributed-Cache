import { summarizeLatencies } from "@cachegrid/common/latency";

const MAX_LATENCY_SAMPLES = 1000;

export class MetricsService {
  #counters = {
    requestsTotal: 0,
    hitsTotal: 0,
    missesTotal: 0,
    errorsTotal: 0,
    evictionsTotal: 0,
    expirationsTotal: 0,
    putsTotal: 0,
    getsTotal: 0,
    deletesTotal: 0,
  };

  #latencies = [];
  #startedAt = Date.now();

  recordRequest({ operation, result, durationMs }) {
    this.#counters.requestsTotal += 1;
    this.#counters.errorsTotal += result === "error" ? 1 : 0;

    if (operation === "put") {
      this.#counters.putsTotal += 1;
    } else if (operation === "get") {
      this.#counters.getsTotal += 1;
      this.#counters.hitsTotal += result === "hit" ? 1 : 0;
      this.#counters.missesTotal += result === "miss" ? 1 : 0;
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

  recordEviction() {
    this.#counters.evictionsTotal += 1;
  }

  recordExpiration() {
    this.#counters.expirationsTotal += 1;
  }

  snapshot({ entries = 0 } = {}) {
    return {
      ...this.#counters,
      entries,
      uptimeSeconds: Math.round((Date.now() - this.#startedAt) / 1000),
      latency: summarizeLatencies(this.#latencies),
    };
  }
}
