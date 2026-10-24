import { defineConfig } from "@playwright/test";
import base from "../playwright.config";
export default defineConfig({
  ...base,
  testDir: ".",
  testMatch: "editor-capacity.spec.ts",
  timeout: 90000,
  outputDir: "/tmp/frame-capacity-browser",
});
