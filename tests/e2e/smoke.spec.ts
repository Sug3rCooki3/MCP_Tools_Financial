import { test, expect } from "@playwright/test";

test("home page loads with header and input", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Financial Assistant")).toBeVisible();
  await expect(page.getByTestId("chat-input")).toBeVisible();
  await expect(page.getByTestId("new-chat-button")).toBeVisible();
});

test("suggestion chips are displayed on empty chat", async ({ page }) => {
  await page.goto("/");
  const chips = page.getByTestId("suggestion-chip");
  await expect(chips.first()).toBeVisible();
  await expect(chips).toHaveCount(4);
});

test("new chat button resets conversation", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("suggestion-chip").first()).toBeVisible();
  await page.getByTestId("new-chat-button").click();
  // After new chat, suggestion chips should still be visible (conversation reset)
  await expect(page.getByTestId("suggestion-chip").first()).toBeVisible();
});
