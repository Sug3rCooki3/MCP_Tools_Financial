import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { checkOrigin } from "@/lib/security/origin-check";
import { getDb } from "@/lib/db";
import { deleteQuota } from "@/lib/auth/quota";

export async function POST(req: NextRequest) {
  const originError = checkOrigin(req);
  if (originError) return originError;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Read guest_session_id from httpOnly cookie (not the request body)
  const guestSessionId = req.cookies.get("guest_session_id")?.value;
  if (!guestSessionId) {
    return NextResponse.json({ migrated: 0 });
  }

  const db = getDb();

  // Transfer ownership of all conversations from guest session to authenticated user
  const result = db
    .prepare(
      "UPDATE conversations SET user_id = ?, guest_session_id = NULL WHERE guest_session_id = ?"
    )
    .run(session.user.id, guestSessionId);

  // Delete quota record — authenticated users have no quota
  deleteQuota(guestSessionId, db);

  // Clear the guest_session_id cookie
  const response = NextResponse.json({ migrated: result.changes });
  response.cookies.set("guest_session_id", "", { maxAge: 0, path: "/" });
  return response;
}
