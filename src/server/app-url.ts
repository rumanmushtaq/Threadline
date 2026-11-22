/**
 * The site's public address, used in share links and in sign-in and reset emails.
 * On Vercel a missing or localhost APP_URL (an easy copy-paste slip from .env) falls back to
 * the project's production domain, so customers never get a localhost link.
 */
export function appUrl() {
  const set = process.env.APP_URL?.trim().replace(/\/+$/, "");
  const onVercel = !!process.env.VERCEL;
  const local = !set || /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(set);
  if (onVercel && local) {
    const host = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
    if (host) return `https://${host}`;
  }
  if (!set) throw new Error("APP_URL is not set");
  return set;
}
