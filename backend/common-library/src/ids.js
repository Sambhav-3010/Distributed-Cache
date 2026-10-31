import { randomUUID } from "node:crypto";

export function newRequestId() {
  return `req-${randomUUID()}`;
}

export function newEventId() {
  return `evt-${randomUUID()}`;
}

export function newRecommendationId() {
  return `rec-${randomUUID()}`;
}
