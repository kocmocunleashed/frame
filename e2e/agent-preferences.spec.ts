import { test, expect, type Page } from "@playwright/test";
import { checkA11y } from "./helpers";

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.context().addCookies([
    {
      name: "frame_admin_fixture",
      value: "admin",
      url: "http://127.0.0.1:5183",
    },
  ]);
});

async function openSettings(page: Page) {
  await page.goto("/e2e/agent.fixture.html");
  await page.locator(".profile-button").click();
  await page.getByRole("button", { name: "AI settings", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Your account" }),
  ).toBeVisible();
  await expect(page.getByRole("tab", { name: "AI settings" })).toHaveAttribute("aria-selected", "true");
}

test("account settings persist agent.md and language and seed new presentations", async ({
  page,
}) => {
  await openSettings(page);
  await page.getByLabel("Presentation language").fill("Mongolian");
  const markdown = "# My agent\nUse concrete examples and short speaker notes.";
  await page.getByLabel("Import agent.md", { exact: true }).setInputFiles({
    name: "agent.md",
    mimeType: "text/markdown",
    buffer: Buffer.from(markdown),
  });
  await expect(page.getByLabel("agent.md instructions")).toHaveValue(markdown);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download agent.md" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("agent.md");
  const stream = await file.createReadStream();
  const chunks = [];
  for await (const chunk of stream!) chunks.push(chunk);
  expect(Buffer.concat(chunks).toString()).toBe(markdown);
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Settings saved." }),
  ).toBeVisible();
  await openSettings(page);
  await expect(page.getByLabel("Presentation language")).toHaveValue(
    "Mongolian",
  );
  await expect(page.getByLabel("agent.md instructions")).toHaveValue(markdown);
  await page.screenshot({
    path: "/tmp/frame-settings-agent-desktop.png",
    fullPage: true,
  });
  await checkA11y(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("button", { name: "Save changes" }),
  ).toBeInViewport();
  await page.screenshot({
    path: "/tmp/frame-settings-agent-mobile.png",
    fullPage: true,
  });
  expect(
    await page
      .getByRole("dialog")
      .evaluate((node) => node.scrollWidth <= node.clientWidth),
  ).toBe(true);
  await checkA11y(page);
  const response = await page.request.post("/api/creation");
  expect(response.status()).toBe(201);
  const draft = await response.json();
  expect(draft.data.brief.language).toBe("Mongolian");
  expect(draft.data.brief.agentMarkdown).toBe(markdown);
  await page.goto(`/e2e/agent.fixture.html?draft=${draft.id}`);
  await expect(page.getByLabel("Presentation idea")).toBeVisible();
  await expect(page.getByLabel("Presentation language")).toHaveCount(0);
  await expect(page.getByLabel("agent.md instructions")).toHaveCount(0);
});

test("failed saves preserve changes and allow retry", async ({ page }) => {
  await openSettings(page);
  await page.getByLabel("agent.md instructions").fill("Keep my instructions.");
  await page.route("**/api/ai/preferences", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Please retry." }),
    }),
  );
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Could not save your settings",
  );
  await expect(page.getByLabel("agent.md instructions")).toHaveValue(
    "Keep my instructions.",
  );
  await page.unroute("**/api/ai/preferences");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Settings saved." }),
  ).toBeVisible();
});

test("failed loads cannot overwrite preferences; profile and keyboard navigation work", async ({
  page,
}) => {
  await page.route("**/api/ai/preferences", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Try again." }),
    }),
  );
  await openSettings(page);
  await expect(page.getByRole("alert")).toContainText(
    "Could not load your AI settings",
  );
  await expect(
    page.getByRole("button", { name: "Save changes" }),
  ).toBeDisabled();
  await page.unroute("**/api/ai/preferences");
  await page.getByRole("button", { name: "Retry loading settings" }).click();
  await expect(page.getByLabel("Presentation language")).toBeVisible();
  await page.getByLabel("Presentation language").fill("");
  await expect(
    page.getByRole("button", { name: "Save changes" }),
  ).toBeDisabled();
  await page.getByRole("tab", { name: "AI settings" }).focus();
  await page.keyboard.press("ArrowLeft");
  await expect(
    page.getByRole("tab", { name: "Profile & security" }),
  ).toBeFocused();
  // The erxes account still routes security to its host, without Clerk.
  await expect(page.getByRole("link", { name: "Manage your erxes account" })).toBeVisible();
  await page.getByLabel("Your name", { exact: true }).fill("Settings tester");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Settings saved." }),
  ).toBeVisible();
  expect((await (await page.request.get("/api/me")).json()).user.name).toBe(
    "Settings tester",
  );
});
