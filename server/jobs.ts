import { metric } from "./telemetry";
import { StorageFailure } from "./storage";
import { uid } from "../shared/schema";
import { Store, ApiError } from "./store";
import { contentHash } from "./database";
export type JobProgress = { step: string; percent: number };
export type JobRow = {
  id: string;
  deckId: string | null;
  ownerId: string;
  workspaceId: string;
  kind: string;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  progress: string;
  payload: string;
  result: string | null;
  error: string | null;
  attempts: number;
  leaseOwner: string | null;
  leaseUntil: number | null;
  leaseToken: number;
  createdAt: string;
  updatedAt: string;
  idempotencyKey: string;
  parentId: string | null;
  availableAt: number;
  cancelRequestedAt: number | null;
  dispatchGeneration: number;
};
export class JobFailure extends Error {
  constructor(
    message: string,
    public retryable = false,
  ) {
    super(message);
  }
}
export class JobQueue {
  private tokens = new Map<string, number>();
  constructor(
    public store: Store,
    public workerId: string = uid(),
    public now = () => Date.now(),
    public leaseMs = 30000,
  ) {}
  async wake(job: JobRow) {
    await this.store.db.insert("outbox", {
      jobId: job.id,
      dispatchGeneration: job.dispatchGeneration,
      availableAt: job.availableAt,
      attempts: 0,
      leaseUntil: null,
      sentAt: null,
      createdAt: new Date(this.now()).toISOString(),
    });
  }
  async enqueue(
    ownerId: string,
    kind: string,
    payload: unknown,
    key: string,
    deckId: string | null = null,
    parentId: string | null = null,
  ): Promise<JobRow> {
    const data = JSON.stringify(payload);
    if (data.length > 2000000 || Buffer.byteLength(data) > 8 * 1024 * 1024)
      throw new ApiError(
        413,
        "This job has too much content. Reduce the selected sources or slides.",
      );
    const id = uid(),
      date = new Date(this.now()).toISOString();
    return this.store.db.transaction(async () => {
      const previous = await this.store.db.one("jobs", {
        ownerId,
        idempotencyKey: key,
      });
      if (previous) {
        if (
          previous.payload !== data ||
          previous.kind !== kind ||
          previous.deckId !== deckId ||
          previous.parentId !== parentId
        )
          throw new ApiError(
            409,
            "This request key was already used for different work.",
          );
        return previous;
      }
      const owner = await this.store.user(ownerId);
      if (!owner) throw new ApiError(404, "Account not found.");
      if (deckId) await this.store.requireAccess(deckId, owner, true);
      await this.store.db.update(
        "jobQuotas",
        { id: ownerId },
        { $inc: { revision: 1 }, $setOnInsert: { active: 0, live: 0 } },
        { upsert: true },
      );
      if (parentId) {
        const parent = await this.get(parentId, ownerId);
        if (parent.parentId || parent.status !== "running")
          throw new ApiError(
            409,
            "The generation workflow is no longer active.",
          );
      } else if (
        (await this.store.db.count("jobs", {
          ownerId,
          parentId: null,
          status: { $in: ["queued", "running"] },
        })) >= 5
      )
        throw new ApiError(
          429,
          "Five jobs are already in progress. Wait or cancel one before starting another.",
        );
      const job: JobRow = {
        id,
        ownerId,
        workspaceId: owner.workspaceId,
        deckId,
        kind,
        parentId,
        status: "queued",
        progress: JSON.stringify({ step: "Waiting for a worker", percent: 0 }),
        payload: data,
        result: null,
        error: null,
        attempts: 0,
        leaseOwner: null,
        leaseUntil: null,
        leaseToken: 0,
        idempotencyKey: key,
        createdAt: date,
        updatedAt: date,
        availableAt: this.now(),
        cancelRequestedAt: null,
        dispatchGeneration: 0,
      };
      await this.store.db.insert("jobs", {
        ...job,
        inputHash: contentHash(data),
      });
      await this.wake(job);
      return job;
    })();
  }
  async get(id: string, ownerId: string): Promise<JobRow> {
    const row = await this.store.db.one("jobs", { id, ownerId });
    if (!row) throw new ApiError(404, "Job not found.");
    return row;
  }
  async list(ownerId: string): Promise<JobRow[]> {
    return this.store.db.find(
      "jobs",
      { ownerId, parentId: null },
      { sort: { createdAt: -1 }, limit: 50 },
    );
  }
  private guard(id: string, token = this.tokens.get(id)) {
    return {
      id,
      status: "running",
      leaseOwner: this.workerId,
      leaseToken: token ?? -1,
      leaseUntil: { $gt: this.now() },
      cancelRequestedAt: null,
    };
  }
  async authorized(job: JobRow) {
    const owner = await this.store.user(job.ownerId);
    if (!owner) throw new JobFailure("Account access is no longer available.");
    if (job.deckId) await this.store.requireAccess(job.deckId, owner, true);
  }
  async claim(jobId?: string): Promise<JobRow | null> {
    await this.recover();
    const job = await this.store.db.transaction(async () => {
      const time = this.now();
      const slot = await this.store.db.one("operationLeases", {
        id: "chromium-export",
      });
      const job = await this.store.db.atomic(
        "jobs",
        {
          ...(jobId ? { id: jobId } : {}),
          ...(slot && slot.expiresAt > time ? { kind: { $ne: "export" } } : {}),
          attempts: { $lt: 3 },
          cancelRequestedAt: null,
          $or: [
            { status: "queued", availableAt: { $lte: time } },
            {
              status: "running",
              leaseOwner: { $ne: null },
              leaseUntil: { $lte: time },
            },
          ],
        },
        {
          $set: {
            status: "running",
            leaseOwner: this.workerId,
            leaseUntil: time + this.leaseMs,
            updatedAt: new Date(time).toISOString(),
          },
          $inc: { attempts: 1, leaseToken: 1 },
        },
        { sort: { createdAt: 1, _id: 1 } },
      );
      if (job?.kind === "export")
        await this.store.db.update(
          "operationLeases",
          { id: "chromium-export" },
          {
            $set: {
              owner: this.workerId,
              jobId: job.id,
              leaseToken: job.leaseToken,
              expiresAt: time + this.leaseMs,
            },
          },
          { upsert: true },
        );
      return job;
    })();
    if (!job) return null;
    this.tokens.set(job.id, job.leaseToken);
    try {
      await this.authorized(job);
    } catch {
      await this.fail(
        job,
        new JobFailure("Your access to this presentation was removed."),
      );
      await this.releaseRenderSlot(job);
      return null;
    }
    return job;
  }
  async heartbeat(id: string, token?: number) {
    return this.store.db.transaction(async () => {
      const job = await this.store.db.one("jobs", this.guard(id, token));
      if (!job) return false;
      const expiresAt = this.now() + this.leaseMs;
      if (
        job.kind === "export" &&
        !(await this.store.db.atomic(
          "operationLeases",
          {
            id: "chromium-export",
            owner: this.workerId,
            jobId: id,
            leaseToken: job.leaseToken,
            expiresAt: { $gt: this.now() },
          },
          { $set: { expiresAt } },
        ))
      )
        return false;
      return !!(await this.store.db.atomic("jobs", this.guard(id, token), {
        $set: {
          leaseUntil: expiresAt,
          updatedAt: new Date(this.now()).toISOString(),
        },
      }));
    })();
  }
  async releaseRenderSlot(job: JobRow) {
    if (job.kind !== "export") return;
    await this.store.db.update(
      "operationLeases",
      {
        id: "chromium-export",
        owner: this.workerId,
        jobId: job.id,
        leaseToken: job.leaseToken,
      },
      { $set: { expiresAt: this.now() } },
    );
  }
  async deferRendering(id: string, dispatchGeneration: number) {
    return this.store.db.transaction(async () => {
      const job = await this.store.db.atomic(
        "jobs",
        {
          id,
          kind: "export",
          status: "queued",
          dispatchGeneration,
          cancelRequestedAt: null,
          availableAt: { $lte: this.now() },
        },
        {
          $set: {
            availableAt: this.now() + 30000,
            updatedAt: new Date(this.now()).toISOString(),
            progress: JSON.stringify({
              step: "Waiting for a rendering worker",
              percent: 0,
            }),
          },
          $inc: { dispatchGeneration: 1 },
        },
      );
      if (!job) return false;
      // A busy slot is ordinary scheduling, not a failed queue delivery. Commit
      // the delayed replacement wakeup before acknowledging the old receipt.
      await this.wake(job);
      return true;
    })();
  }
  async progress(id: string, progress: JobProgress, token?: number) {
    if (
      !Number.isFinite(progress.percent) ||
      progress.percent < 0 ||
      progress.percent > 100
    )
      throw new Error("Invalid progress");
    const r = await this.store.db.update("jobs", this.guard(id, token), {
      $set: {
        progress: JSON.stringify({
          ...progress,
          step: progress.step.slice(0, 200),
        }),
        updatedAt: new Date(this.now()).toISOString(),
      },
    });
    if (!r.changes) throw new JobFailure("Worker lease was lost.");
  }
  async complete(id: string, result: unknown, token?: number) {
    const data = JSON.stringify(result);
    if (Buffer.byteLength(data) > 32 * 1024 * 1024)
      throw new JobFailure("Generated output exceeded the document limit.");
    return this.store.db.transaction(async () => {
      const job = await this.store.db.one("jobs", this.guard(id, token));
      if (!job) return false;
      await this.authorized(job);
      const changed = !!(
        await this.store.db.update("jobs", this.guard(id, token), {
          $set: {
            status: "succeeded",
            result: data,
            error: null,
            progress: JSON.stringify({ step: "Ready to review", percent: 100 }),
            leaseOwner: null,
            leaseUntil: null,
            updatedAt: new Date(this.now()).toISOString(),
          },
        })
      ).changes;
      await this.terminalGuard(job);
      await this.releaseRenderSlot(job);
      return changed;
    })();
  }
  async terminalGuard(job: JobRow) {
    if (!job.parentId)
      await this.store.db.update(
        "jobQuotas",
        { id: job.ownerId },
        { $inc: { revision: 1 } },
      );
    else {
      const parent = await this.store.db.one("jobs", {
        id: job.parentId,
        status: "running",
      });
      if (parent) {
        const generation = parent.dispatchGeneration + 1;
        await this.store.db.update(
          "jobs",
          { id: parent.id },
          { $set: { dispatchGeneration: generation } },
        );
        await this.wake({
          ...parent,
          dispatchGeneration: generation,
          availableAt: this.now(),
        });
      }
    }
  }
  async fail(job: JobRow, error: unknown) {
    const retry =
      ((error instanceof JobFailure && error.retryable) ||
        error instanceof StorageFailure) &&
      job.attempts < 3;
    const message =
      error instanceof JobFailure || error instanceof StorageFailure
        ? error.message
        : "This job could not finish. Your presentation is unchanged.";
    return this.store.db.transaction(async () => {
      const current = await this.store.db.one(
        "jobs",
        this.guard(job.id, job.leaseToken),
      );
      if (!current) return false;
      const availableAt =
        this.now() +
        Math.min(30000, 2000 * 2 ** job.attempts) +
        Math.floor(Math.random() * 500);
      await this.store.db.update("jobs", this.guard(job.id, job.leaseToken), {
        $set: {
          status: retry ? "queued" : "failed",
          error: message,
          leaseOwner: null,
          leaseUntil: null,
          availableAt,
          dispatchGeneration: current.dispatchGeneration + 1,
          progress: JSON.stringify({
            step: retry
              ? "Temporary failure; retry scheduled"
              : "Could not finish",
            percent: 0,
          }),
          updatedAt: new Date(this.now()).toISOString(),
        },
      });
      if (retry)
        await this.wake({
          ...current,
          availableAt,
          dispatchGeneration: current.dispatchGeneration + 1,
        });
      else await this.terminalGuard(job);
      return true;
    })();
  }
  async cancel(id: string, ownerId: string): Promise<JobRow> {
    return this.store.db.transaction(async () => {
      const job = await this.get(id, ownerId);
      await this.store.db.update(
        "jobs",
        {
          $or: [{ id }, { parentId: id }],
          ownerId,
          status: { $in: ["queued", "running"] },
        },
        {
          $set: {
            status: "cancelled",
            cancelRequestedAt: this.now(),
            leaseOwner: null,
            leaseUntil: null,
            progress: JSON.stringify({ step: "Cancelled", percent: 0 }),
            updatedAt: new Date(this.now()).toISOString(),
          },
        },
      );
      await this.terminalGuard(job);
      return this.get(id, ownerId);
    })();
  }
  async release(id: string) {
    const current = await this.store.db.one("jobs", this.guard(id));
    if (!current) return;
    await this.store.db.transaction(async () => {
      await this.store.db.update("jobs", this.guard(id), {
        $set: {
          status: "queued",
          leaseOwner: null,
          leaseUntil: null,
          availableAt: this.now(),
          dispatchGeneration: current.dispatchGeneration + 1,
        },
      });
      await this.wake({
        ...current,
        availableAt: this.now(),
        dispatchGeneration: current.dispatchGeneration + 1,
      });
    })();
  }
  async recover() {
    const expired = await this.store.db.find(
      "jobs",
      {
        status: "running",
        leaseOwner: { $ne: null },
        leaseUntil: { $lte: this.now() },
      },
      { limit: 100 },
    );
    for (const row of expired)
      await this.store.db.transaction(async () => {
        const job = await this.store.db.one("jobs", {
          id: row.id,
          status: "running",
          leaseUntil: { $lte: this.now() },
        });
        if (!job) return;
        const retry = job.attempts < 3;
        await this.store.db.update(
          "jobs",
          { id: job.id, leaseToken: job.leaseToken },
          {
            $set: {
              status: retry ? "queued" : "failed",
              leaseOwner: null,
              leaseUntil: null,
              availableAt: this.now(),
              dispatchGeneration: job.dispatchGeneration + 1,
              error: retry
                ? null
                : "The worker stopped repeatedly. Resume to retry unfinished stages.",
            },
          },
        );
        if (retry)
          await this.wake({
            ...job,
            availableAt: this.now(),
            dispatchGeneration: job.dispatchGeneration + 1,
          });
        else await this.terminalGuard(job);
      })();
    return expired.length;
  }
}
export type JobHandler = (
  job: JobRow,
  context: {
    signal: AbortSignal;
    progress: (step: string, percent: number) => void | Promise<void>;
  },
) => Promise<unknown>;
export class JobWorker {
  beforeRun?: () => void | Promise<void>;
  private busy = false;
  private stopping = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private generation = 0;
  private lastPollAt: number | null = null;
  private controllers = new Map<string, AbortController>();
  constructor(
    public queue: JobQueue,
    public handler: JobHandler,
    public timeoutMs: number | ((job: JobRow) => number) = 180000,
  ) {}
  start() {
    if (this.timer) return;
    this.stopping = false;
    const generation = ++this.generation;
    const poll = async () => {
      if (this.stopping || generation !== this.generation) return;
      this.lastPollAt = Date.now();
      try {
        await this.runOnce();
      } catch {
        console.error(
          JSON.stringify({
            level: "error",
            event: "job_worker_failure",
            category: "dependency",
          }),
        );
      } finally {
        if (!this.stopping && generation === this.generation)
          this.timer = setTimeout(() => void poll(), 500);
      }
    };
    // A worker is a live process responsibility, including while its queue is idle.
    this.timer = setTimeout(() => void poll(), 0);
  }
  async stop() {
    this.stopping = true;
    this.generation++;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    for (const [id, controller] of this.controllers) {
      await this.queue.release(id);
      controller.abort();
    }
  }
  async cancel(id: string, ownerId: string) {
    const children = await this.queue.store.db.find("jobs", {
      parentId: id,
      ownerId,
    });
    const result = await this.queue.cancel(id, ownerId);
    this.controllers.get(id)?.abort();
    for (const child of children) this.controllers.get(child.id)?.abort();
    return result;
  }
  status() {
    return {
      busy: this.busy,
      stopping: this.stopping,
      lastPollAt: this.lastPollAt,
      activeJobs: [...this.controllers.keys()],
    };
  }
  async runOnce(jobId?: string): Promise<boolean> {
    if (this.busy || this.stopping) return false;
    this.busy = true;
    let job: JobRow | null = null;
    try {
      await this.beforeRun?.();
      job = await this.queue.claim(jobId);
      if (!job) return false;
      if (this.stopping) {
        await this.queue.release(job.id);
        return false;
      }
      const active = job,
        controller = new AbortController();
      this.controllers.set(active.id, controller);
      let timedOut = false;
      const heartbeat = setInterval(
        async () => {
          try {
            if (!(await this.queue.heartbeat(active.id, active.leaseToken))) {
              metric("LeaseLoss", 1);
              controller.abort();
            }
          } catch {
            controller.abort();
          }
        },
        Math.max(25, Math.min(5000, this.queue.leaseMs / 3)),
      );
      const timeout = setTimeout(
        () => {
          timedOut = true;
          controller.abort();
        },
        typeof this.timeoutMs === "function"
          ? this.timeoutMs(active)
          : this.timeoutMs,
      );
      let abortListener: () => void = () => {};
      try {
        const aborted = new Promise<never>((_, reject) => {
          abortListener = () =>
            reject(
              new JobFailure(
                timedOut
                  ? "Generation timed out. A bounded retry will be attempted."
                  : "Generation was cancelled or the worker lost its lease.",
                timedOut,
              ),
            );
          controller.signal.addEventListener("abort", abortListener, {
            once: true,
          });
        });
        const result = await Promise.race([
          this.handler(active, {
            signal: controller.signal,
            progress: async (step, percent) =>
              await this.queue.progress(
                active.id,
                { step, percent },
                active.leaseToken,
              ),
          }),
          aborted,
        ]);
        if (!controller.signal.aborted)
          await this.queue.complete(active.id, result, active.leaseToken);
      } catch (error) {
        await this.queue.fail(active, error);
      } finally {
        clearInterval(heartbeat);
        clearTimeout(timeout);
        controller.signal.removeEventListener("abort", abortListener);
        this.controllers.delete(active.id);
        // A raced abort can return before Chromium has closed. Hold its slot
        // until lease expiry; a stale process cannot release a newer holder.
        if (!controller.signal.aborted)
          await this.queue.releaseRenderSlot(active);
      }
      return true;
    } finally {
      try {
        await this.beforeRun?.();
      } finally {
        this.busy = false;
      }
    }
  }
}
export function publicJob(job: JobRow) {
  const progress = JSON.parse(job.progress);
  const payload = JSON.parse(job.payload);
  return {
    id: job.id,
    parentId: job.parentId,
    presentationId: job.deckId,
    kind: job.kind,
    status: job.status,
    progress,
    completedSlides: progress.completedSlides,
    totalSlides: progress.totalSlides,
    previewRevision: progress.previewRevision,
    reviewedSlides: progress.reviewedSlides,
    webResearch: payload.researchVersion === 1 || !!payload.research,
    result: job.result
      ? (() => {
          const result = JSON.parse(job.result);
          if (job.kind === "export") {
            const { storageKey, objectVersion, ...safe } = result;
            return { ...safe, downloadUrl: `/api/exports/${job.id}/download` };
          }
          return result;
        })()
      : null,
    error: job.error,
    attempts: job.attempts,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}
