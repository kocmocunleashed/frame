import type { ModuleFederationConfig } from "@nx/rspack/module-federation";

const shared = new Set(["react", "react-dom", "erxes-ui", "@apollo/client"]);
const config: ModuleFederationConfig = {
  name: "frame_ui",
  exposes: {
    "./config": "./src/config.tsx",
    "./frame": "./src/Frame.tsx",
  },
  // Explicit declarations also work when an older host's Nx dependency graph
  // does not understand Bun's text lockfile. The host must share these too.
  additionalShared: [
    { libraryName: "react", sharedConfig: { singleton: true, strictVersion: true, requiredVersion: "18.3.1" } },
    { libraryName: "react-dom", sharedConfig: { singleton: true, strictVersion: true, requiredVersion: "18.3.1" } },
    { libraryName: "@apollo/client", sharedConfig: { singleton: true, strictVersion: true, requiredVersion: "^3.11.8" } },
  ],
  shared: (name, defaults) => (shared.has(name) ? defaults : false),
};
export default config;
