import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { createUser, getUserByEmail } from "@/lib/db/users";
import { checkOrigin } from "@/lib/security/origin-check";

const RegisterSchema = z.object({
  email:    z.string().email().max(254),
  password: z.string().min(8).max(128),
});

export async function POST(req: NextRequest) {
  const originError = checkOrigin(req);
  if (originError) return originError;

  let body: z.infer<typeof RegisterSchema>;
  try {
    body = RegisterSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const existing = getUserByEmail(body.email);
  // Return the same error for both "email taken" and "email not found" cases
  // to prevent account enumeration (spec 07)
  if (existing) {
    return NextResponse.json({ error: "Registration failed" }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(body.password, 12);
  const id = `user_${crypto.randomUUID()}`;
  createUser(id, body.email, passwordHash);

  return NextResponse.json({ success: true }, { status: 201 });
}
