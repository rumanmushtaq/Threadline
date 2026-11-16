import type { FieldValues, Path, UseFormSetError } from "react-hook-form";
import { toast } from "sonner";
import type { FieldErrors } from "@/server/errors";

/** Puts server-side field errors onto the form and shows the summary message. */
export function applyServerErrors<T extends FieldValues>(
  res: { error: string; fieldErrors?: FieldErrors },
  setError: UseFormSetError<T>,
) {
  for (const [k, v] of Object.entries(res.fieldErrors ?? {})) {
    if (v?.[0]) setError(k as Path<T>, { type: "server", message: v[0] });
  }
  toast.error(res.error);
}
