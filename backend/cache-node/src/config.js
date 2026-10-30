const parsedPort = Number.parseInt(process.env.PORT ?? "8000", 10);

export const config = {
  port: Number.isNaN(parsedPort) ? 8000 : parsedPort,
  nodeId: process.env.CACHE_NODE_ID ?? "node-1",
};
