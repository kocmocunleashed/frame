import { afterEach, expect, test } from "bun:test";
import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";
import { Store } from "./mongo";
import { createApp } from "./support/legacy-app";
import { createAIServices } from "../server/creation";
import { FixtureAIProvider } from "./fixtures/ai-provider";
import { OpenAIProvider, type AIProvider } from "../server/ai-provider";
import { uid, type FrameDocument } from "../shared/schema";
import {
  outlineResponseSchema,
  deckResponseSchema,
  type CreationDraft,
  type AIJob,
} from "../shared/ai";
const stores: Store[] = [];
afterEach(async () => {
  for (const store of stores.splice(0)) await store.db.close();
});
const req = (method: string, cookie: string, body?: unknown) => ({
  method,
  headers: { cookie, "content-type": "application/json" },
  ...(body ? { body: JSON.stringify(body) } : {}),
});
async function setup(provider: AIProvider = new FixtureAIProvider()) {
  const store = new Store(":memory:");
  stores.push(store);
  const services = createAIServices(store, provider),
    app = createApp(store, services);
  async function signup() {
    const response = await app.request(
      "/api/auth/signup",
      req("POST", "", {
        name: "AI tester",
        email: `${uid()}@example.test`,
        password: "frame-ai-test-passphrase",
      }),
    );
    return response.headers.get("set-cookie")!.split(";")[0];
  }
  const cookie = await signup();
  async function draft() {
    const response = await app.request("/api/creation", req("POST", cookie));
    expect(response.status).toBe(201);
    return response.json() as Promise<CreationDraft>;
  }
  async function save(draft: CreationDraft) {
    const response = await app.request(
      `/api/creation/${draft.id}`,
      req("PUT", cookie, { revision: draft.revision, data: draft.data }),
    );
    expect(response.status).toBe(200);
    return response.json() as Promise<CreationDraft>;
  }
  async function start(draft: CreationDraft, kind: "outline" | "generate") {
    const response = await app.request(
      `/api/creation/${draft.id}/jobs`,
      req("POST", cookie, { revision: draft.revision, kind, key: uid() }),
    );
    expect(response.status).toBe(202);
    return response.json() as Promise<{
      draft: CreationDraft;
      job: AIJob;
    }>;
  }
  return { store, services, app, cookie, signup, draft, save, start };
}
test("reviewed source → editable outline → durable slides → explicit idempotent deck creation", async () => {
  const { app, services, cookie, draft, save, start } = await setup();
  const pasted = await (
    await app.request(
      "/api/sources",
      req("POST", cookie, {
        name: "Course material",
        text: "Clear explanation helps learners connect ideas.",
      }),
    )
  ).json();
  let d = await draft();
  d.data.brief = {
    ...d.data.brief,
    topic: "Helping learners connect ideas",
    slideCount: 3,
    sourceIds: [pasted.id],
  };
  d = await save(d);
  const outline = await start(d, "outline");
  expect(outline.job.status).toBe("queued");
  await services.worker.runOnce();
  const result = await (
    await app.request(`/api/jobs/${outline.job.id}`, req("GET", cookie))
  ).json();
  expect(result.status).toBe("succeeded");
  expect(result.result.outline.sections).toHaveLength(3);
  d = outline.draft;
  d.data.outline = result.result.outline;
  d.data.outline!.sections[1].title = "A reviewed middle";
  d = await save(d);
  const generation = await start(d, "generate");
  await services.worker.runOnce();
  const finished = await (
    await app.request(`/api/jobs/${generation.job.id}`, req("GET", cookie))
  ).json();
  expect(finished.error).toBeNull();
  expect(finished.status).toBe("succeeded");
  expect(finished.result.document.slides[1].title).toBe("A reviewed middle");
  expect(
    finished.result.document.slides[0].sourceSupport.evidence[0].sourceId,
  ).toBe(pasted.id);
  expect(
    (
      (await ({n:await services.store.db.count("decks",{})})) as {
        n: number;
      }
    ).n,
  ).toBe(3);
  const apply = async () =>
    await app.request(
      `/api/creation/${d.id}/finish`,
      req("POST", cookie, { jobId: generation.job.id }),
    );
  const created = await apply();
  expect(created.status).toBe(201);
  const document = (await created.json()) as FrameDocument;
  expect(document.slides).toHaveLength(3);
  expect(document.slides[0].notes).toContain("Private speaking guidance");
  expect((await (await apply()).json()).id).toBe(document.id);
  expect(
    (
      (await ({n:await services.store.db.count("decks",{})})) as {
        n: number;
      }
    ).n,
  ).toBe(4);
});
test("independent design jobs expose authorized incremental previews and finish only after every batch", async () => {
  const { app, services, cookie, draft, save, signup } = await setup();
  let d = await draft();
  d.data.brief.topic = "An independently illustrated feedback workshop";
  d.data.brief.slideCount = 3;
  d.data.quickDraft = true;
  d = await save(d);
  const started = await app.request(
    `/api/creation/${d.id}/jobs`,
    req("POST", cookie, {
      revision: d.revision,
      kind: "generate",
      designVersion: 2,
      key: uid(),
    }),
  );
  expect(started.status).toBe(202);
  const { job } = await started.json();
  const foreign = await signup();
  expect(
    (await app.request(`/api/jobs/${job.id}/preview`, req("GET", foreign)))
      .status,
  ).toBe(404);
  for (let i = 0; i < 3; i++) await services.worker.runOnce(); // outline, plan, first batch
  const status = await (
    await app.request(`/api/jobs/${job.id}`, req("GET", cookie))
  ).json();
  expect(status.completedSlides).toBe(2);
  expect(status.status).toBe("running");
  const partial = await (
    await app.request(`/api/jobs/${job.id}/preview?since=1`, req("GET", cookie))
  ).json();
  expect(partial.slides).toHaveLength(1);
  expect(partial.slides[0].index).toBe(1);
  expect(
    (
      await app.request(
        `/api/creation/${d.id}/finish`,
        req("POST", cookie, { jobId: job.id }),
      )
    ).status,
  ).toBe(409);
  await services.worker.runOnce();
  const final = await (
    await app.request(`/api/jobs/${job.id}`, req("GET", cookie))
  ).json();
  expect(final.status).toBe("succeeded");
  expect(final.completedSlides).toBe(3);
  const finished = await app.request(
    `/api/creation/${d.id}/finish`,
    req("POST", cookie, { jobId: job.id }),
  );
  expect(finished.status).toBe(201);
  const doc = await finished.json();
  expect(doc.version).toBe(2);
  expect(
    doc.slides.every((slide: { layout: string }) => slide.layout === "free"),
  ).toBe(true);
  expect(
    new Set(doc.slides.map((slide: { themeId: string }) => slide.themeId)).size,
  ).toBe(3);
}, 60000);
test("quick draft works without outline review, and a changed brief cannot apply a stale preview", async () => {
  const { app, services, cookie, draft, save, start } = await setup();
  let d = await draft();
  d.data.brief.topic = "A concise product story";
  d.data.brief.slideCount = 3;
  d.data.quickDraft = true;
  d = await save(d);
  const started = await start(d, "generate");
  await services.worker.runOnce();
  d = started.draft;
  d.data.brief.topic = "A changed product story";
  await save(d);
  const response = await app.request(
    `/api/creation/${d.id}/finish`,
    req("POST", cookie, { jobId: started.job.id }),
  );
  expect(response.status).toBe(409);
  expect((await response.json()).error).toContain("changed after generation");
  expect(
    (
      (await ({n:await services.store.db.count("decks",{})})) as {
        n: number;
      }
    ).n,
  ).toBe(3);
});
test("creation drafts, sources and job results enforce ownership; drafts detect revision conflicts", async () => {
  const { app, cookie, signup, draft, save } = await setup(),
    other = await signup();
  let d = await draft();
  d.data.brief.topic = "A private draft";
  d = await save(d);
  expect(
    (await app.request(`/api/creation/${d.id}`, req("GET", other))).status,
  ).toBe(404);
  expect(
    (
      await app.request(
        `/api/creation/${d.id}`,
        req("PUT", cookie, { revision: 0, data: d.data }),
      )
    ).status,
  ).toBe(409);
  const source = await (
    await app.request(
      "/api/sources",
      req("POST", cookie, {
        name: "Private source",
        text: "Only the owner may include this source.",
      }),
    )
  ).json();
  expect(
    (await app.request(`/api/sources/${source.id}`, req("GET", other))).status,
  ).toBe(404);
  const foreign = await (
    await app.request("/api/creation", req("POST", other))
  ).json();
  foreign.data.brief.sourceIds = [source.id];
  expect(
    (
      await app.request(
        `/api/creation/${foreign.id}`,
        req("PUT", other, { revision: foreign.revision, data: foreign.data }),
      )
    ).status,
  ).toBe(404);
});
test("an unconfigured provider reports an honest setup state and never queues simulated generation", async () => {
  const { app, cookie, draft, save, services } = await setup(
    new OpenAIProvider(""),
  );
  let d = await draft();
  d.data.brief.topic = "Still useful manually";
  d = await save(d);
  expect(
    (await (await app.request("/api/ai/status", req("GET", cookie))).json())
      .configured,
  ).toBe(false);
  expect(
    (
      await app.request(
        `/api/creation/${d.id}/jobs`,
        req("POST", cookie, {
          revision: d.revision,
          kind: "outline",
          key: uid(),
        }),
      )
    ).status,
  ).toBe(503);
  expect(
    await services.queue.list(
      (await services.store.user(
        (
          (await services.store.db.one("users")) as {
            id: string;
          }
        ).id,
      ))!.id,
    ),
  ).toHaveLength(0);
});
test("unknown source references do not block generation or become invented citations", async () => {
  const provider = new FixtureAIProvider(),
    generate = provider.generate.bind(provider);
  provider.generate = async (name, schema, instructions, input, signal) => {
    const value = (await generate(
      name,
      schema,
      instructions,
      input,
      signal,
    )) as {
      slides?: {
        claims: {
          sourceId: string | null;
          quote: string | null;
        }[];
      }[];
    };
    if (value.slides)
      for (const slide of value.slides)
        slide.claims[0] = {
          ...slide.claims[0],
          sourceId: "made-up-source",
          quote: "Invented quote",
        };
    return value;
  };
  const { app, services, cookie, draft, save, start } = await setup(provider);
  let d = await draft();
  d.data.brief.topic = "A safe generation";
  d.data.brief.slideCount = 3;
  d.data.quickDraft = true;
  d = await save(d);
  const started = await start(d, "generate");
  await services.worker.runOnce();
  const result = await (
    await app.request(`/api/jobs/${started.job.id}`, req("GET", cookie))
  ).json();
  expect(result.status).toBe("succeeded");
  expect(result.result.document.slides[0].sourceSupport.evidence).toEqual([]);
  expect(
    result.result.document.slides[0].sourceSupport.suggestions.length,
  ).toBeGreaterThan(0);
});
test("structured-output schemas are accepted by the official Zod helper without optional response fields", () => {
  for (const [name, schema] of [
    ["outline", outlineResponseSchema],
    ["slides", deckResponseSchema],
  ] as const) {
    const format = zodTextFormat(schema, name);
    expect(format.type).toBe("json_schema");
    expect(format.strict).toBe(true);
    expect(format.schema.additionalProperties).toBe(false);
  }
});
test("headline-only generated slides fail before they can become an editable deck", async () => {
  const provider = new FixtureAIProvider(),
    generate = provider.generate.bind(provider);
  provider.generate = async (name, schema, instructions, input, signal) => {
    const result = (await generate(
      name,
      schema,
      instructions,
      input,
      signal,
    )) as {
      slides?: {
        claims: unknown[];
      }[];
    };
    if (result.slides) for (const slide of result.slides) slide.claims = [];
    return result;
  };
  const { app, services, cookie, draft, save, start } = await setup(provider);
  let d = await draft();
  d.data.brief.topic = "A useful workshop";
  d.data.brief.slideCount = 3;
  d.data.quickDraft = true;
  d = await save(d);
  const begun = await start(d, "generate");
  await services.worker.runOnce();
  const result = await (
    await app.request(`/api/jobs/${begun.job.id}`, req("GET", cookie))
  ).json();
  expect(result.status).toBe("failed");
  const applied = await app.request(
    `/api/creation/${d.id}/finish`,
    req("POST", cookie, {
      revision: begun.draft.revision,
      jobId: begun.job.id,
    }),
  );
  expect(applied.status).not.toBe(201);
  expect(
    (
      (await ({n:await services.store.db.count("decks",{})})) as {
        n: number;
      }
    ).n,
  ).toBe(3);
});

