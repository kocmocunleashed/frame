import { uid } from "../shared/schema";
import type { Store } from "./store";
import { SqsTransport, type Wake } from "./queue/transport";
import { send as vercelSend } from "@vercel/queue";
export const JOB_TOPIC = "frame-jobs";
export async function dispatchReady(
  store: Store,
  publish?: (message: Wake) => Promise<unknown>,
  now = Date.now(),
) {
  const vercel = process.env.FRAME_QUEUE_DRIVER === "vercel";
  const transport = !publish && !vercel ? new SqsTransport() : null;
  const send = publish || ((message: Wake) => transport!.publish(message));
  const owner = uid();
  let count = 0;
  try {
    for (let i = 0; i < 20; i++) {
      const event = await store.db.atomic(
        "outbox",
        {
          sentAt: null,
          availableAt: { atMost: now + (vercel && !publish ? 60000 : 0) },
          any: [{ leaseUntil: null }, { leaseUntil: { atMost: now } }],
        },
        {
          set: { leaseOwner: owner, leaseUntil: now + 30000 },
          increment: { attempts: 1 },
        },
        { sort: { availableAt: 1, id: 1 } },
      );
      if (!event) break;
      try {
        const message = {
          jobId: event.jobId,
          dispatchGeneration: event.dispatchGeneration,
        };
        if (vercel && !publish)
          await vercelSend(JOB_TOPIC, message, {
            idempotencyKey: `${message.jobId}:${message.dispatchGeneration}`,
            delaySeconds: Math.max(
              0,
              Math.ceil((event.availableAt - now) / 1000),
            ),
            retentionSeconds: 86400,
          });
        else await send(message);
        await store.db.update(
          "outbox",
          {
            id: event.id,
            leaseOwner: owner,
            leaseUntil: { greaterThan: Date.now() },
          },
          {
            set: {
              sentAt: new Date().toISOString(),
              leaseOwner: null,
              leaseUntil: null,
            },
          },
        );
        count++;
      } catch (error) {
        await store.db.update(
          "outbox",
          { id: event.id, leaseOwner: owner },
          {
            set: {
              leaseOwner: null,
              leaseUntil: null,
              availableAt:
                Date.now() +
                Math.min(60000, 1000 * 2 ** Math.min(event.attempts, 6)),
            },
          },
        );
        throw error;
      }
    }
  } finally {
    transport?.close();
  }
  return count;
}
