import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "__tests__/ui",
  timeout: 60_000,
  use: { baseURL: "http://localhost:3000" }
});
