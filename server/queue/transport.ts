import {
  SQSClient,
  SendMessageCommand,
  ReceiveMessageCommand,
  DeleteMessageCommand,
  ChangeMessageVisibilityCommand,
  GetQueueAttributesCommand,
} from "@aws-sdk/client-sqs";
import { z } from "zod";
export const wakeSchema = z
  .object({
    jobId: z.string().min(1).max(100),
    dispatchGeneration: z.number().int().nonnegative(),
  })
  .strict();
export function parseWake(body: string | undefined): Wake | null {
  try {
    const result = wakeSchema.safeParse(JSON.parse(body || ""));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
export type Wake = z.infer<typeof wakeSchema>;
export class SqsTransport {
  readonly client: SQSClient;
  readonly url: string;
  constructor() {
    this.url = process.env.FRAME_SQS_QUEUE_URL || "";
    if (!this.url || !process.env.AWS_REGION)
      throw new Error("SQS requires FRAME_SQS_QUEUE_URL and AWS_REGION.");
    this.client = new SQSClient({
      region: process.env.AWS_REGION,
      maxAttempts: 3,
      requestHandler: { connectionTimeout: 5000, requestTimeout: 30000 },
    });
  }
  async publish(message: Wake) {
    await this.client.send(
      new SendMessageCommand({
        QueueUrl: this.url,
        MessageBody: JSON.stringify(wakeSchema.parse(message)),
      }),
    );
  }
  async receive() {
    const r = await this.client.send(
      new ReceiveMessageCommand({
        QueueUrl: this.url,
        WaitTimeSeconds: 20,
        MaxNumberOfMessages: 1,
        VisibilityTimeout: 60,
      }),
    );
    return r.Messages || [];
  }
  async acknowledge(receipt: string) {
    await this.client.send(
      new DeleteMessageCommand({ QueueUrl: this.url, ReceiptHandle: receipt }),
    );
  }
  async heartbeat(receipt: string) {
    await this.client.send(
      new ChangeMessageVisibilityCommand({
        QueueUrl: this.url,
        ReceiptHandle: receipt,
        VisibilityTimeout: 60,
      }),
    );
  }
  async probe() {
    await this.client.send(
      new GetQueueAttributesCommand({
        QueueUrl: this.url,
        AttributeNames: ["QueueArn"],
      }),
      { abortSignal: AbortSignal.timeout(4000) },
    );
  }
  close() {
    this.client.destroy();
  }
}
