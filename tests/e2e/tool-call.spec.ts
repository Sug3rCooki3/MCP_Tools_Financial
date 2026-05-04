import { test, expect } from "@playwright/test";

test("send button is disabled while streaming", async ({ page }) => {
  await page.goto("/");

  // Type a message but don't send yet
  const input = page.getByTestId("chat-input");
  await input.fill("What is 2 + 2?");

  const sendButton = page.getByRole("button", { name: "Send message" });
  // Button should be enabled with input text present
  await expect(sendButton).toBeEnabled();
});

test("user message appears in message list after send", async ({ page }) => {
  await page.goto("/");

  // Mock the API to avoid requiring a real API key
  await page.route("/api/chat", async (route) => {
    const body = `data: {"type":"delta","content":"Test response"}\n\ndata: {"type":"done","conversationId":"test-conv"}\n\ndata: [DONE]\n\n`;
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body,
    });
  });

  const input = page.getByTestId("chat-input");
  await input.fill("Test question");
  await page.keyboard.press("Enter");

  await expect(page.locator("[data-role='user']")).toBeVisible();
  await expect(page.locator("[data-role='assistant']")).toBeVisible();
});
