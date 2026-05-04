import { z } from "zod";

export const ChatRequestSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(32_000),
      })
    )
    .min(1)
    .max(100),
  conversationId: z.string().max(64).optional(),
});

export type ChatRequest = z.infer<typeof ChatRequestSchema>;
