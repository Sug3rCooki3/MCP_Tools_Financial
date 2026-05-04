import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function checkOrigin(req: NextRequest): NextResponse | null {
  if (SAFE_METHODS.has(req.method)) return null;

  const origin = req.headers.get("origin");
  if (!origin) return null; // same-origin requests from non-browser clients pass through

  const host = req.headers.get("host");
  const allowed = getAllowedOrigins(host);

  if (!allowed.has(origin)) {
    return NextResponse.json({ error: "Origin not allowed" }, { status: 403 });
  }

  return null;
}

function getAllowedOrigins(host: string | null): Set<string> {
  const origins = new Set<string>();
  if (host) {
    origins.add(`https://${host}`);
    origins.add(`http://${host}`);
  }
  const extra = process.env.ALLOWED_ORIGINS?.split(",").map((s) => s.trim());
  if (extra) for (const o of extra) if (o) origins.add(o);
  return origins;
}
