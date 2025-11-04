import { test, expect } from "@playwright/test";

test("My Day inline page loads", async ({ page }) => {
  await page.goto("/myday-inline");
  await expect(page.locator("h2")).toContainText("My Day");
});
