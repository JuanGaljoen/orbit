import { defineConfig, devices } from "@playwright/test";

const PORT = 3200;
export const E2E = {
  webhookSecret: "e2e-webhook-secret",
  apiToken: "e2e-api-token-000000000000000000",
};

/**
 * Runs the app in dev mode against a fresh embedded Postgres (no login — OAuth unset in dev).
 * GitHub steps run only when GITHUB_TOKEN is provided (they hit the real GitHub API, read-only).
 */
export default defineConfig({
  testDir: "e2e",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, ...devices["Desktop Chrome"], trace: "retain-on-failure" },
  webServer: {
    command: `rm -rf .data/e2e && pnpm next dev --port ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    timeout: 120_000,
    reuseExistingServer: false,
    env: {
      DATABASE_URL: "pglite:.data/e2e",
      GITHUB_WEBHOOK_SECRET: E2E.webhookSecret,
      ORBIT_API_TOKEN: E2E.apiToken,
      GITHUB_TOKEN: process.env.GITHUB_TOKEN ?? "",
      ANTHROPIC_API_KEY: "",
      AUTH_GITHUB_ID: "",
    },
  },
});
