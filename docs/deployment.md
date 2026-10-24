# Deploying Frame on AWS

Choose a region close to users and the Atlas deployment. Provision a MongoDB replica set on Atlas in that region. Use an Atlas private endpoint where the selected dedicated tier supports it; otherwise restrict public TLS access to the VPC NAT egress addresses. Frame's database and database user must be separate from erxes core data.

Prepare a Route 53 hosted zone and an environment-specific Secrets Manager JSON secret. Required keys are `MONGODB_URI`, `FRAME_ADMIN_USER_IDS`, `OPENROUTER_API_KEY`, and either `CLERK_SECRET_KEY` or `FRAME_ERXES_SECRET`. An empty AI key means manual-only operation. Keep secret values out of CDK context, source, task environment literals, logs, and frontend build arguments. Only `VITE_CLERK_PUBLISHABLE_KEY` is a browser-safe build argument.

Copy `infra/config.example.json` outside the repository and fill all inputs. `cloudfrontPrefixListId` is the regional AWS-managed prefix list named `com.amazonaws.global.cloudfront.origin-facing`; obtain it using `aws ec2 describe-managed-prefix-lists --filters Name=prefix-list-name,Values=com.amazonaws.global.cloudfront.origin-facing --region YOUR_REGION`. The ALB accepts that network on HTTPS and also requires an origin header set by this distribution. ECS API ingress accepts only the ALB security group. Tasks use private subnets and NAT for Clerk and AI. The data bucket blocks public access and restricts upload CORS to the application origin.

The edge certificate stack runs in us-east-1; the application stack uses your selected region. Bootstrap both CDK regions. The existing Route 53 zone is referenced by ID, and certificates and application/origin records are managed by these stacks. `origin-ENV.slides.example.org` is the ALB origin record. Dynamic routes have caching disabled; only `/assets/*` uses S3 caching. There is no SPA error mapping on API or media paths.

For the first release, set `bootstrap: true` and deploy the stacks. This creates resources with services at zero tasks and the maintenance schedule disabled, allowing the first immutable ECR image to be pushed. Do not expose this state as a working application.

Build the Linux amd64 image with the pinned Dockerfile. Push a unique release tag into the output ECR repository; tags are immutable. Record its digest. Upload `dist/assets/` under `assets/` in the output frontend bucket **before** releasing HTML. Include only fingerprinted assets and set immutable caching. The HTML is served by the image and always uses no-store.

Run `bun scripts/migrate.ts` as a one-off ECS task using the maintenance task definition with a command override. It holds a migration lease and installs indexes with a checksum ledger. Run this before starting API or worker tasks. Set `bootstrap: false` and deploy. Production starts two API tasks across availability zones; staging starts one. Worker capacity starts at two and scales on queue backlog. A shared MongoDB lease permits one Chromium export at a time, preserving another worker for AI/extraction. Validate memory use before increasing Chromium concurrency.

The Docker image includes the Playwright-managed Chromium matching `bun.lock`, bundled fonts, API and renderer sources, and the frontend build. Runtime runs as an unprivileged user. The same image digest is used for API/worker/dispatcher/maintenance with different commands and separate task roles.

Build and exercise the local image before pushing it:

```bash
docker build --platform linux/amd64 --target api -t frame:verified .
FRAME_CONTAINER_ENGINE=docker bun scripts/check-image.ts frame:verified
```

The image check disables networking and verifies the runtime user plus actual
PDF, PNG ZIP, offline HTML and image-based PPTX output. Podman is also supported:
use `podman build` and omit `FRAME_CONTAINER_ENGINE`. Clerk deployments supply
the browser-safe publishable key through the `VITE_CLERK_PUBLISHABLE_KEY` build
argument. Server secrets belong in ECS secret references, never build arguments.

Deployment acceptance must exercise real HTTPS authentication, erxes embedded/new-tab launch when configured, private upload and Range delivery, save conflicts, a generation job, all export formats, publication revocation, and audience reconnection. Terminate and replace a worker during work; ensure leases recover and stale results cannot commit. Record release ID, image digest, CDK revision, Mongo migration version, browser and provider versions, and results.

Configure alarm actions and recipients before production use. Queue age, dead-letter count, API errors and latency are included. Add organization-specific dashboards for Atlas connections, S3 failures, outbox age, lease loss, worker heartbeats, memory, and backup failures. AI availability is independent of API readiness.

For rollback, retain previous immutable images and compatible schemas. Do not deploy a worker that cannot read current job payloads. Pause new jobs before incompatible changes. Restoring an older database loses newer writes unless they are reconciled; switching DNS alone is not a data rollback.

CloudWatch Embedded Metric Format also supplies outbox age, active worker count,
and lease losses. Their alarms are provisioned; missing worker/maintenance
metrics raise alarms. Connect alarm actions to the operator-selected recipients.
See AWS's [at-least-once delivery guidance](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/standard-queues-at-least-once-delivery.html)
and MongoDB's [transaction requirements](https://www.mongodb.com/docs/manual/core/transactions/)
for the underlying delivery and persistence guarantees.
