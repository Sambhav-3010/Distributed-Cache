import { HttpError } from "../errors.js";

export function notFoundHandler(req, res) {
  res.status(404).json({
    status: 404,
    message: `Route not found: ${req.method} ${req.path}`,
  });
}

export function errorHandler(error, _req, res, _next) {
  const status = error instanceof HttpError ? error.status : 500;
  const message =
    status === 500 ? "Internal server error" : error.message;

  if (status === 500) {
    console.error(error);
  }

  res.status(status).json({ status, message });
}
