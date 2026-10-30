export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = new.target.name;
    this.status = status;
  }
}

export class InvalidInputError extends HttpError {
  constructor(message) {
    super(400, message);
  }
}

export class KeyNotFoundError extends HttpError {
  constructor(key) {
    super(404, `Key not found: ${key}`);
  }
}
