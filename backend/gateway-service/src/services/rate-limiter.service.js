export class TokenBucketRateLimiter {
  #capacity;
  #refillPerSecond;
  #buckets = new Map();
  #clock;

  constructor({
    capacity = 60,
    refillPerSecond = 1,
    clock = () => Date.now(),
  } = {}) {
    this.#capacity = Math.max(1, capacity);
    this.#refillPerSecond = Math.max(0.001, refillPerSecond);
    this.#clock = clock;
  }

  get policy() {
    return {
      id: "default",
      capacity: this.#capacity,
      refillPerSecond: this.#refillPerSecond,
    };
  }

  updatePolicy({ capacity, refillPerSecond }) {
    if (capacity !== undefined) {
      this.#capacity = Math.max(1, Number(capacity));
    }
    if (refillPerSecond !== undefined) {
      this.#refillPerSecond = Math.max(0.001, Number(refillPerSecond));
    }
    for (const bucket of this.#buckets.values()) {
      bucket.tokens = Math.min(bucket.tokens, this.#capacity);
    }
    return this.policy;
  }

  consume(key) {
    const now = this.#clock();
    const bucket = this.#buckets.get(key) ?? {
      tokens: this.#capacity,
      lastRefillAt: now,
    };

    const elapsedSeconds = Math.max(0, (now - bucket.lastRefillAt) / 1000);
    bucket.tokens = Math.min(
      this.#capacity,
      bucket.tokens + elapsedSeconds * this.#refillPerSecond,
    );
    bucket.lastRefillAt = now;

    const allowed = bucket.tokens >= 1;
    if (allowed) {
      bucket.tokens -= 1;
    }

    this.#buckets.set(key, bucket);

    const retryAfterSeconds = allowed
      ? 0
      : Math.max(1, Math.ceil((1 - bucket.tokens) / this.#refillPerSecond));

    return {
      allowed,
      limit: this.#capacity,
      remaining: Math.floor(bucket.tokens),
      retryAfterSeconds,
    };
  }

  snapshot() {
    return {
      policy: this.policy,
      clients: [...this.#buckets.entries()].map(([key, bucket]) => ({
        client: key,
        remaining: Math.floor(bucket.tokens),
        lastRefillAt: new Date(bucket.lastRefillAt).toISOString(),
      })),
    };
  }
}
