import { HttpError, errorEnvelope } from "@cachegrid/common/errors";

export function notFoundHandler(req, res) {
  res.status(404).json(
    errorEnvelope({
      status: 404,
      code: "ROUTE_NOT_FOUND",
      message: `Route not found: ${req.method} ${req.path}`,
      path: req.originalUrl,
      requestId: req.requestId,
    }),
  );
}

export function errorHandler(error, req, res, _next) {
  const status = error instanceof HttpError ? error.status : 500;
  const code = error instanceof HttpError ? error.code : "INTERNAL_ERROR";
  const message = status === 500 ? "Internal server error" : error.message;

  if (status === 500) {
    console.error(error);
  }

  res.status(status).json(
    errorEnvelope({
      status,
      code,
      message,
      path: req.originalUrl,
      requestId: req.requestId,
      details: error instanceof HttpError ? error.details : null,
    }),
  );
}
