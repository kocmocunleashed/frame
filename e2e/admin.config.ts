import { chromium, defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";
export default defineConfig({
  testDir: ".",
  testMatch: "admin.spec.ts",
  workers: 1,
  timeout: 45000,
  expect: { timeout: 10000 },
  outputDir: "/tmp/frame-hosted-admin-browser-results",
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:5183",
    viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure",
    launchOptions: {
      executablePath: process.env.CHROME_PATH || chromium.executablePath(),
    },
  },
  webServer: {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    command:
      'bunx --no-install concurrently --kill-others "bun e2e/admin.server.ts" "bunx --no-install vite --config e2e/admin.vite.config.ts"',
    url: "http://127.0.0.1:5183/api/health",
    timeout: 30000,
    env: {
      FRAME_WEB_PORT: "5183",
      FRAME_API_PORT: "3147",
      APP_ORIGIN: "http://127.0.0.1:5183",
      NODE_ENV: "test",
      FRAME_TEST_MONGODB_URI: process.env.FRAME_TEST_MONGODB_URI || "",
      FRAME_QUEUE_DRIVER: "local",
      FRAME_STORAGE: "local",
      FRAME_ASSETS: "/tmp/frame-admin-browser/assets",
      FRAME_EXPORTS: "/tmp/frame-admin-browser/exports",
    },
  },
});
