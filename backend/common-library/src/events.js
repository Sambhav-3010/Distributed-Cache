import { newEventId } from "./ids.js";

const SEVERITIES = new Set(["DEBUG", "INFO", "WARN", "ERROR"]);

export class EventStore {
  #events = [];
  #limit;

  constructor({ limit = 500 } = {}) {
    this.#limit = limit;
  }

  add({
    eventType,
    severity = "INFO",
    source,
    nodeId = null,
    requestId = null,
    message = "",
    attributes = {},
  }) {
    const event = {
      eventId: newEventId(),
      eventType,
      occurredAt: new Date().toISOString(),
      severity: SEVERITIES.has(severity) ? severity : "INFO",
      source,
      nodeId,
      requestId,
      message,
      attributes,
    };

    this.#events.unshift(event);
    if (this.#events.length > this.#limit) {
      this.#events.length = this.#limit;
    }

    return event;
  }

  list({ limit = 100, severity, type, nodeId } = {}) {
    const boundedLimit = Math.min(Math.max(Number(limit) || 100, 1), this.#limit);

    return this.#events
      .filter((event) => !severity || event.severity === severity)
      .filter((event) => !type || event.eventType === type)
      .filter((event) => !nodeId || event.nodeId === nodeId)
      .slice(0, boundedLimit);
  }

  size() {
    return this.#events.length;
  }
}
