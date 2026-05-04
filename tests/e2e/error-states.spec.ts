import { test, expect } from "@playwright/test";

test("displays error message on API error", async ({ page }) => {
  await page.goto("/");

  await page.route("/api/chat", async (route) => {
    const body = `data: {"type":"error","message":"Rate limit exceeded. Please try again."}\n\ndata: [DONE]\n\n`;
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body,
    });
  });

  const input = page.getByTestId("chat-input");
  await input.fill("trigger error");
  await page.keyboard.press("Enter");

  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("Rate limit");
});

test("input is re-enabled after error", async ({ page }) => {
  await page.goto("/");

  await page.route("/api/chat", async (route) => {
    const body = `data: {"type":"error","message":"Something went wrong"}\n\ndata: [DONE]\n\n`;
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body,
    });
  });

  const input = page.getByTestId("chat-input");
  await input.fill("test");
  await page.keyboard.press("Enter");

  // After error, input should become enabled again
  await expect(input).toBeEnabled({ timeout: 5000 });
});
