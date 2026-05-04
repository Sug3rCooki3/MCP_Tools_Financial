import { type NextRequest, NextResponse } from "next/server";
import { checkOrigin } from "@/lib/security/origin-check";
import { ChatRequestSchema, type ChatRequest } from "@/lib/chat/validation";
import { runStreamPipeline } from "@/lib/chat/stream-pipeline";

export async function POST(req: NextRequest): Promise<Response> {
  // 1. Origin check (CSRF guard)
  const originError = checkOrigin(req);
  if (originError) return originError;

  // 2. Parse + validate request body
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

  // 3–10. Stream pipeline (load/create conversation, persist, orchestrate, stream)
  return runStreamPipeline(body);
}