test("agent defaults are personal, validated and copied only into new drafts", async () => {
  const { app, cookie, signup, draft } = await setup();
  const existing = await draft();
  const preferences = {
    language: "Mongolian",
    agentMarkdown: "# Voice\nUse examples from everyday life.",
  };
  expect(
    (await app.request("/api/ai/preferences", req("PUT", cookie, {...preferences,baseRevision:0})))
      .status,
  ).toBe(200);
  expect(
    await (await app.request("/api/ai/preferences", req("GET", cookie))).json(),
  ).toEqual({...preferences,revision:1});
  const next = await draft();
  expect(next.data.brief.language).toBe("Mongolian");
  expect(next.data.brief.agentMarkdown).toBe(preferences.agentMarkdown);
  const old = await (
    await app.request(`/api/creation/${existing.id}`, req("GET", cookie))
  ).json();
  expect(old.data.brief.language).toBe("English");
  const foreign = await signup();
  const other = await (
    await app.request("/api/ai/preferences", req("GET", foreign))
  ).json();
  expect(other.language).toBe("English");
  expect(other.agentMarkdown).not.toBe(preferences.agentMarkdown);
  for (const invalid of [
    { ...preferences, language: "  " },
    { ...preferences, agentMarkdown: "x".repeat(12001) },
  ]) {
    expect(
      (await app.request("/api/ai/preferences", req("PUT", cookie, {...invalid,baseRevision:1})))
        .status,
    ).toBe(400);
  }
  expect(
    await (await app.request("/api/ai/preferences", req("GET", cookie))).json(),
  ).toEqual({...preferences,revision:1});
  expect((await app.request("/api/ai/preferences")).status).toBe(401);
});

