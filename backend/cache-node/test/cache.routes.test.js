import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";
import request from "supertest";
import { createApp } from "../src/app.js";
import { CacheService } from "../src/services/cache.service.js";

describe("Cache routes", () => {
  let app;
  let cacheService;

  beforeEach(() => {
    cacheService = new CacheService();
    app = createApp({ cacheService });
  });

  test("stores and retrieves an entry", async () => {
    const created = await request(app)
      .post("/cache")
      .query({ key: "user:101", value: "Sambhav" });

    assert.equal(created.status, 201);
    assert.deepEqual(created.body, { key: "user:101", value: "Sambhav" });

    const retrieved = await request(app).get("/cache/user:101");

    assert.equal(retrieved.status, 200);
    assert.deepEqual(retrieved.body, { key: "user:101", value: "Sambhav" });
  });

  test("updates and deletes an entry", async () => {
    cacheService.put("user:101", "Sambhav");

    const updated = await request(app)
      .post("/cache")
      .query({ key: "user:101", value: "Sambhav Tripathi" });

    assert.equal(updated.status, 201);

    const retrieved = await request(app).get("/cache/user:101");
    assert.equal(retrieved.body.value, "Sambhav Tripathi");

    const deleted = await request(app).delete("/cache/user:101");
    assert.equal(deleted.status, 204);

    const missing = await request(app).get("/cache/user:101");
    assert.equal(missing.status, 404);
  });

  test("rejects blank keys and missing values", async () => {
    const blankKey = await request(app)
      .post("/cache")
      .query({ key: "   ", value: "value" });

    assert.equal(blankKey.status, 400);
    assert.equal(blankKey.body.status, 400);

    const missingValue = await request(app)
      .post("/cache")
      .query({ key: "user:101" });

    assert.equal(missingValue.status, 400);
    assert.equal(missingValue.body.status, 400);
  });

  test("returns 404 for missing keys on get and delete", async () => {
    const missingGet = await request(app).get("/cache/does-not-exist");
    assert.equal(missingGet.status, 404);
    assert.equal(missingGet.body.status, 404);

    const missingDelete = await request(app).delete("/cache/does-not-exist");
    assert.equal(missingDelete.status, 404);
    assert.equal(missingDelete.body.status, 404);
  });

  test("handles parallel HTTP writes", async () => {
    const writes = Array.from({ length: 100 }, (_, index) =>
      request(app)
        .post("/cache")
        .query({ key: `key:${index}`, value: `value:${index}` }),
    );

    const responses = await Promise.all(writes);

    for (const response of responses) {
      assert.equal(response.status, 201);
    }
    assert.equal(cacheService.size(), 100);
  });

  test("returns a 404 envelope for unknown routes", async () => {
    const response = await request(app).get("/unknown");

    assert.equal(response.status, 404);
    assert.equal(response.body.status, 404);
  });
});

describe("Health routes", () => {
  const app = createApp();

  test("exposes the health endpoint", async () => {
    const response = await request(app).get("/health");

    assert.equal(response.status, 200);
    assert.equal(response.text, "Cache Node is running");
  });

  test("exposes an actuator-style health endpoint", async () => {
    const response = await request(app).get("/actuator/health");

    assert.equal(response.status, 200);
    assert.deepEqual(response.body, { status: "UP" });
  });
});
