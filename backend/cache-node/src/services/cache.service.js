function normalizePolicy(policy) {
  return String(policy ?? "LRU").toUpperCase() === "LFU" ? "LFU" : "LRU";
}

export class CacheService {
  #store = new Map();
  #capacity;
  #defaultTtlSeconds;
  #evictionPolicy;
  #clock;
  #onEviction;
  #onExpiration;

  constructor({
    capacity = 10000,
    defaultTtlSeconds = 300,
    evictionPolicy = "LRU",
    clock = () => Date.now(),
    onEviction = () => {},
    onExpiration = () => {},
  } = {}) {
    this.#capacity = Math.max(1, Number(capacity) || 1);
    this.#defaultTtlSeconds = Number(defaultTtlSeconds) || 0;
    this.#evictionPolicy = normalizePolicy(evictionPolicy);
    this.#clock = clock;
    this.#onEviction = onEviction;
    this.#onExpiration = onExpiration;
  }

  get capacity() {
    return this.#capacity;
  }

  get defaultTtlSeconds() {
    return this.#defaultTtlSeconds;
  }

  get evictionPolicy() {
    return this.#evictionPolicy;
  }

  put(key, value, ttlSeconds = null) {
    const now = this.#clock();
    let existing = this.#store.get(key);

    if (existing?.expiresAt !== null && existing?.expiresAt !== undefined && existing.expiresAt <= now) {
      this.#store.delete(key);
      this.#onExpiration();
      existing = null;
    }

    if (!existing && this.#store.size >= this.#capacity) {
      this.#purgeExpired(now);
      if (this.#store.size >= this.#capacity) {
        this.#evictOne();
      }
    }

    const effectiveTtl =
      ttlSeconds === null || ttlSeconds === undefined
        ? this.#defaultTtlSeconds
        : Number(ttlSeconds);
    const expiresAt =
      effectiveTtl > 0 ? now + effectiveTtl * 1000 : null;

    const entry = {
      key,
      value,
      createdAt: existing?.createdAt ?? now,
      lastAccessedAt: now,
      expiresAt,
      frequency: (existing?.frequency ?? 0) + 1,
    };

    if (this.#evictionPolicy === "LRU") {
      this.#store.delete(key);
      this.#store.set(key, entry);
    } else {
      this.#store.set(key, entry);
    }

    return this.#toPublicEntry(entry);
  }

  get(key) {
    const entry = this.#store.get(key);
    if (!entry) {
      return null;
    }

    const now = this.#clock();
    if (entry.expiresAt !== null && entry.expiresAt <= now) {
      this.#store.delete(key);
      this.#onExpiration();
      return null;
    }

    entry.lastAccessedAt = now;
    entry.frequency += 1;

    if (this.#evictionPolicy === "LRU") {
      this.#store.delete(key);
      this.#store.set(key, entry);
    }

    return this.#toPublicEntry(entry);
  }

  delete(key) {
    const entry = this.#store.get(key);
    if (!entry) {
      return false;
    }

    if (entry.expiresAt !== null && entry.expiresAt <= this.#clock()) {
      this.#store.delete(key);
      this.#onExpiration();
      return false;
    }

    return this.#store.delete(key);
  }

  exists(key) {
    return this.get(key) !== null;
  }

  size() {
    return this.#store.size;
  }

  clear() {
    this.#store.clear();
  }

  cleanupExpired() {
    const now = this.#clock();
    let removed = 0;

    for (const [key, entry] of this.#store) {
      if (entry.expiresAt !== null && entry.expiresAt <= now) {
        this.#store.delete(key);
        removed += 1;
        this.#onExpiration();
      }
    }

    return removed;
  }

  #purgeExpired(now) {
    for (const [key, entry] of this.#store) {
      if (entry.expiresAt !== null && entry.expiresAt <= now) {
        this.#store.delete(key);
        this.#onExpiration();
      }
    }
  }

  #evictOne() {
    let victimKey = null;

    if (this.#evictionPolicy === "LRU") {
      victimKey = this.#store.keys().next().value ?? null;
    } else {
      let victim = null;
      for (const [key, entry] of this.#store) {
        if (
          victim === null ||
          entry.frequency < victim.frequency ||
          (entry.frequency === victim.frequency &&
            entry.lastAccessedAt < victim.lastAccessedAt)
        ) {
          victim = { key, ...entry };
        }
      }
      victimKey = victim?.key ?? null;
    }

    if (victimKey !== null) {
      this.#store.delete(victimKey);
      this.#onEviction();
    }
  }

  #toPublicEntry(entry) {
    return {
      key: entry.key,
      value: entry.value,
      createdAt: new Date(entry.createdAt).toISOString(),
      lastAccessedAt: new Date(entry.lastAccessedAt).toISOString(),
      expiresAt:
        entry.expiresAt === null ? null : new Date(entry.expiresAt).toISOString(),
      frequency: entry.frequency,
    };
  }
}
