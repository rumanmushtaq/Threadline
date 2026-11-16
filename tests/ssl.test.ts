import { afterEach, describe, expect, it } from "vitest";
import { pgConnection } from "@/server/db/ssl";
import { clientIp } from "@/server/auth/current";

const PEM = "-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----";

describe("database TLS options", () => {
  afterEach(() => {
    delete process.env.DATABASE_CA_CERT;
  });

  it("leaves the URL alone without a CA", () => {
    expect(pgConnection("postgresql://u:p@h:6543/db?sslmode=require")).toEqual({ connectionString: "postgresql://u:p@h:6543/db?sslmode=require" });
  });

  it("strips sslmode and verifies against the given CA", () => {
    process.env.DATABASE_CA_CERT = PEM;
    const c = pgConnection("postgresql://u:p@aws-0-x.pooler.supabase.com:6543/postgres?sslmode=require&ssl=true&sslnegotiation=direct&application_name=tl");
    expect(c.connectionString).toBe("postgresql://u:p@aws-0-x.pooler.supabase.com:6543/postgres?application_name=tl");
    expect(c.ssl).toEqual({ ca: PEM, rejectUnauthorized: true });
  });
});

describe("client IP for rate limits", () => {
  it("reads only the header the configured proxy sets", () => {
    const h = new Headers({ "x-forwarded-for": "6.6.6.6, 1.2.3.4", "x-real-ip": "5.5.5.5", "x-vercel-forwarded-for": "7.7.7.7", "cf-connecting-ip": "8.8.8.8" });
    expect(clientIp(h, "xff")).toBe("1.2.3.4");
    expect(clientIp(h, "nginx")).toBe("5.5.5.5");
    expect(clientIp(h, "vercel")).toBe("7.7.7.7");
    expect(clientIp(h, "cloudflare")).toBe("8.8.8.8");
    expect(clientIp(h, "none")).toBe("unknown");
    // Behind plain X-Forwarded-For, a forged X-Real-IP is ignored.
    expect(clientIp(new Headers({ "x-real-ip": "9.9.9.9", "x-forwarded-for": "1.1.1.1" }), "xff")).toBe("1.1.1.1");
    expect(clientIp(new Headers(), "xff")).toBe("unknown");
  });
});
