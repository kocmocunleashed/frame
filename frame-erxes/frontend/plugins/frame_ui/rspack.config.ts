import { composePlugins, withNx, withReact } from "@nx/rspack";
import { withModuleFederation } from "@nx/rspack/module-federation";
import config from "./module-federation.config";

export default composePlugins(
  withNx(),
  withReact(),
  withModuleFederation(config, { dts: false }),
);
