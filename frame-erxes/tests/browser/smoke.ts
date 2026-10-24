import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { serveStatic } from "hono/bun";
import { studioResponse } from "../../../server/studio-response";
import { Store } from "../../../tests/mongo";
import { createApp } from "../../../server/app";
import { createAIServices } from "../../../server/creation";
import { FixtureAIProvider } from "../../../tests/fixtures/ai-provider";
import { createFrameLaunch } from "../../backend/plugins/frame_api/src/ticket";

const directory = fileURLToPath(new URL(".", import.meta.url));
const root = resolve(directory, "../../..");
process.chdir(root);
assert(
  await Bun.file("dist/index.html").exists(),
  "Run bun run build from Frame first.",
);
const preview = process.argv.includes("--serve");
const temporary = preview
  ? join(root, ".frame-data", "erxes-preview")
  : await mkdtemp(join(tmpdir(), "frame-erxes-smoke-"));
await mkdir(temporary, { recursive: true });
const framePort = Number(process.env.FRAME_ERXES_TEST_FRAME_PORT || 41358);
const hostPort = Number(process.env.FRAME_ERXES_TEST_HOST_PORT || 41359);
const frameOrigin = `http://127.0.0.1:${framePort}`;
const erxesOrigin = `http://127.0.0.1:${hostPort}`;
const secret = "browser-fixture-only-secret-at-least-32-bytes";
for (const key of [
  "DATABASE_URL",
  "VERCEL",
  "BLOB_READ_WRITE_TOKEN",
  "CLERK_SECRET_KEY",
  "CLERK_JWT_KEY",
  "OPENAI_API_KEY",
  "OPENROUTER_API_KEY",
  "TOKENROUTER_API_KEY",
  "FRAME_AI_PROVIDER",
  "FRAME_ADMIN_USER_IDS",
])
  delete process.env[key];
