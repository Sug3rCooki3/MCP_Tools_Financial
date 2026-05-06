import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { checkAndIncrementQuota } from "@/lib/auth/quota";
import { getAnonMessageLimit } from "@/lib/config/env";
import { checkOrigin } from "@/lib/security/origin-check";
import { ChatRequestSchema, type ChatRequest } from "@/lib/chat/validation";
import { runStreamPipeline } from "@/lib/chat/stream-pipeline";

export async function POST(req: NextRequest): Promise<Response> {
  // 1. Origin check (CSRF guard)
  const originError = checkOrigin(req);
  if (originError) return originError;

  // 2. Quota check — anonymous users only
  const session = await auth();
  let guestSessionId: string | undefined;
  let isNewSession = false;

  if (!session?.user) {
    guestSessionId = req.cookies.get("guest_session_id")?.value;
    if (!guestSessionId) {
      guestSessionId = crypto.randomUUID();
      isNewSession = true;
    }

    const allowed = checkAndIncrementQuota(guestSessionId);
    if (!allowed) {
      return NextResponse.json(
        { error: "quota_exceeded", limit: getAnonMessageLimit() },
        { status: 401 }
      );
    }
  }

  // 3. Parse + validate request body
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parseResult = ChatRequestSchema.safeParse(rawBody);
  if (!parseResult.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parseResult.error.issues },
      { status: 400 }
    );
  }

  const body: ChatRequest = parseResult.data;

  // 4–10. Stream pipeline (load/create conversation, persist, orchestrate, stream)
  const streamResponse = await runStreamPipeline(body, { guestSessionId });

  // Attach guest_session_id cookie on the first anonymous request.
  // Response.headers are immutable — reconstruct with the added Set-Cookie header.
  if (isNewSession && guestSessionId) {
    return new Response(streamResponse.body, {
      status: streamResponse.status,
      headers: {
        ...Object.fromEntries(streamResponse.headers.entries()),
        "Set-Cookie":
          `guest_session_id=${guestSessionId}; HttpOnly; SameSite=Strict; Max-Age=2592000; Path=/`,
      },
    });
  }

  return streamResponse;
}
