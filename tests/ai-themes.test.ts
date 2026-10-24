import { afterEach, expect, test } from "bun:test";
import { zodTextFormat } from "openai/helpers/zod";
import sharp from "sharp";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "./mongo";
import { createApp } from "./support/legacy-app";
import { createAIServices } from "../server/creation";
import { FixtureAIProvider } from "./fixtures/ai-provider";
import type { AIProvider } from "../server/ai-provider";
import { THEMES } from "../shared/themes";
import { uid, type User, type Theme } from "../shared/schema";
import { aiThemeResponseSchema } from "../shared/ai-themes";
import { contrastIssues } from "../shared/design-library";
const stores: Store[] = [];
afterEach(async () => {
  for (const s of stores.splice(0)) await s.db.close();
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
  const response = await app.request(
    "/api/auth/signup",
    req("POST", "", {
      name: "Theme author",
      email: `${uid()}@example.test`,
      password: "theme-author-test-passphrase",
    }),
  );
  const { user } = (await response.json()) as {
    user: User;
  };
  return {
    store,
    services,
    app,
    user,
    cookie: response.headers.get("set-cookie")!.split(";")[0],
  };
}
test("AI theme generation is a validated separate preview; refinement retains brand rules and saving is explicit", async () => {
  const { app, services, cookie } = await setup(),
    baseTheme = { ...THEMES[0], brandRules: "Use lime only as an accent." };
  const start = await app.request(
    "/api/theme-jobs",
    req("POST", cookie, {
      prompt: "A midnight stage with lime accents",
      baseTheme,
      referenceAssetId: null,
      key: uid(),
    }),
  );
  expect(start.status).toBe(202);
  const job = await start.json();
  await services.worker.runOnce();
  const result = await (
    await app.request(`/api/jobs/${job.id}`, req("GET", cookie))
  ).json();
  expect(result.status).toBe("succeeded");
  expect(result.result.theme.brandRules).toBe(baseTheme.brandRules);
  expect(contrastIssues(result.result.theme.colors)).toEqual([]);
  expect(
    await (await app.request("/api/themes", req("GET", cookie))).json(),
  ).toEqual([]);
  const refine = await (
    await app.request(
      "/api/theme-jobs",
      req("POST", cookie, {
        prompt: "Make the corners more rounded.",
        baseTheme: result.result.theme,
        referenceAssetId: null,
        key: uid(),
      }),
    )
  ).json();
  await services.worker.runOnce();
  const refined = await (
    await app.request(`/api/jobs/${refine.id}`, req("GET", cookie))
  ).json();
  expect(refined.result.theme.radius).toBe(36);
  expect(refined.result.theme.id).not.toBe(result.result.theme.id);
  expect(
    (
      await app.request(
        "/api/themes",
        req("POST", cookie, { theme: refined.result.theme }),
      )
    ).status,
  ).toBe(201);
});
test("theme contrast repair is reported and strict output omits untrusted executable style fields", async () => {
  const provider: AIProvider = new FixtureAIProvider(),
    original = provider.generate.bind(provider);
  provider.generate = async (...args) => {
    const value = (await original(...args)) as Omit<Theme, "id">;
    return {
      ...value,
      colors: {
        ...value.colors,
        background: "#777777",
        foreground: "#777777",
        accent: "#777777",
      },
      arbitraryCSS: "body{display:none}",
    };
  };
  const { app, services, cookie } = await setup(provider),
    job = await (
      await app.request(
        "/api/theme-jobs",
        req("POST", cookie, {
          prompt: "A soft gray design",
          baseTheme: null,
          referenceAssetId: null,
          key: uid(),
        }),
      )
    ).json();
  await services.worker.runOnce();
  const result = await (
    await app.request(`/api/jobs/${job.id}`, req("GET", cookie))
  ).json();
  expect(result.status).toBe("succeeded");
  expect(result.result.warnings[0]).toContain("Adjusted");
  expect(contrastIssues(result.result.theme.colors)).toEqual([]);
  expect(result.result.theme.arbitraryCSS).toBeUndefined();
  const format = zodTextFormat(aiThemeResponseSchema, "theme");
  expect(format.strict).toBe(true);
  expect(format.schema.required).toContain("typeScale");
});
test("owned image references are passed as image inputs, foreign references and viewer writes are denied", async () => {
  const root = mkdtempSync(join(tmpdir(), "frame-theme-image-")),
    previousRoot = process.env.FRAME_ASSETS;
  process.env.FRAME_ASSETS = root;
  try {
    const provider: AIProvider = new FixtureAIProvider(),
      original = provider.generate.bind(provider);
    let images: string[] | undefined;
    provider.generate = async (...args) => {
      images = args[5];
      return original(...args);
    };
    const { app, services, store, user, cookie } = await setup(provider);
    const bytes = await sharp({
      create: { width: 40, height: 30, channels: 3, background: "#2347dd" },
    })
      .png()
      .toBuffer();
    const form = new FormData();
    form.set("file", new File([bytes], "reference.png", { type: "image/png" }));
    const uploaded = await (
      await app.request("/api/assets", {
        method: "POST",
        headers: { cookie },
        body: form,
      })
    ).json();
    const start = await (
      await app.request(
        "/api/theme-jobs",
        req("POST", cookie, {
          prompt: "Use the colors in this image.",
          baseTheme: null,
          referenceAssetId: uploaded.id,
          key: uid(),
        }),
      )
    ).json();
    await services.worker.runOnce();
    expect((await services.queue.get(start.id, user.id)).status).toBe(
      "succeeded",
    );
    expect(images?.[0]).toStartWith("data:image/webp;base64,");
    expect(
      (
        await app.request(
          "/api/theme-jobs",
          req("POST", cookie, {
            prompt: "A foreign reference",
            baseTheme: null,
            referenceAssetId: "not-owned",
            key: uid(),
          }),
        )
      ).status,
    ).toBe(404);
    await store.db.update("members",{userId:user.id},{$set:{role:"viewer"}});
    expect(
      (
        await app.request(
          "/api/theme-jobs",
          req("POST", cookie, {
            prompt: "A forbidden write",
            baseTheme: null,
            referenceAssetId: null,
            key: uid(),
          }),
        )
      ).status,
    ).toBe(403);
  } finally {
    if (previousRoot === undefined) delete process.env.FRAME_ASSETS;
    else process.env.FRAME_ASSETS = previousRoot;
    rmSync(root, { recursive: true, force: true });
  }
});
