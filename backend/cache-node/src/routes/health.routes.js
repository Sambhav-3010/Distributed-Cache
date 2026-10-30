import { Router } from "express";

export function createHealthRouter() {
  const router = Router();

  router.get("/health", (_req, res) => {
    res.type("text/plain").send("Cache Node is running");
  });

  router.get("/actuator/health", (_req, res) => {
    res.json({ status: "UP" });
  });

  return router;
}
