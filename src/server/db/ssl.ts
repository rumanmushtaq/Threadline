import { readFileSync } from "node:fs";

/** PEM text, from DATABASE_CA_CERT (either the certificate itself or a file path). */
function caCert() {
  const v = process.env.DATABASE_CA_CERT?.trim();
  if (!v) return null;
  return v.startsWith("-----BEGIN") ? v.replace(/\\n/g, "\n") : readFileSync(v, "utf8");
}

/**
 * pg options for a connection string. When a CA certificate is given (Supabase signs its
 * database certificates with its own root CA), TLS is fully verified against it. Any
 * sslmode in the URL is removed first, because node-postgres lets the URL's sslmode
 * replace an explicit `ssl` option, which would silently drop the CA.
 */
export function pgConnection(url: string): { connectionString: string; ssl?: { ca: string; rejectUnauthorized: true } } {
  const ca = caCert();
  if (!ca) return { connectionString: url };
  const u = new URL(url);
  for (const p of ["ssl", "sslmode", "sslnegotiation", "sslrootcert", "sslcert", "sslkey", "sslpassword", "uselibpqcompat"]) u.searchParams.delete(p);
  return { connectionString: u.toString(), ssl: { ca, rejectUnauthorized: true } };
}
