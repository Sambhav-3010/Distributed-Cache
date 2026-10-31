import { newRequestId } from "@cachegrid/common/ids";

export function requestIdMiddleware(req, res, next) {
  const requestId = req.get("x-request-id") || newRequestId();
  req.requestId = requestId;
  res.setHeader("x-request-id", requestId);
  next();
}
