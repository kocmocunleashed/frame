import { test, expect } from "bun:test";
import { z } from "zod";
import OpenAI from "openai";
import {
  OpenRouterProvider,
  DEFAULT_FREE_MODEL,
  MUSE_CONTRIBUTOR_MODEL,
  GEMMA4_MODEL,
} from "../server/openrouter";
import { JobFailure, JobQueue, JobWorker } from "../server/jobs";
import { Store } from "./mongo";
const schema = z.object({ title: z.string() }).strict();
function fixture(
  options: {
    pricing?: Record<string, unknown>;
    parameters?: string[];
    vision?: boolean;
    status?: number;
    content?: string;
    cost?: number;
    connectionFailure?: "timeout" | "disconnect";
    fallbackPricing?: Record<string, string>;
    fallbackVision?: boolean;
    embeddedError?: number;
    dailyQuota?: boolean;
    reasoningMandatory?: boolean;
    finishReason?: "stop" | "length" | "error";
    model?: string;
    enableMuse?: boolean;
    responseModel?: string;
    omitCost?: boolean;
    searchCalls?: number;
    stallStream?: boolean;
    requestTimeoutMs?: number;
  } = {},
) {
  const model = options.model || DEFAULT_FREE_MODEL;
  const calls: {
    path: string;
    body: any;
    auth: string | null;
    signal: AbortSignal;
  }[] = [];
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init),
      path = new URL(req.url).pathname,
      body = req.method === "POST" ? await req.json() : null;
    calls.push({
      path,
      body,
      auth: req.headers.get("authorization"),
      signal: req.signal,
    });
    if (path === "/api/v1/models")
      return Response.json({
        data: [
          {
            id: "unrelated/paid-model",
            pricing: { prompt: "1", overrides: [] },
          },
          {
            id: model,
            pricing: options.pricing || { prompt: "0", completion: "0" },
            supported_parameters: options.parameters || ["structured_outputs"],
            reasoning: { mandatory: options.reasoningMandatory },
            architecture: {
              input_modalities:
                options.vision === false ? ["text"] : ["text", "image"],
            },
          },
          {
            id: "dots-studio/dots-3-note-preview:free",
            pricing: options.fallbackPricing || {
              prompt: "0",
              completion: "0",
            },
            supported_parameters: ["structured_outputs"],
            architecture: {
              input_modalities:
                options.fallbackVision === false ? ["text"] : ["text", "image"],
            },
          },
        ],
      });
    if (options.connectionFailure && body.model === model)
      throw options.connectionFailure === "timeout"
        ? new OpenAI.APIConnectionTimeoutError()
        : new OpenAI.APIConnectionError({ message: "Synthetic disconnect" });
    if (options.embeddedError)
      return new Response(
        `data: ${JSON.stringify({ error: { code: options.embeddedError, message: "Synthetic upstream failure" } })}\n\ndata: [DONE]\n\n`,
        { headers: { "content-type": "text/event-stream" } },
      );
    if (options.status)
      return Response.json(
        {
          error: {
            message: options.dailyQuota
              ? "Rate limit exceeded: free-models-per-day"
              : "Synthetic provider failure",
            code: options.status,
          },
        },
        { status: options.status },
      );
    const completion = {
      id: "test",
      object: "chat.completion",
      created: 1,
      model: options.responseModel || model,
      choices: [
        {
          index: 0,
          finish_reason: options.finishReason || "stop",
          message: {
            role: "assistant",
            content: options.content ?? '{"title":"Structured slide"}',
          },
        },
      ],
      usage: {
        cost: options.omitCost ? undefined : options.cost || 0,
        prompt_tokens: 1,
        completion_tokens: 1,
        total_tokens: 2,
        server_tool_use:
          options.searchCalls === undefined
            ? undefined
            : { web_search_requests: options.searchCalls },
      },
    };
    if (body.stream && options.stallStream)
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(": processing\n\n"));
            req.signal.addEventListener(
              "abort",
              () => controller.error(req.signal.reason),
              { once: true },
            );
          },
        }),
        { headers: { "content-type": "text/event-stream" } },
      );
    if (body.stream) {
      const content = options.content ?? '{"title":"Structured slide"}';
      const events = [
        {
          ...completion,
          choices: [
            {
              index: 0,
              delta: { content: content.slice(0, 10) },
              finish_reason: null,
            },
          ],
          usage: undefined,
        },
        {
          ...completion,
          choices: [
            {
              index: 0,
              delta: { content: content.slice(10) },
              finish_reason: options.finishReason || "stop",
            },
          ],
          usage: undefined,
        },
        {
          ...completion,
          choices: [
            {
              index: 0,
              delta: {},
              finish_reason: options.finishReason || "stop",
            },
          ],
        },
      ];
      return new Response(
        ": OPENROUTER PROCESSING\n\n" +
          events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("") +
          "data: [DONE]\n\n",
        { headers: { "content-type": "text/event-stream" } },
      );
    }
    return Response.json(completion);
  }) as typeof fetch;
  return {
    calls,
    provider: new OpenRouterProvider(
      "synthetic-test-key",
      model,
      fetcher,
      options.enableMuse || false,
      options.requestTimeoutMs,
    ),
  };
}
test("a stalled response body hits the full request deadline and aborts the stream", async () => {
  const { provider, calls } = fixture({
    stallStream: true,
    requestTimeoutMs: 25,
  });
  const outcome = await Promise.race([
    provider
      .generate("outline", schema, "", {}, new AbortController().signal)
      .catch((error) => error),
    Bun.sleep(200).then(() => "still waiting"),
  ]);
  expect(outcome).toBeInstanceOf(JobFailure);
  if (!(outcome instanceof JobFailure))
    throw new Error("Expected a bounded timeout");
  expect(outcome.retryable).toBe(true);
  expect(outcome.message).toContain("timed out");
  expect(calls.find((call) => call.body)?.signal.aborted).toBe(true);
});
test("cancelling a stalled stream remains permanent and never becomes a retryable timeout", async () => {
  const { provider, calls } = fixture({
    stallStream: true,
    requestTimeoutMs: 100,
  });
  const controller = new AbortController();
  const result = provider
    .generate("outline", schema, "", {}, controller.signal)
    .catch((error) => error);
  await Bun.sleep(10);
  controller.abort();
  const error = await result;
  expect(error).toBeInstanceOf(JobFailure);
  if (!(error instanceof JobFailure)) throw new Error("Expected cancellation");
  expect(error.retryable).toBe(false);
  expect(error.message).toContain("cancelled");
  expect(calls.find((call) => call.body)?.signal.aborted).toBe(true);
});
test("OpenRouter checks current free catalog data on every request, caps every route price at zero and validates JSON", async () => {
  const { provider, calls } = fixture();
  expect(
    await provider.generate(
      "outline",
      schema,
      "Return data",
      {},
      new AbortController().signal,
    ),
  ).toEqual({ title: "Structured slide" });
  expect(
    await provider.generate(
      "theme",
      schema,
      "Return data",
      {},
      new AbortController().signal,
      ["data:image/png;base64,AAAA"],
    ),
  ).toEqual({ title: "Structured slide" });
  expect(calls.map((c) => c.path)).toEqual([
    "/api/v1/models",
    "/api/v1/chat/completions",
    "/api/v1/models",
    "/api/v1/chat/completions",
  ]);
  expect(calls[0].auth).toBeNull();
  expect(calls[1].body.provider).toEqual({
    require_parameters: true,
    max_price: { prompt: 0, completion: 0, request: 0, image: 0 },
  });
  expect(calls[1].body.response_format.type).toBe("json_schema");
  expect(calls[1].body.model).toBe(DEFAULT_FREE_MODEL);
  expect(calls[1].body.stream).toBe(true);
  expect(calls[1].body.stream_options.include_usage).toBe(true);
  expect(calls[3].body.messages[1].content[1].image_url.url).toBe(
    "data:image/png;base64,AAAA",
  );
});
test("explicit Muse opt-in pins Meta at approved rates and accepts verified paid usage", async () => {
  const { provider, calls } = fixture({
    model: MUSE_CONTRIBUTOR_MODEL,
    enableMuse: true,
    pricing: {
      prompt: "0.0000001",
      completion: "0.0000002",
      input_cache_read: "0.000000002",
      web_search: "0.0025",
    },
    cost: 0.0000003,
  });
  expect(provider.label).toContain("Muse Spark 1.3 Contributor");
  expect(provider.supportsImages).toBe(true);
  expect(
    await provider.generate(
      "outline",
      schema,
      "Return data",
      {},
      new AbortController().signal,
    ),
  ).toEqual({ title: "Structured slide" });
  expect(calls[1].body.provider).toEqual({
    require_parameters: true,
    allow_fallbacks: false,
    only: ["meta"],
    max_price: { prompt: 0.1, completion: 0.2, request: 0, image: 0 },
  });
});
test("paid Gemma pins its route, prices, image input, structured output and output limit", async () => {
  const { provider, calls } = fixture({
    model: GEMMA4_MODEL,
    pricing: { prompt: "0.0000002", completion: "0.0000004" },
    cost: 0.0000006,
  });
  expect(provider.label).toBe("OpenRouter · Gemma 4 31B");
  expect(provider.supportsImages).toBe(true);
  expect(provider.supportsVisualReview).toBe(true);
  expect(provider.supportsWebSearch).toBe(true);
  expect(
    await provider.generate(
      "outline",
      schema,
      "Return data",
      {},
      new AbortController().signal,
      ["data:image/png;base64,AAAA"],
    ),
  ).toEqual({ title: "Structured slide" });
  const request = calls[1].body;
  expect(request.model).toBe(GEMMA4_MODEL);
  expect(request.max_tokens).toBe(16384);
  expect(request.response_format.type).toBe("json_schema");
  expect(request.messages[1].content[1].image_url.url).toBe(
    "data:image/png;base64,AAAA",
  );
  expect(request.provider).toEqual({
    require_parameters: true,
    allow_fallbacks: false,
    max_price: { prompt: 0.2, completion: 0.4, request: 0, image: 0 },
  });
});
test("Gemma rejects price increases, unsupported capabilities and unverified results", async () => {
  const pricing = { prompt: "0.0000002", completion: "0.0000004" };
  for (const options of [
    { pricing: { ...pricing, prompt: "0.00000021" } },
    { pricing: { ...pricing, completion: "0.00000041" } },
    { pricing: { ...pricing, request: "0.001" } },
    { pricing: { ...pricing, input_cache_read: "0.00000021" } },
    { parameters: ["response_format"] },
    { vision: false },
  ]) {
    const { provider, calls } = fixture({
      model: GEMMA4_MODEL,
      pricing,
      ...options,
    });
    await expect(
      provider.generate(
        "outline",
        schema,
        "",
        {},
        new AbortController().signal,
        ["data:image/png;base64,AAAA"],
      ),
    ).rejects.toBeInstanceOf(JobFailure);
    expect(calls.filter((call) => call.body)).toHaveLength(0);
  }
  for (const options of [
    { omitCost: true },
    { cost: 0.01 },
    { responseModel: MUSE_CONTRIBUTOR_MODEL },
    { responseModel: `${GEMMA4_MODEL}:free` },
    { content: '{"title":42}' },
  ]) {
    const { provider } = fixture({ model: GEMMA4_MODEL, pricing, ...options });
    await expect(
      provider.generate(
        "outline",
        schema,
        "",
        {},
        new AbortController().signal,
      ),
    ).rejects.toBeInstanceOf(JobFailure);
  }
});
test("Gemma research checks tool support and enforces the shared search allowance", async () => {
  const options = {
    model: GEMMA4_MODEL,
    pricing: { prompt: "0.0000002", completion: "0.0000004" },
    parameters: ["tools", "structured_outputs"],
    searchCalls: 2,
    cost: 0.0140006,
  };
  const { provider, calls } = fixture(options);
  const research = await provider.research(
    "Public topic",
    "en",
    new AbortController().signal,
  );
  expect(research.status).toBe("unavailable"); // No citation annotations in this fixture.
  expect(calls[1].body.model).toBe(GEMMA4_MODEL);
  expect(calls[1].body.max_tokens).toBe(2000);
  expect(calls[1].body.max_tool_calls).toBe(2);
  expect(calls[1].body.tools[0].type).toBe("openrouter:web_search");
  expect(calls[1].body.stream).toBe(false);
  const unsupported = fixture({
    ...options,
    parameters: ["structured_outputs"],
  });
  await expect(
    unsupported.provider.research(
      "Public topic",
      "en",
      new AbortController().signal,
    ),
  ).rejects.toThrow("tool calling");
  expect(unsupported.calls.filter((call) => call.body)).toHaveLength(0);
  for (const overrides of [{ searchCalls: 3 }, { cost: 0.0141 }]) {
    const invalid = fixture({ ...options, ...overrides });
    await expect(
      invalid.provider.research(
        "Public topic",
        "en",
        new AbortController().signal,
      ),
    ).rejects.toBeInstanceOf(JobFailure);
  }
});
test("Gemma retries stay on the paid Gemma route and exhausted credits stop retries", async () => {
  const options = {
    model: GEMMA4_MODEL,
    pricing: { prompt: "0.0000002", completion: "0.0000004" },
  };
  const { provider, calls } = fixture({
    ...options,
    connectionFailure: "timeout",
  });
  for (let attempt = 0; attempt < 2; attempt++)
    await expect(
      provider.generate(
        "outline",
        schema,
        "",
        {},
        new AbortController().signal,
      ),
    ).rejects.toThrow("same model");
  expect(
    calls.filter((call) => call.body).map((call) => call.body.model),
  ).toEqual([GEMMA4_MODEL, GEMMA4_MODEL]);
  const exhausted = fixture({ ...options, status: 402 });
  const error = await exhausted.provider
    .generate("outline", schema, "", {}, new AbortController().signal)
    .catch((error) => error);
  expect(error).toBeInstanceOf(JobFailure);
  if (!(error instanceof JobFailure))
    throw new Error("Expected exhausted credits");
  expect(error.retryable).toBe(false);
  expect(error.message).toContain("credits");
});
test("Muse opt-in never authorizes another paid model, a price increase, missing usage or model substitution", async () => {
  for (const options of [
    { model: MUSE_CONTRIBUTOR_MODEL },
    { model: "unrelated/paid-model", enableMuse: true },
  ]) {
    const { provider, calls } = fixture(options);
    await expect(
      provider.generate(
        "outline",
        schema,
        "",
        {},
        new AbortController().signal,
      ),
    ).rejects.toThrow("requires a free model");
    expect(calls).toHaveLength(0);
  }
  for (const pricing of [
    { prompt: "0.00000011", completion: "0.0000002" },
    { prompt: "0.0000001", completion: "0.00000021" },
    { prompt: "0.0000001", completion: "0.0000002", request: "0.001" },
    { prompt: "-1", completion: "0.0000002" },
  ]) {
    const { provider, calls } = fixture({
      model: MUSE_CONTRIBUTOR_MODEL,
      enableMuse: true,
      pricing,
    });
    await expect(
      provider.generate(
        "outline",
        schema,
        "",
        {},
        new AbortController().signal,
      ),
    ).rejects.toThrow("pricing could not be verified");
    expect(calls).toHaveLength(1);
  }
  for (const options of [
    { omitCost: true },
    { cost: 0.01 },
    { responseModel: DEFAULT_FREE_MODEL },
  ]) {
    const { provider } = fixture({
      model: MUSE_CONTRIBUTOR_MODEL,
      enableMuse: true,
      pricing: { prompt: "0.0000001", completion: "0.0000002" },
      ...options,
    });
    await expect(
      provider.generate(
        "outline",
        schema,
        "",
        {},
        new AbortController().signal,
      ),
    ).rejects.toBeInstanceOf(JobFailure);
  }
});
test("Muse retries keep the selected model and exhausted credits stop retries", async () => {
  const f = fixture({
    model: MUSE_CONTRIBUTOR_MODEL,
    enableMuse: true,
    pricing: { prompt: "0.0000001", completion: "0.0000002" },
    connectionFailure: "timeout",
  });
  for (let i = 0; i < 2; i++)
    await expect(
      f.provider.generate(
        "outline",
        schema,
        "",
        {},
        new AbortController().signal,
      ),
    ).rejects.toThrow("same model");
  expect(f.calls.filter((c) => c.body).map((c) => c.body.model)).toEqual([
    MUSE_CONTRIBUTOR_MODEL,
    MUSE_CONTRIBUTOR_MODEL,
  ]);
  const { provider } = fixture({
    model: MUSE_CONTRIBUTOR_MODEL,
    enableMuse: true,
    pricing: { prompt: "0.0000001", completion: "0.0000002" },
    status: 402,
  });
  try {
    await provider.generate(
      "outline",
      schema,
      "",
      {},
      new AbortController().signal,
    );
    throw new Error("Expected exhausted credits");
  } catch (error) {
    expect(error).toBeInstanceOf(JobFailure);
    expect((error as JobFailure).retryable).toBe(false);
    expect((error as Error).message).toContain("credits");
  }
});
test("scene composition disables optional reasoning and incomplete streams never become valid results", async () => {
  const { provider, calls } = fixture({ reasoningMandatory: false });
  await provider.generate(
    "creative_scene_batch",
    schema,
    "",
    {},
    new AbortController().signal,
  );
  expect(calls[1].body.reasoning).toEqual({ enabled: false });
  for (const finishReason of ["length", "error"] as const) {
    const { provider } = fixture({ finishReason });
    try {
      await provider.generate(
        "creative_scene_batch",
        schema,
        "",
        {},
        new AbortController().signal,
      );
      throw new Error("Expected incomplete stream rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(JobFailure);
      expect((error as JobFailure).retryable).toBe(finishReason === "error");
    }
  }
});
test("HTTP 200 upstream errors are classified by their embedded status instead of becoming unknown connection errors", async () => {
  for (const status of [401, 429, 502]) {
    const { provider } = fixture({ embeddedError: status });
    try {
      await provider.generate(
        "scene",
        schema,
        "",
        {},
        new AbortController().signal,
      );
      throw new Error("Expected upstream error");
    } catch (error) {
      expect(error).toBeInstanceOf(JobFailure);
      expect((error as JobFailure).retryable).toBe(status !== 401);
    }
  }
});
test("exhausted daily free quota stops retrying and preserves an explicit resume path", async () => {
  const { provider } = fixture({ status: 429, dailyQuota: true });
  try {
    await provider.generate(
      "creative_scene_batch",
      schema,
      "",
      {},
      new AbortController().signal,
    );
    throw new Error("Expected exhausted quota");
  } catch (error) {
    expect(error).toBeInstanceOf(JobFailure);
    expect((error as JobFailure).retryable).toBe(false);
    expect((error as Error).message).toContain(
      "daily free-model request limit",
    );
  }
});
test("SDK timeouts and disconnects are retryable and the next attempt uses a verified free alternative", async () => {
  for (const connectionFailure of ["timeout", "disconnect"] as const) {
    const { provider, calls } = fixture({ connectionFailure });
    let failure: unknown;
    try {
      await provider.generate(
        "outline",
        schema,
        "",
        {},
        new AbortController().signal,
      );
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(JobFailure);
    expect((failure as JobFailure).retryable).toBe(true);
    expect((failure as Error).message).toMatch(/connection|timed out/i);
    expect(
      await provider.generate(
        "outline",
        schema,
        "",
        {},
        new AbortController().signal,
      ),
    ).toEqual({ title: "Structured slide" });
    const posts = calls.filter((call) => call.body);
    expect(posts.map((call) => call.body.model)).toEqual([
      DEFAULT_FREE_MODEL,
      "dots-studio/dots-3-note-preview:free",
    ]);
    expect(posts[1].body.provider.max_price).toEqual({
      prompt: 0,
      completion: 0,
      request: 0,
      image: 0,
    });
  }
});
test("a timeout never permits a paid fallback and HTTP timeouts stay retryable", async () => {
  const { provider, calls } = fixture({
    connectionFailure: "timeout",
    fallbackPricing: { prompt: "0", completion: "0.001" },
  });
  for (let attempt = 0; attempt < 2; attempt++)
    await expect(
      provider.generate(
        "outline",
        schema,
        "",
        {},
        new AbortController().signal,
      ),
    ).rejects.toBeInstanceOf(JobFailure);
  expect(calls.filter((call) => call.body)).toHaveLength(1);
  const f = fixture({ status: 408 });
  try {
    await f.provider.generate(
      "outline",
      schema,
      "",
      {},
      new AbortController().signal,
    );
    throw new Error("Expected timeout");
  } catch (error) {
    expect(error).toBeInstanceOf(JobFailure);
    expect((error as JobFailure).retryable).toBe(true);
  }
});
test("the durable worker recovers a timed-out request with one delayed free-model retry", async () => {
  const store = new Store(":memory:");
  try {
    const user = await store.createUser(
      "Recovery",
      "recovery@example.test",
      "unused-test-hash",
    );
    let now = Date.now();
    const queue = new JobQueue(store, "recovery-test", () => now);
    const { provider } = fixture({ connectionFailure: "timeout" });
    const worker = new JobWorker(queue, async (_job, { signal }) =>
      provider.generate("outline", schema, "", {}, signal),
    );
    const job = await queue.enqueue(user.id, "outline", {}, "timeout-recovery");
    await worker.runOnce();
    const retry = await queue.get(job.id, user.id);
    expect(retry.status).toBe("queued");
    expect(retry.attempts).toBe(1);
    expect(retry.error).toMatch(/timed out/);
    expect(await worker.runOnce()).toBe(false);
    now += 10000;
    await worker.runOnce();
    const recovered = await queue.get(job.id, user.id);
    expect(recovered.status).toBe("succeeded");
    expect(recovered.attempts).toBe(2);
    expect(JSON.parse(recovered.result!)).toEqual({
      title: "Structured slide",
    });
  } finally {
    await store.db.close();
  }
});
test("free-model recovery preserves image capabilities, cancellation and permanent account failures", async () => {
  const imageFixture = fixture({
    connectionFailure: "timeout",
    fallbackVision: false,
  });
  for (let i = 0; i < 2; i++)
    await expect(
      imageFixture.provider.generate(
        "theme",
        schema,
        "",
        {},
        new AbortController().signal,
        ["data:image/png;base64,AAAA"],
      ),
    ).rejects.toBeInstanceOf(JobFailure);
  expect(imageFixture.calls.filter((call) => call.body)).toHaveLength(1);
  for (const status of [401, 402, 403]) {
    const { provider, calls } = fixture({ status });
    for (let i = 0; i < 2; i++) {
      try {
        await provider.generate(
          "outline",
          schema,
          "",
          {},
          new AbortController().signal,
        );
        throw new Error("Expected account failure");
      } catch (error) {
        expect(error).toBeInstanceOf(JobFailure);
        expect((error as JobFailure).retryable).toBe(false);
      }
    }
    expect(
      calls
        .filter((call) => call.body)
        .every((call) => call.body.model === DEFAULT_FREE_MODEL),
    ).toBe(true);
  }
  const { provider } = fixture();
  const controller = new AbortController();
  controller.abort();
  await expect(
    provider.generate("outline", schema, "", {}, controller.signal),
  ).rejects.toThrow("cancelled");
});
test("nonzero, missing, conditional or unsupported pricing/capabilities block inference", async () => {
  for (const options of [
    { pricing: { prompt: "0.01", completion: "0" } },
    { pricing: { prompt: "0", completion: "0", request: "0.001" } },
    { pricing: { prompt: "0", completion: "0", overrides: [] } },
    { pricing: { prompt: "0" } },
    { parameters: ["max_tokens"] },
  ]) {
    const { provider, calls } = fixture(options);
    await expect(
      provider.generate(
        "outline",
        schema,
        "",
        {},
        new AbortController().signal,
      ),
    ).rejects.toBeInstanceOf(JobFailure);
    expect(calls).toHaveLength(1);
  }
  const { provider, calls } = fixture({ vision: false });
  await expect(
    provider.generate("theme", schema, "", {}, new AbortController().signal, [
      "data:image/png;base64,AAAA",
    ]),
  ).rejects.toThrow("cannot accept");
  expect(calls).toHaveLength(1);
});
test("paid model overrides never make a request; malformed output, unexpected reported costs and quota rejection are withheld", async () => {
  const { calls } = fixture();
  const paid = new OpenRouterProvider("synthetic", "a/paid-model", (() => {
    throw new Error("must never request");
  }) as unknown as typeof fetch);
  await expect(
    paid.generate("test", schema, "", {}, new AbortController().signal),
  ).rejects.toThrow("requires a free model");
  expect(calls).toHaveLength(0);
  for (const options of [
    { content: '{"title":5}' },
    { cost: 0.01 },
    { status: 402 },
  ]) {
    const f = fixture(options);
    await expect(
      f.provider.generate("test", schema, "", {}, new AbortController().signal),
    ).rejects.toBeInstanceOf(JobFailure);
  }
});
