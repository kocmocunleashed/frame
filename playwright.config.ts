import { chromium, defineConfig } from "@playwright/test";
const webPort = process.env.FRAME_E2E_WEB_PORT || "5175",
  apiPort = process.env.FRAME_E2E_API_PORT || "3141";
export default defineConfig({
  forbidOnly: !!process.env.CI,
  testDir: "./e2e",
  // Uses the isolated authenticated server in e2e/agent.config.ts.
  testIgnore: ["**/agent-preferences.spec.ts", "**/admin.spec.ts"],
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  expect: { timeout: 10000 },
  outputDir: "/tmp/frame-browser-results",
  reporter: "list",
  use: {
    baseURL: `http://127.0.0.1:${webPort}`,
    viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure",
    // Full Chromium and headless-shell rasterize transformed text differently.
    // Use the same pinned full browser as the inspected slide baselines.
    launchOptions: {
      executablePath: process.env.CHROME_PATH || chromium.executablePath(),
    },
  },
  webServer: {
    command: "bun run dev:browser-test",
    url: `http://127.0.0.1:${webPort}/api/health`,
    reuseExistingServer: false,
    timeout: 90000,
    env: {
      PORT: apiPort,
      FRAME_WEB_PORT: webPort,
      FRAME_API_PORT: apiPort,
      APP_ORIGIN: `http://127.0.0.1:${webPort}`,
      NODE_ENV: "test",
      FRAME_TEST_MONGODB_URI: process.env.FRAME_TEST_MONGODB_URI || "",
      FRAME_STORAGE: "local",
      FRAME_QUEUE_DRIVER: "local",
      FRAME_ASSETS: "/tmp/frame-browser-tests/assets",
      FRAME_EXPORTS: "/tmp/frame-browser-tests/exports",
    },
  },
});
