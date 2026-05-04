import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { checkOrigin } from "@/lib/security/origin-check";

function makeRequest(method: string, origin: string | null, host: string): NextRequest {
  const headers: Record<string, string> = { host };
  if (origin !== null) headers["origin"] = origin;
  return new NextRequest("http://localhost/api/chat", { method, headers });
}

describe("checkOrigin", () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    process.env = { ...OLD_ENV };
    delete process.env.ALLOWED_ORIGINS;
  });

  afterEach(() => {
    process.env = OLD_ENV;
  });

  it("allows a same-host https origin", () => {
    const req = makeRequest("POST", "https://myapp.example.com", "myapp.example.com");
    expect(checkOrigin(req)).toBeNull();
  });

  it("allows a same-host http origin", () => {
    const req = makeRequest("POST", "http://localhost:3000", "localhost:3000");
    expect(checkOrigin(req)).toBeNull();
  });

  it("returns 403 for a different origin", () => {
    const req = makeRequest("POST", "https://evil.example.com", "myapp.example.com");
    const result = checkOrigin(req);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(403);
  });

  it("allows requests with no Origin header (non-browser clients)", () => {
    const req = makeRequest("POST", null, "myapp.example.com");
    expect(checkOrigin(req)).toBeNull();
  });

  it("skips origin check for GET requests", () => {
    const req = makeRequest("GET", "https://evil.example.com", "myapp.example.com");
    expect(checkOrigin(req)).toBeNull();
  });

  it("allows extra origins from ALLOWED_ORIGINS env var", () => {
    process.env.ALLOWED_ORIGINS = "https://finance.example.com,http://localhost:3001";
    const req = makeRequest("POST", "https://finance.example.com", "myapp.example.com");
    expect(checkOrigin(req)).toBeNull();
  });
});
