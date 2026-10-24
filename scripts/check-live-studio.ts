// Explicit live-provider acceptance; never included in deterministic tests.
import { chromium } from "playwright";
const origin = process.env.FRAME_LIVE_CHECK_ORIGIN || "http://127.0.0.1:5191";
if (
  process.env.NODE_ENV === "production" ||
  new URL(origin).hostname !== "127.0.0.1"
)
  throw new Error("This check requires the explicit loopback live-AI harness.");
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
try {
  await page.goto(origin);
  const provider = await page.evaluate(async () =>
    (await fetch("/api/auth/provider")).json(),
  );
  if (!provider.liveAI) throw new Error("Start dev:fixture --live-ai first.");
  await page
    .getByLabel("Email address", { exact: true })
    .fill("ai-check@example.test");
  await page.getByRole("button", { name: "Open local workspace" }).click();
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page
    .getByLabel("Presentation idea", { exact: true })
    .fill(
      "Illustrative workshop plan: welcome participants, practice giving useful feedback, and choose one next step. Suggestions only; no statistics or external factual claims.",
    );
  await page
    .getByRole("slider", { name: "Slide count", exact: true })
    .press("Home");
  await page
    .getByRole("button", { name: "Choose a look", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Choose Rage theme", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Use this look", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Continue without sources", exact: true })
    .click();
  await page
    .getByLabel("Section 1 title", { exact: true })
    .waitFor({ timeout: 180000 });
  console.log(JSON.stringify({ stage: "outline", ok: true }));
  await page
    .getByRole("button", { name: "Generate slide preview", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Create editable presentation", exact: true })
    .waitFor({ timeout: 600000 });
  if ((await page.locator(".generated-slide-card").count()) !== 3)
    throw new Error("Expected three generated previews.");
  await page.screenshot({ path: "/tmp/frame-muse-studio-preview.png" });
  await page
    .getByRole("button", { name: "Create editable presentation", exact: true })
    .click();
  await page.waitForURL("**/deck/**");
  const deckId = new URL(page.url()).pathname.split("/").pop();
  await page.reload();
  await page.locator(".editable-stage").waitFor();
  const doc = await page.evaluate(
    async (id) => (await fetch(`/api/decks/${id}`)).json(),
    deckId,
  );
  if (
    doc.slides.length !== 3 ||
    doc.slides.some((s: any) => !s.elements.some((e: any) => e.type === "text"))
  )
    throw new Error("Saved output did not retain editable native text.");
  console.log(
    JSON.stringify({
      ok: true,
      url: page.url(),
      slides: doc.slides.length,
      elements: doc.slides.map((s: any) => s.elements.length),
      revision: doc.revision,
    }),
  );
} catch (error) {
  const jobs = await page
    .evaluate(async () => {
      const r = await fetch("/api/jobs");
      const data = await r.json();
      return (Array.isArray(data) ? data : data.items || []).map((j: any) => ({
        kind: j.kind,
        status: j.status,
        error: j.error,
        progress: j.progress,
      }));
    })
    .catch(() => []);
  console.error(
    JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : "Check failed",
      jobs,
    }),
  );
  await page
    .screenshot({ path: "/tmp/frame-muse-studio-failure.png" })
    .catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
}