for (const designVersion of [undefined, 2] as const) {
  test(`generation carries agent.md and language through ${designVersion === 2 ? "design" : "standard"} stages`, async () => {
    const provider = new FixtureAIProvider();
    const generate = provider.generate.bind(provider);
    const calls: { name: string; instructions: string; brief: any }[] = [];
    provider.generate = async (name, schema, instructions, input, signal) => {
      calls.push({ name, instructions, brief: (input as any).brief });
      return generate(name, schema, instructions, input, signal);
    };
    const { app, services, cookie, draft, save } = await setup(provider);
    let d = await draft();
    d.data.brief = {
      ...d.data.brief,
      topic: "Useful classroom feedback",
      slideCount: 3,
      language: "Mongolian",
      agentMarkdown: "# Voice\nUse short teaching examples.",
      webSearch: false,
    };
    d.data.quickDraft = true;
    d = await save(d);
    const response = await app.request(
      `/api/creation/${d.id}/jobs`,
      req("POST", cookie, {
        revision: d.revision,
        kind: "generate",
        designVersion,
        key: uid(),
      }),
    );
    expect(response.status).toBe(202);
    const started = await response.json();
    // Jobs use the original saved snapshot, even if defaults change mid-run.
    await app.request(
      "/api/ai/preferences",
      req("PUT", cookie, {
        language: "French",
        agentMarkdown: "Different defaults",
      }),
    );
    for (let i = 0; i < (designVersion === 2 ? 4 : 1); i++)
      await services.worker.runOnce();
    const result = await (
      await app.request(`/api/jobs/${started.job.id}`, req("GET", cookie))
    ).json();
    expect(result.status).toBe("succeeded");
    expect(calls.map((c) => c.name)).toEqual(
      designVersion === 2
        ? [
            "presentation_outline",
            "creative_design_plan",
            "creative_scene_batch",
            "creative_scene_batch",
          ]
        : ["presentation_outline", "presentation_slides"],
    );
    for (const call of calls) {
      expect(call.brief.language).toBe("Mongolian");
      expect(call.brief.agentMarkdown).toBe(d.data.brief.agentMarkdown);
      expect(call.instructions).toContain("Writing quality:");
      expect(call.instructions).toContain("brief.language takes precedence");
      expect(call.instructions).toContain("keep source references unchanged");
    }
    const finished = await app.request(
      `/api/creation/${d.id}/finish`,
      req("POST", cookie, { jobId: started.job.id }),
    );
    expect(finished.status).toBe(201);
    expect((await finished.json()).language).toBe("Mongolian");
  }, 60000);
}
