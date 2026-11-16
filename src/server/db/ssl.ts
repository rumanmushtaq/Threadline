import { readFileSync } from "node:fs";

/** Uses the provider's CA certificate when given (e.g. Supabase), so TLS is fully verified. */
export function sslOptions(): { ssl?: { ca: string; rejectUnauthorized: true } } {
  const caPath = process.env.DATABASE_CA_CERT;
  return caPath ? { ssl: { ca: readFileSync(caPath, "utf8"), rejectUnauthorized: true } } : {};
}
