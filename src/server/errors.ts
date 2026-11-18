export type FieldErrors = Record<string, string[] | undefined>;

/** An expected failure whose message is safe to show to the user. */
export class AppError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "UNAUTHENTICATED"
      | "FORBIDDEN"
      | "NOT_FOUND"
      | "VALIDATION"
      | "CONFLICT"
      | "RATE_LIMITED"
      | "UNAVAILABLE"
      | "STOCK" = "VALIDATION",
    public readonly fieldErrors?: FieldErrors,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: AppError["code"]; fieldErrors?: FieldErrors };

/** Postgres error code helper (pg and neon both expose `code`). */
export function pgCode(err: unknown): string | undefined {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code ?? e?.cause?.code;
}

export function pgConstraint(err: unknown): string | undefined {
  const e = err as { constraint?: string; cause?: { constraint?: string } };
  return e?.constraint ?? e?.cause?.constraint;
}
