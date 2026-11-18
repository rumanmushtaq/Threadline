import { createHmac } from "node:crypto";

/**
 * Keys for the local Supabase Auth servers in docker-compose.yml. They are signed with
 * the well-known local development secret, so they are worthless anywhere else.
 * `pnpm supabase:local-env` prints the lines for .env.
 */
export const LOCAL_JWT_SECRET = "super-secret-jwt-token-with-at-least-32-characters-long";
export const LOCAL_SUPABASE_URL = "http://127.0.0.1:54321";
export const TEST_SUPABASE_URL = "http://127.0.0.1:54331";
export const MAILPIT_URL = "http://127.0.0.1:54324";

function sign(payload: object, secret: string) {
  const b64 = (v: object) => Buffer.from(JSON.stringify(v)).toString("base64url");
  const body = `${b64({ alg: "HS256", typ: "JWT" })}.${b64(payload)}`;
  return `${body}.${createHmac("sha256", secret).update(body).digest("base64url")}`;
}

export function localSupabaseKeys(secret = LOCAL_JWT_SECRET) {
  const iat = 1_700_000_000;
  const exp = 2_000_000_000;
  return {
    publishableKey: sign({ iss: "supabase-local", role: "anon", iat, exp }, secret),
    secretKey: sign({ iss: "supabase-local", role: "service_role", iat, exp }, secret),
  };
}

/** Points this process at the local Supabase Auth test server. */
export function pointAtTestSupabase(env: NodeJS.ProcessEnv = process.env) {
  const keys = localSupabaseKeys();
  env.SUPABASE_URL = TEST_SUPABASE_URL;
  env.SUPABASE_PUBLISHABLE_KEY = keys.publishableKey;
  env.SUPABASE_SECRET_KEY = keys.secretKey;
  delete env.SUPABASE_ANON_KEY;
  delete env.SUPABASE_SERVICE_ROLE_KEY;
  return env;
}
