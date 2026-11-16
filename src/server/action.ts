import "server-only";
import { z } from "zod";
import { AppError, type ActionResult, type FieldErrors } from "./errors";

/** Converts thrown errors into a safe ActionResult. Unexpected errors are logged, not leaked. */
export async function runAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    if (err instanceof AppError) {
      return { ok: false, error: err.message, code: err.code, fieldErrors: err.fieldErrors };
    }
    if (err instanceof z.ZodError) {
      return { ok: false, error: "Please fix the highlighted fields.", code: "VALIDATION", fieldErrors: zodFieldErrors(err) };
    }
    // Let Next.js handle redirect()/notFound() control flow.
    if (err && typeof err === "object" && "digest" in err) throw err;
    console.error(err);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

export function zodFieldErrors(err: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of err.issues) {
    const key = issue.path.join(".") || "_form";
    (out[key] ??= []).push(issue.message);
  }
  return out;
}

export function parseOrThrow<S extends z.ZodType>(schema: S, input: unknown): z.infer<S> {
  const res = schema.safeParse(input);
  if (!res.success) {
    throw new AppError("Please fix the highlighted fields.", "VALIDATION", zodFieldErrors(res.error));
  }
  return res.data;
}
