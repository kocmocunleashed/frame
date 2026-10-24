import { App } from "aws-cdk-lib";
import { FrameStack, EdgeStack, configuration } from "../lib/frame-stack";
const app = new App();
const file = app.node.tryGetContext("config");
if (!file) throw new Error("Pass -c config=/absolute/path/to/environment.json");
const config = configuration.parse(await Bun.file(file).json());
const edge = new EdgeStack(
  app,
  `frame-${config.environment}-edge`,
  {
    env: { account: config.account, region: "us-east-1" },
    crossRegionReferences: true,
  },
  config,
);
new FrameStack(
  app,
  `frame-${config.environment}`,
  {
    env: { account: config.account, region: config.region },
    crossRegionReferences: true,
  },
  config,
  edge.certificate,
);
