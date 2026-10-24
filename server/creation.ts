import { revisionInput, collectionPage } from "./contracts";
import { filterAsync } from "./async-array";
import { agentPreferencesSchema, type AgentPreferences } from "../shared/agent";
import { fitGeneratedDocument } from "./ai-fitting";
import { objectStorage } from "./storage";
import type { Hono } from "hono";
import { z } from "zod";
import { createHash } from "node:crypto";
import { PresentationCredits } from "./credits";
import {
  briefSchema,
  outlineSchema,
  outlineResponseSchema,
  outlineResponseFor,
  deckResponseSchema,
  deckResponseFor,
  type SourceRecord,
  draftDataSchema,
  type DraftData,
  type CreationDraft,
} from "../shared/ai";
import {
  uid,
  themeSchema,
  documentSchema,
  type User,
  type FrameDocument,
} from "../shared/schema";
import { makeDocument } from "../shared/templates";
import { Store, ApiError } from "./store";
import {
  JobQueue,
  JobWorker,
  JobFailure,
  publicJob,
  type JobRow,
} from "./jobs";
import { SourceStore, registerSourceRoutes } from "./sources";
import {
  AI_INSTRUCTIONS,
  configuredAIProvider,
  type AIProvider,
} from "./ai-provider";
import { extractFile } from "./extract";
import { generationPreview } from "./ai-documents";
import { DEFAULT_CREATION_THEME } from "../shared/featured-themes";
import { runEditJob, registerEditRoutes } from "./ai-edits";
import { runThemeJob, registerThemeAIRoutes } from "./ai-themes";
import { ExportService } from "./exports";
import { CreativeWorkflows } from "./creative-workflows";
import {
  researchKey,
  researchSources,
  RESEARCH_GROUNDING,
} from "./web-research";
import { webResearchSchema, type WebResearch } from "../shared/ai-research";
type DraftRow = {
  id: string;
  ownerId: string;
  workspaceId: string;
  revision: number;
  data: string;
  createdAt: string;
  updatedAt: string;
};
const fingerprint = (data: DraftData) =>
  createHash("sha256")
    .update(
      JSON.stringify({
        brief: data.brief,
        theme: data.theme,
        outline: data.outline,
        quickDraft: data.quickDraft,
      }),
    )
    .digest("hex");
