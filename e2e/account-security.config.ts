import base from "./standalone.config";
import common from "../playwright.config";
import type { PlaywrightTestConfig } from "@playwright/test";
export default {
  ...base,
  testMatch: "account-security.spec.ts",
  outputDir: "/tmp/frame-account-security-browser-results",
  webServer: {
    ...base.webServer,
    env: {
      ...(
        common.webServer as NonNullable<PlaywrightTestConfig["webServer"]> & {
          env?: Record<string, string>;
        }
      ).env,
      FRAME_TEST_AUTH_EMAIL: "true",
    },
  },
};
