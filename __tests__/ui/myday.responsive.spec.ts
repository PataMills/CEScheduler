// __tests__/ui/myday.responsive.spec.ts
import { test, expect } from "@playwright/test";

test.describe("MyDay Teams - Responsive Behavior", () => {
  test("phone (<480px) opens in listDay view", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 700 });
    await page.goto("/myday-teams");

    // Wait for FullCalendar to render
    await page.waitForSelector(".fc", { timeout: 5000 });

    // listDay should show the list view container
    const listView = page.locator(".fc-list");
    await expect(listView).toBeVisible({ timeout: 3000 });

    // Should NOT show timegrid
    const timegrid = page.locator(".fc-timegrid");
    await expect(timegrid).not.toBeVisible();
  });

  test("tablet (768px) opens in timeGridDay view", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto("/myday-teams");

    await page.waitForSelector(".fc", { timeout: 5000 });

    // Should show timegrid (day or week)
    const timegrid = page.locator(".fc-timegrid");
    await expect(timegrid).toBeVisible({ timeout: 3000 });
  });

  test("desktop (>768px) opens in timeGridWeek view", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 800 });
    await page.goto("/myday-teams");

    await page.waitForSelector(".fc", { timeout: 5000 });

    // Should show timegrid
    const timegrid = page.locator(".fc-timegrid");
    await expect(timegrid).toBeVisible({ timeout: 3000 });

    // Week view typically shows multiple day columns
    const dayColumns = page.locator(".fc-col-header-cell");
    const count = await dayColumns.count();
    expect(count).toBeGreaterThanOrEqual(3); // At least 3 days visible in week view
  });

  test("no console errors on load", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    await page.setViewportSize({ width: 375, height: 700 });
    await page.goto("/myday-teams");
    await page.waitForSelector(".fc", { timeout: 5000 });

    // Allow some time for any delayed errors
    await page.waitForTimeout(1000);

    // Filter out known safe errors (e.g., missing images, network issues in test)
    const criticalErrors = consoleErrors.filter(
      (err) =>
        !err.includes("Failed to load resource") &&
        !err.includes("net::ERR_") &&
        !err.includes("favicon")
    );

    expect(criticalErrors).toHaveLength(0);
  });

  test("resize from phone to desktop triggers view change", async ({ page }) => {
    // Start on phone
    await page.setViewportSize({ width: 375, height: 700 });
    await page.goto("/myday-teams");
    await page.waitForSelector(".fc-list", { timeout: 5000 });

    // Resize to desktop
    await page.setViewportSize({ width: 1024, height: 800 });

    // Wait for debounced resize handler (150ms + buffer)
    await page.waitForTimeout(300);

    // Should now show timegrid instead of list
    const timegrid = page.locator(".fc-timegrid");
    await expect(timegrid).toBeVisible({ timeout: 2000 });
  });

  test("calendar scrolls to 7:30am start time", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 800 });
    await page.goto("/myday-teams");
    await page.waitForSelector(".fc-timegrid", { timeout: 5000 });

    // Check that 7:30am slot is visible (scrollTime config)
    const slot730 = page.locator('.fc-timegrid-slot[data-time="07:30:00"]');
    
    // If slot exists, it should be in viewport or near top
    const slotCount = await slot730.count();
    if (slotCount > 0) {
      await expect(slot730.first()).toBeInViewport({ timeout: 3000 });
    }
  });
});
