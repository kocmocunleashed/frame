import base from "../playwright.config";
import { fileURLToPath } from "node:url";
export default {
  ...base,
  testDir: ".",
  testMatch: "standalone.spec.ts",
  testIgnore: [],
  outputDir: "/tmp/frame-standalone-browser-results",
  webServer: {
    ...base.webServer,
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    command:
      'bunx --no-install concurrently --kill-others "bun e2e/standalone.server.ts" "bun run dev:web"',
  },
};
