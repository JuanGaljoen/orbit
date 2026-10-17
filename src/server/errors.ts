/** Domain errors. Callers (actions, API, AI tools) map these to user-facing messages / HTTP codes. */
export class NotFoundError extends Error {
  readonly code = "not_found";
}

export class ConflictError extends Error {
  readonly code = "conflict";
}

export class InvalidError extends Error {
  readonly code = "invalid";
}

export type DomainError = NotFoundError | ConflictError | InvalidError;

export function isDomainError(err: unknown): err is DomainError {
  return err instanceof NotFoundError || err instanceof ConflictError || err instanceof InvalidError;
}
