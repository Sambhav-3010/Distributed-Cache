export class HttpError extends Error {
  constructor(status, code, message, details = null) {
    super(message);
    this.name = new.target.name;
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export class InvalidInputError extends HttpError {
  constructor(message, code = "INVALID_INPUT") {
    super(400, code, message);
  }
}

export class KeyNotFoundError extends HttpError {
  constructor(key) {
    super(404, "CACHE_KEY_NOT_FOUND", `Key not found: ${key}`);
  }
}

export class ServiceUnavailableError extends HttpError {
  constructor(message = "No healthy cache nodes are available") {
    super(503, "NO_HEALTHY_NODES", message);
  }
}

export function errorEnvelope({
  status,
  code,
  message,
  path,
  requestId,
  details = null,
}) {
  return {
    timestamp: new Date().toISOString(),
    status,
    code,
    message,
    path,
    requestId,
    ...(details ? { details } : {}),
  };
}
