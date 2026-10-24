import {
  Duration,
  RemovalPolicy,
  Stack,
  Tags,
  CfnOutput,
  type StackProps,
} from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as elb from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as logs from "aws-cdk-lib/aws-logs";
import * as secrets from "aws-cdk-lib/aws-secretsmanager";
import * as cf from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as targets from "aws-cdk-lib/aws-route53-targets";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as scheduler from "aws-cdk-lib/aws-scheduler";
import * as cw from "aws-cdk-lib/aws-cloudwatch";
import { z } from "zod";
export const configuration = z.object({
  environment: z.enum(["dev", "staging", "production"]),
  bootstrap: z.boolean().default(false),
  cloudfrontPrefixListId: z.string().startsWith("pl-"),
  account: z.string().regex(/^\d{12}$/),
  region: z.string().min(5),
  domain: z.string().min(4),
  zoneName: z.string().min(4),
  zoneId: z.string().min(3),
  secretArn: z.string().startsWith("arn:aws:secretsmanager:"),
  imageTag: z.string().min(1),
  authMode: z.enum(["clerk", "erxes"]),
  database: z.string().min(1),
  erxesOrigin: z.string().default(""),
  erxesTenant: z.string().default(""),
});
type Config = z.infer<typeof configuration>;
function zone(scope: Construct, c: Config) {
  return route53.HostedZone.fromHostedZoneAttributes(scope, "Zone", {
    hostedZoneId: c.zoneId,
    zoneName: c.zoneName,
  });
}
export class EdgeStack extends Stack {
  readonly certificate: acm.ICertificate;
  constructor(scope: Construct, id: string, props: StackProps, c: Config) {
    super(scope, id, props);
    this.certificate = new acm.Certificate(this, "EdgeCertificate", {
      domainName: c.domain,
      validation: acm.CertificateValidation.fromDns(zone(this, c)),
    });
  }
}
export class FrameStack extends Stack {
  constructor(
    scope: Construct,
    id: string,
    props: StackProps,
    c: Config,
    edgeCertificate: acm.ICertificate,
  ) {
    super(scope, id, props);
    Tags.of(this).add("Application", "Frame");
    Tags.of(this).add("Environment", c.environment);
    const production = c.environment === "production",
      dns = zone(this, c),
      originDomain = `origin-${c.environment}.${c.domain}`;
    const vpc = new ec2.Vpc(this, "Vpc", {
      maxAzs: 2,
      natGateways: production ? 2 : 1,
      subnetConfiguration: [
        { name: "public", subnetType: ec2.SubnetType.PUBLIC },
        { name: "services", subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      ],
      gatewayEndpoints: {
        S3: { service: ec2.GatewayVpcEndpointAwsService.S3 },
      },
    });
    const cluster = new ecs.Cluster(this, "Cluster", {
      vpc,
      containerInsightsV2: ecs.ContainerInsights.ENABLED,
    });
    const repository = new ecr.Repository(this, "Images", {
      repositoryName: `frame-${c.environment}`,
      imageScanOnPush: true,
      imageTagMutability: ecr.TagMutability.IMMUTABLE,
      removalPolicy: RemovalPolicy.RETAIN,
      lifecycleRules: [{ maxImageCount: 30 }],
    });
    const data = new s3.Bucket(this, "PrivateData", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: true,
      removalPolicy: RemovalPolicy.RETAIN,
      cors: [
        {
          allowedOrigins: [`https://${c.domain}`],
          allowedMethods: [s3.HttpMethods.POST],
          allowedHeaders: [
            "content-type",
            "x-amz-checksum-sha256",
            "x-amz-checksum-algorithm",
          ],
          exposedHeaders: ["ETag", "x-amz-version-id"],
          maxAge: 300,
        },
      ],
      lifecycleRules: [
        {
          id: "abandoned-multipart",
          abortIncompleteMultipartUploadAfter: Duration.days(1),
        },
      ],
    });
    const frontend = new s3.Bucket(this, "Frontend", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: true,
      removalPolicy: RemovalPolicy.RETAIN,
    });
    const dlq = new sqs.Queue(this, "DeadLetters", {
      queueName: `frame-${c.environment}-dlq`,
      encryption: sqs.QueueEncryption.SQS_MANAGED,
      retentionPeriod: Duration.days(14),
      enforceSSL: true,
    });
    const queue = new sqs.Queue(this, "Jobs", {
      queueName: `frame-${c.environment}-jobs`,
      encryption: sqs.QueueEncryption.SQS_MANAGED,
      visibilityTimeout: Duration.seconds(90),
      retentionPeriod: Duration.days(14),
      receiveMessageWaitTime: Duration.seconds(20),
      deadLetterQueue: { queue: dlq, maxReceiveCount: 10 },
      enforceSSL: true,
    });
    const secret = secrets.Secret.fromSecretCompleteArn(
      this,
      "Configuration",
      c.secretArn,
    );
    const serviceSG = new ec2.SecurityGroup(this, "ServiceSecurity", {
      vpc,
      allowAllOutbound: true,
    });
    const albSG = new ec2.SecurityGroup(this, "AlbSecurity", {
      vpc,
      allowAllOutbound: true,
    });
    // Only CloudFront's origin-facing network reaches the ALB. An origin header
    // prevents another CloudFront distribution from using this origin.
    albSG.addIngressRule(
      ec2.Peer.prefixList(c.cloudfrontPrefixListId),
      ec2.Port.tcp(443),
    );
    serviceSG.addIngressRule(albSG, ec2.Port.tcp(3158));
    const alb = new elb.ApplicationLoadBalancer(this, "LoadBalancer", {
      vpc,
      internetFacing: true,
      securityGroup: albSG,
    });
    const cert = new acm.Certificate(this, "OriginCertificate", {
      domainName: originDomain,
      validation: acm.CertificateValidation.fromDns(dns),
    });
    const originSecret = new secrets.Secret(this, "OriginSecret", {
      generateSecretString: { excludePunctuation: true, passwordLength: 48 },
    });
    const originHeader = originSecret.secretValue.unsafeUnwrap();
    const listener = alb.addListener("Https", {
      port: 443,
      certificates: [cert],
      open: false,
      defaultAction: elb.ListenerAction.fixedResponse(403, {
        contentType: "text/plain",
        messageBody: "Use the application domain.",
      }),
    });
    new route53.ARecord(this, "OriginDNS", {
      zone: dns,
      recordName: originDomain,
      target: route53.RecordTarget.fromAlias(
        new targets.LoadBalancerTarget(alb),
      ),
    });
    const common = {
      NODE_ENV: "production",
      FRAME_ENVIRONMENT: c.environment,
      FRAME_TRUST_PROXY: "cloudfront",
      PORT: "3158",
      APP_ORIGIN: `https://${c.domain}`,
      MONGODB_DATABASE: c.database,
      FRAME_STORAGE: "s3",
      FRAME_S3_BUCKET: data.bucketName,
      FRAME_S3_REGION: this.region,
      AWS_REGION: this.region,
      FRAME_QUEUE_DRIVER: "sqs",
      FRAME_SQS_QUEUE_URL: queue.queueUrl,
      FRAME_SQS_DLQ_URL: dlq.queueUrl,
      FRAME_JOB_TIMEOUT_MS: "270000",
      FRAME_AI_PROVIDER: "openrouter",
      OPENROUTER_MODEL: "meta/muse-spark-1.3-contributor",
      OPENROUTER_MUSE_CONTRIBUTOR_ENABLED: "true",
      FRAME_RELEASE_ID: c.imageTag,
      ...(c.authMode === "erxes"
        ? {
            FRAME_ERXES_ORIGIN: c.erxesOrigin,
            FRAME_ERXES_TENANT: c.erxesTenant,
          }
        : {}),
    };
    const task = (
      kind: string,
      cpu: number,
      memory: number,
      command: string[],
    ) => {
      const role = new iam.Role(this, `${kind}Role`, {
        assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
      });
      const definition = new ecs.FargateTaskDefinition(this, `${kind}Task`, {
        cpu,
        memoryLimitMiB: memory,
        taskRole: role,
        ephemeralStorageGiB: 30,
        runtimePlatform: {
          cpuArchitecture: ecs.CpuArchitecture.X86_64,
          operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
        },
      });
      const group = new logs.LogGroup(this, `${kind}Logs`, {
        logGroupName: `/frame/${c.environment}/${kind}`,
        retention: logs.RetentionDays.ONE_MONTH,
        removalPolicy: RemovalPolicy.RETAIN,
      });
      const injected: Record<string, ecs.Secret> = {
        MONGODB_URI: ecs.Secret.fromSecretsManager(secret, "MONGODB_URI"),
      };
      if (kind === "api") {
        if (c.authMode === "clerk") {
          injected.CLERK_SECRET_KEY = ecs.Secret.fromSecretsManager(
            secret,
            "CLERK_SECRET_KEY",
          );
        } else
          injected.FRAME_ERXES_SECRET = ecs.Secret.fromSecretsManager(
            secret,
            "FRAME_ERXES_SECRET",
          );
        injected.FRAME_ADMIN_USER_IDS = ecs.Secret.fromSecretsManager(
          secret,
          "FRAME_ADMIN_USER_IDS",
        );
      }
      if (kind === "worker" || kind === "api") {
        injected.OPENROUTER_API_KEY = ecs.Secret.fromSecretsManager(
          secret,
          "OPENROUTER_API_KEY",
        );
      }
      const container = definition.addContainer(kind, {
        image: ecs.ContainerImage.fromEcrRepository(repository, c.imageTag),
        command,
        environment: common,
        secrets: injected,
        logging: ecs.LogDrivers.awsLogs({
          streamPrefix: kind,
          logGroup: group,
        }),
        readonlyRootFilesystem: false,
        stopTimeout: Duration.seconds(60),
        user: "1000",
      });
      return { role, definition, container, group };
    };
    const api = task("api", 512, 1024, ["bun", "server/index.ts"]);
    api.container.addPortMappings({ containerPort: 3158 });
    data.grantReadWrite(api.role);
    queue.grant(api.role, "sqs:GetQueueAttributes");
    const service = new ecs.FargateService(this, "Api", {
      cluster,
      taskDefinition: api.definition,
      desiredCount: c.bootstrap ? 0 : production ? 2 : 1,
      securityGroups: [serviceSG],
      assignPublicIp: false,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      circuitBreaker: { rollback: true },
      healthCheckGracePeriod: Duration.seconds(60),
    });
    const tg = new elb.ApplicationTargetGroup(this, "ApiTargets", {
      vpc,
      port: 3158,
      protocol: elb.ApplicationProtocol.HTTP,
      targets: [service],
      healthCheck: {
        path: "/api/ready",
        healthyHttpCodes: "200",
        interval: Duration.seconds(30),
      },
    });
    listener.addAction("FrameOrigin", {
      priority: 1,
      conditions: [
        elb.ListenerCondition.httpHeader("x-frame-origin", [originHeader]),
      ],
      action: elb.ListenerAction.forward([tg]),
    });
    const apiScale = service.autoScaleTaskCount({
      minCapacity: c.bootstrap ? 0 : production ? 2 : 1,
      maxCapacity: 6,
    });
    apiScale.scaleOnCpuUtilization("Cpu", { targetUtilizationPercent: 65 });
    const worker = task("worker", 2048, 4096, [
      "bun",
      "server/workers/worker.ts",
    ]);
    data.grantReadWrite(worker.role);
    queue.grantConsumeMessages(worker.role);
    const workers = new ecs.FargateService(this, "Workers", {
      cluster,
      taskDefinition: worker.definition,
      desiredCount: c.bootstrap ? 0 : 2,
      securityGroups: [serviceSG],
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      circuitBreaker: { rollback: true },
    });
    workers
      .autoScaleTaskCount({ minCapacity: c.bootstrap ? 0 : 2, maxCapacity: 6 })
      .scaleOnMetric("Backlog", {
        metric: queue.metricApproximateNumberOfMessagesVisible(),
        scalingSteps: [
          { upper: 0, change: -1 },
          { lower: 5, change: 1 },
          { lower: 20, change: 2 },
        ],
        adjustmentType: undefined,
        cooldown: Duration.minutes(2),
      });
    const dispatcher = task("dispatcher", 256, 512, [
      "bun",
      "server/workers/dispatcher.ts",
    ]);
    queue.grantSendMessages(dispatcher.role);
    new ecs.FargateService(this, "Dispatcher", {
      cluster,
      taskDefinition: dispatcher.definition,
      desiredCount: c.bootstrap ? 0 : 1,
      securityGroups: [serviceSG],
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      circuitBreaker: { rollback: true },
    });
    const maintenance = task("maintenance", 512, 1024, [
      "bun",
      "server/workers/maintenance.ts",
    ]);
    data.grantReadWrite(maintenance.role);
    const scheduleRole = new iam.Role(this, "SchedulerRole", {
      assumedBy: new iam.ServicePrincipal("scheduler.amazonaws.com"),
    });
    scheduleRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["ecs:RunTask"],
        resources: [maintenance.definition.taskDefinitionArn],
      }),
    );
    scheduleRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["iam:PassRole"],
        resources: [
          maintenance.role.roleArn,
          maintenance.definition.executionRole!.roleArn,
        ],
        conditions: {
          StringEquals: { "iam:PassedToService": "ecs-tasks.amazonaws.com" },
        },
      }),
    );
    new scheduler.CfnSchedule(this, "MaintenanceSchedule", {
      state: c.bootstrap ? "DISABLED" : "ENABLED",
      flexibleTimeWindow: { mode: "OFF" },
      scheduleExpression: "rate(1 minute)",
      target: {
        arn: cluster.clusterArn,
        roleArn: scheduleRole.roleArn,
        ecsParameters: {
          taskDefinitionArn: maintenance.definition.taskDefinitionArn,
          launchType: "FARGATE",
          taskCount: 1,
          networkConfiguration: {
            awsvpcConfiguration: {
              subnets: vpc.privateSubnets.map((s) => s.subnetId),
              securityGroups: [serviceSG.securityGroupId],
              assignPublicIp: "DISABLED",
            },
          },
        },
        retryPolicy: { maximumRetryAttempts: 2, maximumEventAgeInSeconds: 60 },
      },
    });
    const apiOrigin = new origins.HttpOrigin(originDomain, {
      protocolPolicy: cf.OriginProtocolPolicy.HTTPS_ONLY,
      customHeaders: { "x-frame-origin": originHeader },
      readTimeout: Duration.seconds(60),
    });
    const dynamic: cf.BehaviorOptions = {
      origin: apiOrigin,
      cachePolicy: cf.CachePolicy.CACHING_DISABLED,
      originRequestPolicy: cf.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
      allowedMethods: cf.AllowedMethods.ALLOW_ALL,
      viewerProtocolPolicy: cf.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
    };
    const distribution = new cf.Distribution(this, "CDN", {
      domainNames: [c.domain],
      certificate: edgeCertificate,
      defaultBehavior: dynamic,
      additionalBehaviors: {
        "assets/*": {
          origin: origins.S3BucketOrigin.withOriginAccessControl(frontend),
          cachePolicy: cf.CachePolicy.CACHING_OPTIMIZED,
          viewerProtocolPolicy: cf.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        },
        "api/*": dynamic,
        "integrations/*": dynamic,
      },
      minimumProtocolVersion: cf.SecurityPolicyProtocol.TLS_V1_2_2021,
    });
    new route53.ARecord(this, "AppDNS", {
      zone: dns,
      recordName: c.domain,
      target: route53.RecordTarget.fromAlias(
        new targets.CloudFrontTarget(distribution),
      ),
    });
    queue.metricApproximateAgeOfOldestMessage().createAlarm(this, "QueueAge", {
      threshold: 120,
      evaluationPeriods: 3,
      treatMissingData: cw.TreatMissingData.NOT_BREACHING,
    });
    dlq
      .metricApproximateNumberOfMessagesVisible()
      .createAlarm(this, "DeadLettersAlarm", {
        threshold: 1,
        evaluationPeriods: 1,
      });
    tg.metrics
      .httpCodeTarget(elb.HttpCodeTarget.TARGET_5XX_COUNT)
      .createAlarm(this, "ApiErrors", { threshold: 10, evaluationPeriods: 2 });
    const appMetric = (name: string, statistic = "Maximum") =>
      new cw.Metric({
        namespace: "Frame",
        metricName: name,
        dimensionsMap: { Environment: c.environment },
        statistic,
        period: Duration.minutes(1),
      });
    appMetric("OutboxAge").createAlarm(this, "OutboxAgeAlarm", {
      threshold: 120,
      evaluationPeriods: 3,
      treatMissingData: cw.TreatMissingData.BREACHING,
    });
    appMetric("ActiveWorkers").createAlarm(this, "WorkerHeartbeatAlarm", {
      threshold: 1,
      comparisonOperator: cw.ComparisonOperator.LESS_THAN_THRESHOLD,
      evaluationPeriods: 3,
      treatMissingData: cw.TreatMissingData.BREACHING,
    });
    appMetric("LeaseLoss", "Sum").createAlarm(this, "LeaseLossAlarm", {
      threshold: 3,
      evaluationPeriods: 2,
      treatMissingData: cw.TreatMissingData.NOT_BREACHING,
    });
    const dashboard = new cw.Dashboard(this, "Operations", {
      dashboardName: `Frame-${c.environment}`,
    });
    dashboard.addWidgets(
      new cw.GraphWidget({
        title: "Queue health",
        left: [
          queue.metricApproximateAgeOfOldestMessage(),
          queue.metricApproximateNumberOfMessagesVisible(),
          dlq.metricApproximateNumberOfMessagesVisible(),
        ],
      }),
      new cw.GraphWidget({
        title: "API latency and errors",
        left: [
          tg.metrics.targetResponseTime({ statistic: "p95" }),
          tg.metrics.httpCodeTarget(elb.HttpCodeTarget.TARGET_5XX_COUNT),
        ],
      }),
    );
    for (const [name, value] of Object.entries({
      AppUrl: `https://${c.domain}`,
      ImageRepository: repository.repositoryUri,
      FrontendBucket: frontend.bucketName,
      DataBucket: data.bucketName,
      Cluster: cluster.clusterName,
      QueueUrl: queue.queueUrl,
      MigrationTaskDefinition: maintenance.definition.taskDefinitionArn,
    }))
      new CfnOutput(this, `Output${name}`, { value });
  }
}
