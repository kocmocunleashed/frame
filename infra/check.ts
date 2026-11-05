import { aws_cloudfront as cloudfront, App } from "aws-cdk-lib";
import { Template, Match } from "aws-cdk-lib/assertions";
import { FrameStack, EdgeStack, configuration } from "./lib/frame-stack";
const c = configuration.parse({
  environment: "staging",
  account: "000000000000",
  region: "eu-west-1",
  domain: "slides.example.org",
  zoneName: "example.org",
  zoneId: "ZFIXTURE",
  secretArn:
    "arn:aws:secretsmanager:eu-west-1:000000000000:secret:frame-fixture-AbCdEf",
  imageTag: "fixture",
  cloudfrontPrefixListId: "pl-0123456789abcdef0",
  authProviders: ["google", "github"],
  authEmail: true,
});
const defaults = configuration.parse({
  ...c,
  authProviders: undefined,
  authEmail: undefined,
});
if (defaults.authProviders.length || defaults.authEmail)
  throw new Error("Optional authentication services must remain opt-in.");
const app = new App({ outdir: "/tmp/frame-cdk-check" });
const edge = new EdgeStack(
  app,
  "FixtureEdge",
  {
    env: { account: c.account, region: "us-east-1" },
    crossRegionReferences: true,
  },
  c,
);
const stack = new FrameStack(
  app,
  "FixtureFrame",
  {
    env: { account: c.account, region: c.region },
    crossRegionReferences: true,
  },
  c,
  edge.certificate,
);
const t = Template.fromStack(stack);
t.resourceCountIs("AWS::ECS::Service", 3);
t.resourceCountIs("AWS::SQS::Queue", 2);
t.resourceCountIs("AWS::Scheduler::Schedule", 1);
t.hasResourceProperties("AWS::ECS::TaskDefinition", {
  ContainerDefinitions: Match.arrayWith([
    Match.objectLike({
      Name: "api",
      Secrets: Match.arrayWith(
        [
          "GOOGLE_CLIENT_ID",
          "GOOGLE_CLIENT_SECRET",
          "GITHUB_CLIENT_ID",
          "GITHUB_CLIENT_SECRET",
          "RESEND_API_KEY",
          "AUTH_EMAIL_FROM",
        ].map((Name) => Match.objectLike({ Name })),
      ),
    }),
  ]),
});
for (const resource of Object.values(
  t.findResources("AWS::ECS::TaskDefinition"),
))
  for (const container of resource.Properties.ContainerDefinitions)
    if (
      container.Name !== "api" &&
      container.Secrets?.some((secret: { Name: string }) =>
        /^(GOOGLE_|GITHUB_|RESEND_|AUTH_EMAIL_FROM|BETTER_AUTH_SECRET)/.test(
          secret.Name,
        ),
      )
    )
      throw new Error("Only API tasks may receive authentication credentials.");
t.hasResourceProperties("AWS::ECS::Service", { DesiredCount: 2 });
t.hasResourceProperties("AWS::S3::Bucket", {
  VersioningConfiguration: { Status: "Enabled" },
  PublicAccessBlockConfiguration: {
    BlockPublicAcls: true,
    BlockPublicPolicy: true,
    IgnorePublicAcls: true,
    RestrictPublicBuckets: true,
  },
});
t.hasResourceProperties("AWS::ECS::Service", {
  NetworkConfiguration: {
    AwsvpcConfiguration: {
      AssignPublicIp: "DISABLED",
      Subnets: Match.anyValue(),
      SecurityGroups: Match.anyValue(),
    },
  },
});
t.hasResourceProperties("AWS::CloudFront::Distribution", {
  DistributionConfig: {
    DefaultCacheBehavior: {
      CachePolicyId: cloudfront.CachePolicy.CACHING_DISABLED.cachePolicyId,
      TargetOriginId: Match.anyValue(),
      ViewerProtocolPolicy: "redirect-to-https",
      AllowedMethods: Match.anyValue(),
      Compress: true,
      OriginRequestPolicyId: Match.anyValue(),
    },
    Enabled: true,
  },
});
app.synth();
console.log(
  "CDK synthesized both regional and edge stacks; private buckets, queues, services, disabled dynamic caching, and schedule assertions passed.",
);
