export function corsMiddleware(originConfig = "*") {
  return (req, res, next) => {
    const requestOrigin = req.get("origin");
    const allowOrigin =
      originConfig === "*" ? "*" : requestOrigin || originConfig;

    res.setHeader("access-control-allow-origin", allowOrigin);
    res.setHeader(
      "access-control-allow-methods",
      "GET,POST,PUT,DELETE,OPTIONS",
    );
    res.setHeader(
      "access-control-allow-headers",
      "content-type,x-request-id,x-api-key",
    );
    res.setHeader(
      "access-control-expose-headers",
      "x-request-id,x-ratelimit-limit,x-ratelimit-remaining,retry-after",
    );
    res.setHeader("vary", "origin");

    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }

    next();
  };
}
