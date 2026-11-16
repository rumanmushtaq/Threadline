const BASE = "http://same-site.invalid";

/**
 * Only same-site paths. Rejects "//host", "/\host" and control characters (browsers
 * drop tabs and newlines, so "/\t/host" becomes "//host"), then confirms the parsed
 * URL still points at this site.
 */
export function safeNextPath(next: unknown, fallback = "/dashboard") {
  if (typeof next !== "string" || !/^\/(?![/\\])[^\\\x00-\x1f\x7f]*$/.test(next)) return fallback;
  try {
    return new URL(next, BASE).origin === BASE ? next : fallback;
  } catch {
    return fallback;
  }
}
