import { test, expect } from "bun:test";
import { z } from "zod";
import { TokenRouterProvider } from "../server/ai-provider";
import { JobFailure } from "../server/jobs";
const model = "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
  schema = z.object({ title: z.string() }).strict();
function fixture(
  options: {
    price?: number;
    missing?: boolean;
    priceStatus?: number;
    status?: number;
    content?: string;
    finish?: string;
  } = {},
) {
  const requests: {
    path: string;
    body: any;
    authorization: string | null;
  }[] = [];
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init),
      path = new URL(req.url).pathname,
      body = req.method === "POST" ? await req.json() : null;
    requests.push({
      path,
      body,
      authorization: req.headers.get("authorization"),
    });
    if (path === "/api/pricing")
      return Response.json(
        {
          data: options.missing
            ? []
            : [
                {
                  model_name: model,
                  quota_type: 0,
                  model_ratio: options.price || 0,
                  model_price: 0,
                  completion_ratio: 1,
                },
              ],
        },
        { status: options.priceStatus || 200 },
      );
    if (options.status)
      return Response.json(
        {
          error: {
            message: "synthetic quota failure",
            type: "api_error",
            code: "insufficient_user_quota",
          },
        },
        { status: options.status },
      );
    return Response.json({
      id: "test",
      object: "chat.completion",
      created: 1,
      model,
      choices: [
        {
          index: 0,
          finish_reason: options.finish || "stop",
          message: {
            role: "assistant",
            content: options.content ?? '{"title":"Editable data"}',
          },
        },
      ],
    });
  }) as typeof fetch;
  return {
    requests,
    provider: new TokenRouterProvider(
      "synthetic-test-key",
      model,
      "https://api.tokenrouter.com/v1",
      fetcher,
    ),
  };
}
test("Token Router verifies zero billing before each inference and validates structured content", async () => {
  const { provider, requests } = fixture();
  for (let i = 0; i < 2; i++)
    expect(
      await provider.generate(
        "test",
        schema,
        "Return editable data",
        {},
        new AbortController().signal,
      ),
    ).toEqual({ title: "Editable data" });
  expect(requests.map((r) => r.path)).toEqual([
    "/api/pricing",
    "/v1/chat/completions",
    "/api/pricing",
    "/v1/chat/completions",
  ]);
  expect(
    requests
      .filter((r) => r.path === "/api/pricing")
      .every((r) => r.authorization === null),
  ).toBe(true);
  expect(
    requests.filter((r) => r.body).every((r) => r.body.model === model),
  ).toBe(true);
  expect(requests[1].body.messages[0].content).toContain(
    "additionalProperties",
  );
});
test("changed, missing or unavailable free-model pricing sends no inference request", async () => {
  for (const options of [
    { price: 0.1 },
    { missing: true },
    { priceStatus: 503 },
  ]) {
    const { provider, requests } = fixture(options);
    await expect(
      provider.generate("test", schema, "", {}, new AbortController().signal),
    ).rejects.toBeInstanceOf(JobFailure);
    expect(requests).toHaveLength(1);
  }
});
test("quota denial is actionable and nonretryable; invalid or truncated AI output never passes validation", async () => {
  const { provider } = fixture({ status: 403 });
  try {
    await provider.generate(
      "test",
      schema,
      "",
      {},
      new AbortController().signal,
    );
    throw new Error("expected rejection");
  } catch (error) {
    expect(error).toBeInstanceOf(JobFailure);
    expect((error as JobFailure).retryable).toBe(false);
    expect((error as Error).message).toContain("no available credit quota");
    expect((error as Error).message).not.toContain("synthetic-test-key");
  }
  for (const options of [
    { content: '{"title":4}' },
    { content: "<script>bad</script>" },
    { finish: "length" },
  ]) {
    const fixtureData = fixture(options);
    await expect(
      fixtureData.provider.generate(
        "test",
        schema,
        "",
        {},
        new AbortController().signal,
      ),
    ).rejects.toBeInstanceOf(JobFailure);
  }
});
test("unverified image input and incorrect router endpoint fail before sending user content", async () => {
  const { provider, requests } = fixture();
  await expect(
    provider.generate("test", schema, "", {}, new AbortController().signal, [
      "data:image/png;base64,AAAA",
    ]),
  ).rejects.toThrow("image inputs");
  expect(requests).toHaveLength(0);
  expect(
    () =>
      new TokenRouterProvider(
        "synthetic",
        model,
        "https://other-router.test/v1",
      ),
  ).toThrow("verified");
});
