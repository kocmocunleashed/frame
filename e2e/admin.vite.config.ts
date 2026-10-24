import { mergeConfig } from "vite";
import { resolve } from "node:path";
import base from "../vite.config";
export default mergeConfig(base, {
  server: { fs: { allow: [resolve("e2e")] } },
});
