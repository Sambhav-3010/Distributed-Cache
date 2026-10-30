export class CacheService {
  #store = new Map();

  put(key, value) {
    const entry = { key, value };
    this.#store.set(key, entry);
    return entry;
  }

  get(key) {
    return this.#store.get(key) ?? null;
  }

  delete(key) {
    return this.#store.delete(key);
  }

  exists(key) {
    return this.#store.has(key);
  }

  size() {
    return this.#store.size;
  }

  clear() {
    this.#store.clear();
  }
}
