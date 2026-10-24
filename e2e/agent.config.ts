import base from "./admin.config";
export default {
  ...base,
  testMatch: "agent-preferences.spec.ts",
  outputDir: "/tmp/frame-agent-browser-results",
  use: { ...base.use, viewport: { width: 1366, height: 768 } },
};
