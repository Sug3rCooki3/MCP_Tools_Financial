import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import Database from "better-sqlite3";
import { ensureSchema } from "@/lib/db/schema";

// Mock @/auth before any import resolves it (prevents getAuthSecret() from throwing at module load)
vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

// Mock @/lib/db so route handler uses our in-memory DB
vi.mock("@/lib/db", () => ({
  getDb: () => testDb,
}));

// Bypass CSRF check
vi.mock("@/lib/security/origin-check", () => ({
  checkOrigin: vi.fn().mockReturnValue(null),
}));

// testDb is captured by reference in the mock factory above
let testDb: Database.Database;

import { auth } from "@/auth";
import { POST } from "@/app/api/migrate-session/route";
import type { Session } from "next-auth";

function mockSession(userId: string, email: string) {
  return { user: { id: userId, email, name: null, image: null }, expires: "" } as unknown as Session;
}

function makeRequest(cookies: Record<string, string> = {}): NextRequest {
  const cookieHeader = Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
  return new NextRequest("http://localhost/api/migrate-session", {
    method: "POST",
    headers: cookieHeader ? { cookie: cookieHeader } : {},
  });
}

describe("POST /api/migrate-session", () => {
  beforeEach(() => {
    testDb = new Database(":memory:");
    testDb.pragma("foreign_keys = ON");
    ensureSchema(testDb);
    vi.mocked(auth).mockReset();
  });

  afterEach(() => {
    testDb.close();
  });

  it("returns 401 when no auth session is present", async () => {
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */ (auth as any).mockResolvedValue(null);
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("Unauthorized");
  });

  it("returns { migrated: 0 } when no guest_session_id cookie is present", async () => {
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */ (auth as any).mockResolvedValue(mockSession("user_1", "u@example.com"));
    const res = await POST(makeRequest()); // no cookies
    expect(res.status).toBe(200);
    const body = await res.json() as { migrated: number };
    expect(body.migrated).toBe(0);
  });

  it("transfers conversations from guest_session_id to user_id", async () => {
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */ (auth as any).mockResolvedValue(mockSession("user_42", "u@example.com"));

    // Seed user (needed for FK constraint on user_id)
    testDb.prepare("INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)").run("user_42", "u@example.com", "hash");
    // Seed a conversation with guest_session_id
    testDb.prepare(
      "INSERT INTO conversations (id, title, guest_session_id) VALUES (?, ?, ?)"
    ).run("conv-1", "Test", "guest-abc");

    const res = await POST(makeRequest({ guest_session_id: "guest-abc" }));
    expect(res.status).toBe(200);
    const body = await res.json() as { migrated: number };
    expect(body.migrated).toBe(1);

    const conv = testDb
      .prepare("SELECT user_id, guest_session_id FROM conversations WHERE id = ?")
      .get("conv-1") as { user_id: string | null; guest_session_id: string | null };
    expect(conv.user_id).toBe("user_42");
    expect(conv.guest_session_id).toBeNull();
  });

  it("deletes the anonymous_quotas row after migration", async () => {
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */ (auth as any).mockResolvedValue(mockSession("user_99", "u@example.com"));

    // Seed quota row
    testDb.prepare(
      "INSERT INTO anonymous_quotas (session_id, message_count, window_start) VALUES (?, 3, datetime('now'))"
    ).run("guest-xyz");

    await POST(makeRequest({ guest_session_id: "guest-xyz" }));

    const row = testDb
      .prepare("SELECT * FROM anonymous_quotas WHERE session_id = ?")
      .get("guest-xyz");
    expect(row).toBeUndefined();
  });

  it("sets Set-Cookie Max-Age=0 on the response to clear the guest cookie", async () => {
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */ (auth as any).mockResolvedValue(mockSession("user_10", "u@example.com"));

    // Seed user (needed for FK constraint on user_id)
    testDb.prepare("INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)").run("user_10", "u@example.com", "hash");
    testDb.prepare(
      "INSERT INTO conversations (id, title, guest_session_id) VALUES (?, ?, ?)"
    ).run("conv-2", "Chat", "guest-clear");

    const res = await POST(makeRequest({ guest_session_id: "guest-clear" }));

    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toMatch(/guest_session_id=/);
    expect(setCookie).toMatch(/[Mm]ax-[Aa]ge=0/);
  });
});