Object.assign(process.env, {
  APP_ORIGIN: frameOrigin,
  FRAME_ERXES_ORIGIN: erxesOrigin,
  FRAME_ERXES_TENANT: "school",
  FRAME_ERXES_SECRET: secret,
  FRAME_STORAGE: "local",
  FRAME_ASSETS: join(temporary, "assets"),
  FRAME_EXPORTS: join(temporary, "exports"),
});
const bundle = await Bun.build({
  entrypoints: [join(directory, "host.tsx")],
  target: "browser",
  plugins: [
    {
      name: "test-host-capabilities",
      setup(build) {
        build.onResolve({ filter: /^erxes-ui$/ }, () => ({
          path: join(directory, "host-ui.tsx"),
        }));
        build.onResolve({ filter: /^@apollo\/client$/ }, () => ({
          path: join(directory, "host-apollo.ts"),
        }));
      },
    },
  ],
});
assert(bundle.success, bundle.logs.map(String).join("\n"));
const store = new Store();
await store.testReady;
const services = createAIServices(store, new FixtureAIProvider());
const app = createApp(store, services);
app.use("/assets/*", serveStatic({ root: "./dist" }));
app.get("*", (c) => studioResponse(c.req.raw));
const frame = Bun.serve({
  port: framePort,
  hostname: "127.0.0.1",
  fetch: app.fetch,
});
let launchRequests = 0;
const host = Bun.serve({
  port: hostPort,
  hostname: "127.0.0.1",
  async fetch(request) {
    const path = new URL(request.url).pathname;
    if (path === "/host.js")
      return new Response(bundle.outputs[0], {
        headers: { "Content-Type": "text/javascript" },
      });
    if (path === "/test/launch" && request.method === "POST") {
      launchRequests += 1;
      // Optional local native plugin. This emulates the gateway's trusted
      // identity header; it does not test gateway authentication itself.
      if (process.env.FRAME_ERXES_TEST_API) {
        const response = await fetch(process.env.FRAME_ERXES_TEST_API, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "nginx-hostname": "school.example.test",
            user: Buffer.from(
              JSON.stringify({
                _id: "teacher-browser-test",
                email: "teacher-browser@example.test",
                details: { fullName: "Test Teacher" },
                isOwner: true,
              }),
            ).toString("base64"),
          },
          body: JSON.stringify({
            query:
              "mutation FrameBrowserValidationLaunch { frameLaunch { url origin ticket expiresAt } }",
          }),
        });
        const result = (await response.json()) as {
          data?: { frameLaunch?: unknown };
          errors?: { message: string }[];
        };
        assert(
          response.ok && result.data?.frameLaunch,
          JSON.stringify(result.errors),
        );
        return Response.json(result.data.frameLaunch);
      }
      return Response.json(
        createFrameLaunch({ frameOrigin, erxesOrigin, secret }, "school", {
          id: "teacher-browser-test",
          email: "teacher-browser@example.test",
          name: "Test Teacher",
        }),
      );
    }
    return new Response(
      `<!doctype html><html><head><title>Frame erxes integration preview</title>
      <style>body{margin:0;font-family:system-ui}header{padding:12px;display:flex;gap:12px;align-items:center;border-bottom:1px solid #bbb}header strong{margin-right:auto}button{padding:10px 16px;cursor:pointer}#root{height:100vh}iframe{width:100%;height:calc(100vh - 64px);border:0}</style>
      </head><body>${preview ? '<aside style="padding:8px 12px;background:#ffdf00;color:#111">Local integration preview · simulated erxes host and login · fixture AI</aside>' : ""}<div id="root"></div><script type="module" src="/host.js"></script></body></html>`,
      { headers: { "Content-Type": "text/html" } },
    );
  },
});
if (preview) {
  services.worker.start();
  console.log(`Frame erxes preview: ${erxesOrigin}
Frame opens automatically. This is a simulated erxes host, not the erxes dashboard.
AI uses fixtures. This isolated preview database is discarded when the launcher exits.
Plugin source changes restart the server; refresh the browser afterward.
For Frame frontend changes, restart bun run dev to rebuild.
Press Ctrl+C to stop.`);
  await new Promise<void>((done) => {
    process.once("SIGINT", done);
    process.once("SIGTERM", done);
  });
  frame.stop(true);
  host.stop(true);
  await services.worker.stop();
  await store.db.close();
  process.exit(0);
}
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || chromium.executablePath(),
    headless: true,
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const failures: string[] = [];
  page.on("pageerror", (error) => failures.push(error.message));
  await page.goto(erxesOrigin);
  await page.waitForLoadState("networkidle");
  const studio = page.frameLocator('iframe[title="Frame studio"]');
  await studio
    .getByRole("button", { name: /create|new/i })
    .first()
    .waitFor({ timeout: 20000 });
  assert.equal(
    launchRequests,
    1,
    "Automatic launch must request only one ticket, including under StrictMode.",
  );
  assert.equal(
    await page.getByText("Connecting to your Frame workspace…").count(),
    0,
  );
  const frameContext = page
    .frames()
    .find((item) => item.url().startsWith(frameOrigin));
  assert(frameContext, "Frame iframe did not navigate to the actual service.");
  const user = await frameContext.evaluate(async () => {
    const res = await fetch("/api/me");
    return res.json();
  });
  assert.equal(user.user.email, "teacher-browser@example.test");
  const deck = await frameContext.evaluate(async () => {
    const res = await fetch("/api/decks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Erxes lesson smoke", template: "lesson" }),
    });
    if (!res.ok) throw new Error(`Create failed: ${res.status}`);
    return res.json();
  });
  await frameContext.goto(`${frameOrigin}/deck/${deck.id}`);
  await frameContext.waitForLoadState("networkidle");
  await page.screenshot({
    path: join(temporary, "editor.png"),
    fullPage: true,
  });
  // A real editor control proves the full app loaded rather than a JSON-only viewer.
  await studio.getByRole("button", { name: "Present", exact: true }).waitFor();
  await studio.getByRole("button", { name: "Export", exact: true }).waitFor();
  await studio
    .getByRole("textbox", { name: "Presentation title", exact: true })
    .fill("Saved from erxes");
  await studio
    .getByRole("textbox", { name: "Presentation title", exact: true })
    .press("Tab");
  await studio.getByRole("button", { name: /all changes saved/i }).waitFor();
  await frameContext.goto(frameContext.url());
  await frameContext.waitForLoadState("networkidle");
  assert.equal(
    await studio
      .getByRole("textbox", { name: "Presentation title", exact: true })
      .inputValue(),
    "Saved from erxes",
  );
  const popupPromise = page.waitForEvent("popup");
  await page
    .getByRole("button", { name: "Open in new tab", exact: true })
    .click();
  const popup = await popupPromise;
  await popup.waitForURL(`${frameOrigin}/`, { timeout: 20000 });
  await popup.waitForLoadState("networkidle");
  const popupUser = await popup.evaluate(async () =>
    (await fetch("/api/me")).json(),
  );
  assert.equal(popupUser.user.id, user.user.id);
  assert.equal(await popup.evaluate(() => window.opener === null), true);
  assert.equal(
    launchRequests,
    2,
    "The new tab must request its own fresh ticket.",
  );

  await page.reload();
  await studio
    .getByRole("button", { name: /create|new/i })
    .first()
    .waitFor({ timeout: 20000 });
  assert.equal(
    launchRequests,
    3,
    "Re-entering the plugin must automatically launch once again.",
  );

  const retryPage = await browser.newPage();
  retryPage.on("pageerror", (error) => failures.push(error.message));
  let retryAttempts = 0;
  await retryPage.route("**/test/launch", async (route) => {
    retryAttempts += 1;
    if (retryAttempts === 1)
      await route.fulfill({ status: 503, body: "Unavailable" });
    else await route.continue();
  });
  await retryPage.goto(erxesOrigin);
  await retryPage
    .getByRole("alert")
    .filter({ hasText: "Fixture launch denied." })
    .waitFor();
  assert.equal(retryAttempts, 1, "A failed launch must wait for user retry.");
  await retryPage.getByRole("button", { name: "Retry", exact: true }).click();
  await retryPage
    .frameLocator('iframe[title="Frame studio"]')
    .getByRole("button", { name: /create|new/i })
    .first()
    .waitFor({ timeout: 20000 });
  assert.equal(retryAttempts, 2);
  assert.deepEqual(failures, []);
  console.log(
    `PASS: automatic launch once under StrictMode → iframe SSO → edit/save/reload → fresh-ticket new-tab SSO → automatic relaunch → failed launch and retry. Screenshot: ${temporary}/editor.png`,
  );
} finally {
  await browser?.close();
  frame.stop(true);
  host.stop(true);
  await services.worker.stop();
  await store.db.close();
  // Keep the screenshot for inspection; remove only disposable media/export files.
  await rm(join(temporary, "assets"), { recursive: true, force: true });
  await rm(join(temporary, "exports"), { recursive: true, force: true });
}