export class CreationStore {
  constructor(public store: Store) {}
  async preferences(user: User): Promise<AgentPreferences> {
    const row = await this.store.db.one("agentPreferences", {
      userId: user.id,
    });
    return {
      ...agentPreferencesSchema.parse(row ? JSON.parse(row.data) : {}),
      revision: row?.revision || 0,
    };
  }
  async savePreferences(user: User, input: unknown): Promise<AgentPreferences> {
    const request = z
      .object({
        baseRevision: z.number().int().nonnegative(),
        language: z.string(),
        agentMarkdown: z.string(),
      })
      .parse(input);
    const value = agentPreferencesSchema.parse(request);
    return this.store.db.transaction(async () => {
      await this.store.db.update(
        "jobQuotas",
        { id: user.id },
        { $inc: { revision: 1 } },
      );
      const prior = await this.preferences(user);
      if (prior.revision !== request.baseRevision)
        throw new ApiError(
          409,
          "Your AI preferences changed in another window. Reload before saving.",
        );
      await this.store.db.update(
        "agentPreferences",
        { userId: user.id },
        {
          $set: {
            data: JSON.stringify(value),
            revision: request.baseRevision + 1,
            updatedAt: new Date().toISOString(),
          },
        },
        { upsert: true },
      );
      return { ...value, revision: request.baseRevision + 1 };
    })();
  }
  private project(row: DraftRow): CreationDraft {
    return {
      id: row.id,
      revision: row.revision,
      data: draftDataSchema.parse(JSON.parse(row.data)),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
  async get(id: string, user: User): Promise<CreationDraft> {
    const row = (await this.store.db.one("creationDrafts", {
      $and: [
        { id: id },
        { ownerId: user.id },
        { workspaceId: user.workspaceId },
      ],
    })) as DraftRow | null;
    if (!row) throw new ApiError(404, "Creation draft not found.");
    return this.project(row);
  }
  async list(user: User): Promise<CreationDraft[]> {
    return (
      (await this.store.db.find(
        "creationDrafts",
        { $and: [{ ownerId: user.id }, { workspaceId: user.workspaceId }] },
        { sort: { updatedAt: -1 }, limit: 30 },
      )) as DraftRow[]
    ).map((r) => this.project(r));
  }
  async page(user:User,query:Record<string,string>) {
    return collectionPage(this.store.db,'creationDrafts',{ownerId:user.id,workspaceId:user.workspaceId},query,row=>this.project(row));
  }
  async create(user: User, supplied?: DraftData): Promise<CreationDraft> {
    const id = uid(),
      now = new Date().toISOString(),
      data: DraftData = {
        brief: {
          topic: "",
          audience: "General audience",
          outcome: "Explain the main ideas clearly",
          slideCount: 8,
          tone: "Clear and confident",
          requirements: "",
          sourceIds: [],
          ...(await this.preferences(user)),
        },
        theme: DEFAULT_CREATION_THEME,
        outline: null,
        quickDraft: false,
        outlineJobId: null,
        generationJobId: null,
      };
    await this.store.db.insert("creationDrafts", {
      id: id,
      ownerId: user.id,
      workspaceId: user.workspaceId,
      revision: 0,
      data: JSON.stringify(supplied ? draftDataSchema.parse(supplied) : data),
      createdAt: now,
      updatedAt: now,
    });
    return await this.get(id, user);
  }
  async update(
    id: string,
    user: User,
    revision: number,
    data: DraftData,
  ): Promise<CreationDraft> {
    return await this.store.db.transaction(async () => {
      const current = await this.get(id, user);
      if (current.revision !== revision)
        throw new ApiError(
          409,
          "This creation draft changed in another window. Your local fields are preserved. Reload before saving a new version.",
        );
      const value = draftDataSchema.parse(data);
      await this.store.db.update(
        "creationDrafts",
        { id: id },
        {
          $set: {
            data: JSON.stringify(value),
            updatedAt: new Date().toISOString(),
          },
          $inc: { revision: +1 },
        },
      );
      return await this.get(id, user);
    })();
  }
}
export function createAIServices(
  store: Store,
  provider: AIProvider = configuredAIProvider(),
): AIServices {
  const queue = new JobQueue(store),
    sources = new SourceStore(store, queue),
    drafts = new CreationStore(store),
    exports = new ExportService(store, queue),
    workflows = new CreativeWorkflows(store, queue, provider);
  const worker = new JobWorker(
    queue,
    async (job, context) => {
      const payload = JSON.parse(job.payload);
      if (job.kind.startsWith("creative-"))
        return workflows.runChild(job, context);
      if (job.kind === "export") return exports.run(job, context);
      if (job.kind === "extract") {
        await context.progress("Reading document text", 20);
        const asset = (await store.db.one("assets", {
          $and: [{ id: payload.assetId }, { ownerId: job.ownerId }],
        })) as {
          storageKey: string;
        } | null;
        if (!asset)
          throw new JobFailure(
            "Source upload no longer exists. Upload the document again.",
          );
        return extractFile(
          new Uint8Array(
            await objectStorage().read(
              "assets",
              asset.storageKey,
              10 * 1024 * 1024,
            ),
          ),
          payload.name,
          context.signal,
        );
      }
      if (job.kind === "theme")
        return runThemeJob(job, { store, provider }, context);
      if (job.kind === "edit") return runEditJob(job, { provider }, context);
      if (!["outline", "generate"].includes(job.kind))
        throw new JobFailure("This job type is not supported by this worker.");
      const brief = briefSchema.parse(payload.brief),
        included = [
          ...(payload.sources as SourceRecord[]),
          ...researchSources(payload.research),
        ];
      const input = {
        brief,
        sources: included.map((s) => ({
          id: s.id,
          name: s.name,
          text: s.text,
        })),
        theme: payload.theme,
      };
      await context.progress(
        included.length ? "Reading your sources" : "Reading the brief",
        10,
      );
      let outline = payload.outline;
      if (job.kind === "outline" || !outline) {
        await context.progress("Writing the story", 30);
        const generated = outlineResponseSchema.parse(
          await provider.generate(
            "presentation_outline",
            outlineResponseFor(brief.slideCount),
            AI_INSTRUCTIONS +
              RESEARCH_GROUNDING +
              " Create an outline with exactly the requested slide count. Plan visual explanations in the middle slides: processes, comparisons, timelines and relationships rather than a sequence of prose summaries. The first section opens the story and the last provides a conclusion.",
            input,
            context.signal,
          ),
        );
        if (generated.sections.length !== brief.slideCount)
          throw new JobFailure(
            "The outline did not match the requested slide count. Refine the brief and try again.",
          );
        outline = {
          ...generated,
          sections: generated.sections.map((s) => ({ ...s, id: uid() })),
        };
      }
      if (job.kind === "outline")
        return {
          outline: outlineSchema.parse(outline),
          ...(payload.research ? { research: payload.research } : {}),
        };
      await context.progress("Writing the slides", 45);
      const generated = deckResponseSchema.parse(
        await provider.generate(
          "presentation_slides",
          deckResponseFor(outline.sections.length),
          AI_INSTRUCTIONS +
            RESEARCH_GROUNDING +
            " Follow the reviewed outline. Return one slide per section, in the same order. Give each slide one clear point, a specific headline, and short supporting copy. Use the visual specification to build diagrams, shapes, icons, comparisons and tables on content slides. Put longer explanations in speaker notes. Vary the narrative with comparisons, processes, timelines and concise takeaways when the material calls for them; avoid repeating one layout across the deck. Use null for question unless a real audience question belongs on the slide. Never invent chart data or add questions just for decoration.",
          { ...input, outline },
          context.signal,
        ),
      );
      if (generated.slides.length !== outline.sections.length)
        throw new JobFailure(
          "The generated slides did not match the outline. Nothing was applied. Try again.",
        );
      await context.progress("Styling the slides", 85);
      const owner = await store.user(job.ownerId);
      if (!owner)
        throw new JobFailure("The owner account is no longer available.");
      const base = makeDocument(
        owner.id,
        owner.workspaceId,
        generated.title,
        "blank",
      );
      base.themes = [themeSchema.parse(payload.theme)];
      base.themeId = base.themes[0].id;
      base.language = brief.language;
      base.description = brief.topic.slice(0, 2000);
      const document = documentSchema.parse(
        generationPreview(base, generated.slides, included),
      );
      await context.progress("Checking the details", 95);
      const fitted = await fitGeneratedDocument(document, context.signal);
      return {
        document: fitted.document,
        outline,
        warnings: [...fitted.warnings, ...(payload.research?.warnings || [])],
        ...(payload.research ? { research: payload.research } : {}),
      };
    },
    (job) =>
      ["creative-batch", "creative-review"].includes(job.kind)
        ? Math.min(270000, Number(process.env.FRAME_JOB_TIMEOUT_MS || 270000))
        : 180000,
  );
  worker.beforeRun = async () => await workflows.reconcile();
  return {
    store,
    queue,
    sources,
    drafts,
    worker,
    provider,
    exports,
    workflows,
  };
}
export type AIServices = {
  store: Store;
  queue: JobQueue;
  sources: SourceStore;
  drafts: CreationStore;
  worker: JobWorker;
  provider: AIProvider;
  exports: ExportService;
  workflows: CreativeWorkflows;
};
export function registerAIRoutes(
  app: Hono<{
    Variables: {
      user: User;
    };
  }>,
  services: AIServices,
) {
  const { store, queue, sources, drafts, worker, provider } = services;
  app.get("/api/ai/preferences", async (c) =>
    c.json(await drafts.preferences(c.get("user"))),
  );
  app.put("/api/ai/preferences", async (c) =>
    c.json(await drafts.savePreferences(c.get("user"), await c.req.json())),
  );
  const credits = new PresentationCredits(store);
  const canWrite = async (user: User) => {
    const member = (await store.db.one("members", {
      $and: [{ userId: user.id }, { workspaceId: user.workspaceId }],
    })) as {
      role: string;
    } | null;
    if (!member || member.role === "viewer")
      throw new ApiError(
        403,
        "Editor access is required to create presentations.",
      );
  };
  app.get("/api/ai/status", (c) =>
    c.json({
      configured: provider.configured,
      provider: provider.label || "AI",
      supportsImages: provider.supportsImages !== false,
      supportsVisualReview: provider.supportsVisualReview === true,
      limits: {
        sourceBytes: 10 * 1024 * 1024,
        sourceCharacters: 200000,
        selectedCharacters: 120000,
        slides: 30,
      },
    }),
  );
  const canReadJob = async (job: JobRow, user: User) => {
    if (job.deckId) await store.requireAccess(job.deckId, user, true);
    return job;
  };
  app.get("/api/jobs", async (c) => {
    const user = c.get("user");
    if(c.req.header('X-Frame-Contract')!=='reference')return c.json(await collectionPage(store.db,'jobs',{ownerId:user.id,parentId:null},c.req.query(),async job=>!job.deckId||['owner','editor'].includes((await store.role(job.deckId,user))||'')?publicJob(job):null));
    return c.json(
      (
        await filterAsync(
          await queue.list(user.id),
          async (job) =>
            !job.deckId ||
            ["owner", "editor"].includes(
              (await store.role(job.deckId, user)) || "",
            ),
        )
      ).map(publicJob),
    );
  });
  app.get("/api/jobs/:id", async (c) => {
    const user = c.get("user");
    return c.json(
      publicJob(
        await canReadJob(await queue.get(c.req.param("id"), user.id), user),
      ),
    );
  });
  app.get("/api/jobs/:id/preview", async (c) => {
    const user = c.get("user"),
      job = await canReadJob(await queue.get(c.req.param("id"), user.id), user);
    if (JSON.parse(job.payload).workflowVersion !== 2)
      throw new ApiError(404, "Progressive preview not found.");
    const since = z.coerce
      .number()
      .int()
      .min(0)
      .max(200)
      .parse(c.req.query("since") || 0);
    return c.json(await services.workflows.preview(job, since));
  });
  app.post("/api/jobs/:id/cancel", async (c) => {
    const user = c.get("user");
    await canReadJob(await queue.get(c.req.param("id"), user.id), user);
    return c.json(publicJob(await worker.cancel(c.req.param("id"), user.id)));
  });
  registerSourceRoutes(app, sources, worker);
  registerEditRoutes(app, services);
  registerThemeAIRoutes(app, services);
  app.get("/api/creation", async (c) =>
    c.json(c.req.header('X-Frame-Contract')==='reference'?await drafts.list(c.get("user")):await drafts.page(c.get('user'),c.req.query())),
  );
  app.post("/api/creation", async (c) => {
    await canWrite(c.get("user"));
    const body = z
      .object({ data: draftDataSchema.optional() })
      .parse(await c.req.json().catch(() => ({})));
    if (body.data)
      await sources.selected(body.data.brief.sourceIds, c.get("user"));
    return c.json(await drafts.create(c.get("user"), body.data), 201);
  });
  app.get("/api/creation/:id", async (c) =>
    c.json(await drafts.get(c.req.param("id"), c.get("user"))),
  );
  app.put("/api/creation/:id", async (c) => {
    const user = c.get("user");
    await canWrite(user);
    const input = z
      .object({ revision: z.number().int().min(0), data: draftDataSchema })
      .parse(revisionInput(await c.req.json()));
    await sources.selected(input.data.brief.sourceIds, user);
    return c.json(
      await drafts.update(c.req.param("id"), user, input.revision, input.data),
    );
  });
  app.post("/api/creation/:id/jobs", async (c) => {
    const user = c.get("user");
    await canWrite(user);
    const input = z
      .object({
        revision: z.number().int().min(0),
        kind: z.enum(["outline", "generate"]),
        key: z.string().min(8).max(100),
        designVersion: z.literal(2).optional(),
        resumeJobId: z.string().min(1).max(100).optional(),
      })
      .parse(revisionInput(await c.req.json()));
    if (!provider.configured)
      throw new ApiError(
        503,
        "AI is not configured. Ask the server owner to connect an AI provider. You can still create and present manually.",
      );
    const result = await store.db.transaction(async () => {
      const draft = await drafts.get(c.req.param("id"), user);
      if (input.kind === "generate") await credits.requireAvailable(user.id);
      if (draft.revision !== input.revision)
        throw new ApiError(
          409,
          "Save the current creation draft before starting AI work.",
        );
      const brief = briefSchema.parse(draft.data.brief),
        included = await sources.selected(brief.sourceIds, user);
      let research: WebResearch | undefined;
      // The client clears outlineJobId when accepting/editing the outline.
      // Find its matching, owner-scoped research snapshot by saved inputs.
      // Reuse only for slide generation; asking for a new outline searches anew.
      if (input.kind === "generate" && brief.webSearch !== false) {
        const candidates = (await store.db.find(
          "jobs",
          {
            ownerId: user.id,
            kind: "outline",
            status: "succeeded",
            draftId: draft.id,
          },
          { sort: { createdAt: -1 }, limit: 20 },
        )) as JobRow[];
        const currentKey = researchKey(brief, included);
        for (const candidate of candidates) {
          const prior = JSON.parse(candidate.payload);
          if (
            researchKey(briefSchema.parse(prior.brief), prior.sources || []) !==
            currentKey
          )
            continue;
          const parsed = webResearchSchema.safeParse(
            JSON.parse(candidate.result || "{}").research,
          );
          if (parsed.success) {
            research = parsed.data;
            break;
          }
        }
      }
      if (
        input.kind === "generate" &&
        !draft.data.quickDraft &&
        !draft.data.outline
      )
        throw new ApiError(
          400,
          "Review an outline first, or choose quick draft.",
        );
      const enqueue =
        (input.kind === "generate" && input.designVersion === 2) ||
        (input.kind === "outline" &&
          provider.supportsWebSearch &&
          brief.webSearch !== false)
          ? async (
              owner: string,
              kind: string,
              payload: Record<string, unknown>,
              key: string,
            ) =>
              await services.workflows.create(
                owner,
                input.kind,
                payload,
                key,
                null,
                input.resumeJobId,
              )
          : async (
              owner: string,
              kind: string,
              payload: Record<string, unknown>,
              key: string,
            ) => await queue.enqueue(owner, kind, payload, key);
      const job = await enqueue(
        user.id,
        input.kind,
        {
          draftId: draft.id,
          draftFingerprint: fingerprint(draft.data),
          brief,
          theme: draft.data.theme,
          outline: input.kind === "outline" ? null : draft.data.outline,
          sources: included,
          ...(research ? { research } : {}),
        },
        input.key,
      );
      const updated = await drafts.update(draft.id, user, draft.revision, {
        ...draft.data,
        [input.kind === "outline" ? "outlineJobId" : "generationJobId"]: job.id,
      });
      return { draft: updated, job: publicJob(job) };
    })();
    return c.json(result, 202);
  });
  app.post("/api/creation/:id/finish", async (c) => {
    const user = c.get("user");
    await canWrite(user);
    const input = z
      .object({ jobId: z.string().min(1) })
      .parse(await c.req.json());
    const document = await store.db.transaction(async () => {
      const job = await queue.get(input.jobId, user.id),
        payload = JSON.parse(job.payload),
        draft = await drafts.get(c.req.param("id"), user);
      if (job.kind !== "generate" || payload.draftId !== draft.id)
        throw new ApiError(
          400,
          "Choose the generation result for this creation draft.",
        );
      const previous = (await store.db.one("jobApplications", {
        jobId: job.id,
      })) as {
        deckId: string;
      } | null;
      if (previous) return await store.access(previous.deckId, user);
      if (job.status !== "succeeded" || !job.result)
        throw new ApiError(409, "Wait for slide generation to finish.");
      if (payload.draftFingerprint !== fingerprint(draft.data))
        throw new ApiError(
          409,
          "The brief, theme or outline changed after generation started. Generate a new preview before creating the presentation.",
        );
      const result = JSON.parse(job.result),
        document = documentSchema.parse({
          ...result.document,
          ownerId: user.id,
          workspaceId: user.workspaceId,
          revision: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      await credits.consume(user.id);
      await store.write(document);
      await store.db.insert("jobApplications", {
        jobId: job.id,
        deckId: document.id,
        createdAt: new Date().toISOString(),
      });
      return document;
    })();
    return c.json(document, 201);
  });
}
