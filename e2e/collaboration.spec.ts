import { test, expect, type Page } from "@playwright/test";
import sharp from "sharp";
import { signup, newBlank, checkA11y } from "./helpers";
async function signupAs(page: Page, name: string) {
  const response=await page.request.post('/api/auth/signup',{data:{name,email:`sharing-${crypto.randomUUID()}@example.test`}});expect(response.ok()).toBe(true);await page.goto('/');
  await expect(page.getByRole('heading',{name:'What’s your next big idea?'})).toBeVisible();
  return (await (await page.request.get("/api/me")).json()).user;
}
async function openPeople(page: Page) {
  await page
    .getByRole("button", { name: "Share with people", exact: true })
    .click();
  return page.getByRole("dialog", { name: "Share with people", exact: true });
}
async function openComments(page: Page) {
  await page
    .getByRole("button", { name: "Comments & review", exact: true })
    .click();
  return page.getByRole("dialog", { name: "Comments & review", exact: true });
}
async function saved(page: Page) {
  await expect(
    page.getByText("All changes saved", { exact: true }),
  ).toBeVisible();
}
test("owner shares a protected review, receives a comment, upgrades an editor, preserves a conflict copy and revokes access", async ({
  page,
  browser,
}) => {
  test.setTimeout(120000);
  await signup(page);
  await newBlank(page);
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await page
    .getByLabel("Content", { exact: true })
    .fill("A story worth reviewing.");
  await page.getByLabel("Content", { exact: true }).press("Tab");
  await page
    .getByLabel("Speaker notes", { exact: true })
    .fill("PRIVATE_COLLAB_SPEAKER_NOTES");
  await page.getByLabel("Speaker notes", { exact: true }).press("Tab");
  await saved(page);
  const deckId = new URL(page.url()).pathname.split("/").at(-1)!;
  const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
    }),
    reviewer = await context.newPage();
  try {
    const user = await signupAs(reviewer, "Ari reviewer");
    let people = await openPeople(page);
    await people.getByLabel("Sharing email", { exact: true }).fill(user.email);
    await people
      .getByRole("button", { name: "Add person", exact: true })
      .click();
    await expect(
      people.getByLabel(`Permission for ${user.email}`, { exact: true }),
    ).toHaveValue("viewer");
    const url = await people
      .getByLabel("Private review link", { exact: true })
      .inputValue();
    await checkA11y(page);
    await page.screenshot({ path: "/tmp/frame-people-sharing.png" });
    await people
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    await reviewer.goto(url);
    await expect(
      reviewer.getByText(/Read-only review · Revision/),
    ).toBeVisible();
    await expect(
      reviewer.getByRole("link", { name: "Open editor", exact: true }),
    ).toHaveCount(0);
    expect(
      JSON.stringify(
        await (
          await reviewer.request.get(`/api/decks/${deckId}/review`)
        ).json(),
      ),
    ).not.toContain("PRIVATE_COLLAB");
    expect((await reviewer.request.get(`/api/decks/${deckId}`)).status()).toBe(
      403,
    );
    await expect(page.locator(".presence-badge")).toContainText(
      "Ari reviewer",
      { timeout: 15000 },
    );
    let comments = await openComments(reviewer);
    await comments
      .getByLabel("Your comment", { exact: true })
      .fill(
        "Could this idea use a concrete example? <script>window.shouldNotRun=true</script>",
      );
    await comments
      .getByRole("button", { name: "Post comment", exact: true })
      .click();
    await expect(comments.locator(".review-comment")).toContainText(
      "Could this idea",
    );
    expect(
      await reviewer.evaluate(() => Reflect.get(window, "shouldNotRun")),
    ).toBeUndefined();
    await checkA11y(reviewer);
    await comments
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    const ownerComments = await openComments(page);
    await expect(ownerComments.locator(".review-comment")).toContainText(
      "Ari reviewer",
    );
    await ownerComments
      .getByRole("button", { name: "Resolve", exact: true })
      .click();
    await expect(ownerComments.locator(".review-comment")).toHaveCount(0);
    await ownerComments
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    comments = await openComments(reviewer);
    await comments
      .getByRole("checkbox", { name: "Show resolved", exact: true })
      .check();
    await expect(comments.getByText("Resolved", { exact: true })).toBeVisible();
    await comments
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    people = await openPeople(page);
    await people
      .getByLabel(`Permission for ${user.email}`, { exact: true })
      .selectOption("editor");
    await expect(
      people.getByLabel(`Permission for ${user.email}`, { exact: true }),
    ).toHaveValue("editor");
    await people
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    await reviewer.reload();
    await reviewer
      .getByRole("link", { name: "Open editor", exact: true })
      .click();
    await expect(
      reviewer.getByLabel("Presentation title", { exact: true }),
    ).toBeVisible();
    await expect(
      reviewer.getByRole("button", { name: "Publish & share", exact: true }),
    ).toBeDisabled();
    const image = await sharp({
      create: { width: 180, height: 120, channels: 3, background: "#ed592f" },
    })
      .png()
      .toBuffer();
    await reviewer.locator("input[type=file]").first().setInputFiles({
      name: "reviewer-image.png",
      mimeType: "image/png",
      buffer: image,
    });
    await expect(reviewer.locator('.editable-stage img')).toBeVisible();
    await saved(reviewer);
    const shared = await (
        await reviewer.request.get(`/api/decks/${deckId}`)
      ).json(),
      asset = shared.slides[0].elements.find(
        (e: { type: string }) => e.type === "image",
      );
    expect((await page.request.get(asset.src)).status()).toBe(200);
    await page.reload();
    await saved(page);
    await reviewer.reload();
    await saved(reviewer);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    let started!: () => void;
    const pending = new Promise<void>((resolve) => (started = resolve));
    await reviewer.route(`**/api/decks/${deckId}`, async (route) => {
      if (route.request().method() === "PUT") {
        started();
        await gate;
      }
      await route.continue();
    });
    await reviewer.getByRole("button", { name: "Text", exact: true }).click();
    await reviewer
      .getByLabel("Content", { exact: true })
      .fill("Ari’s unsaved local improvement.");
    await reviewer.getByLabel("Content", { exact: true }).press("Tab");
    await pending;
    await page
      .getByLabel("Speaker notes", { exact: true })
      .fill("PRIVATE_COLLAB_OWNER_NEW_REVISION");
    await page.getByLabel("Speaker notes", { exact: true }).press("Tab");
    await saved(page);
    release();
    await expect(
      reviewer.getByText("Version conflict", { exact: true }),
    ).toBeVisible();
    await expect(reviewer.locator(".editable-stage")).toContainText(
      "Ari’s unsaved local improvement.",
    );
    expect(
      JSON.stringify(
        await (await page.request.get(`/api/decks/${deckId}`)).json(),
      ),
    ).not.toContain("Ari’s unsaved local improvement.");
    await reviewer.unroute(`**/api/decks/${deckId}`);
    await reviewer
      .getByRole("button", { name: "Save my version as a copy", exact: true })
      .click();
    await expect(
      reviewer.getByLabel("Presentation title", { exact: true }),
    ).toHaveValue("My verified presentation — recovered");
    const copyId = new URL(reviewer.url()).pathname.split("/").at(-1)!,
      copy = await (await reviewer.request.get(`/api/decks/${copyId}`)).json();
    expect(copy.ownerId).toBe(user.id);
    expect(
      copy.slides[0].elements.find((e: { type: string }) => e.type === "image")
        .src,
    ).not.toBe(asset.src);
    people = await openPeople(page);
    await people
      .getByRole("button", {
        name: `Remove access for ${user.email}`,
        exact: true,
      })
      .click();
    await expect(
      people.getByText("No direct access has been granted.", { exact: true }),
    ).toBeVisible();
    expect(
      (await reviewer.request.get(`/api/decks/${deckId}/review`)).status(),
    ).toBe(404);
    expect(
      (
        await reviewer.request.get(
          copy.slides[0].elements.find(
            (e: { type: string }) => e.type === "image",
          ).src,
        )
      ).status(),
    ).toBe(200);
    await reviewer.goto(url);
    await expect(
      reviewer.getByRole("heading", {
        name: "This presentation isn’t available.",
        exact: true,
      }),
    ).toBeVisible();
    await page.screenshot({
      path: "/tmp/frame-collaboration-after-review.png",
    });
  } finally {
    await context.close();
  }
});
test("sharing failures retain fields, comment drafts recover, viewer links redirect safely and narrow layouts remain usable", async ({
  page,
  browser,
}) => {
  test.setTimeout(90000);
  await signup(page);
  await newBlank(page);
  const id = new URL(page.url()).pathname.split("/").at(-1)!;
  const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
    }),
    viewer = await context.newPage();
  try {
    const user = await signupAs(viewer, "Mobile reviewer");
    const people = await openPeople(page);
    await people
      .getByLabel("Sharing email", { exact: true })
      .fill(`missing-${crypto.randomUUID()}@example.test`);
    await people
      .getByRole("button", { name: "Add person", exact: true })
      .click();
    await expect(people.getByRole("alert")).toContainText("not registered");
    await expect(
      people.getByLabel("Sharing email", { exact: true }),
    ).not.toHaveValue("");
    await people.getByLabel("Sharing email", { exact: true }).fill(user.email);
    await people
      .getByRole("button", { name: "Add person", exact: true })
      .click();
    await expect(
      people.getByLabel(`Permission for ${user.email}`, { exact: true }),
    ).toHaveValue("viewer");
    await people
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    await viewer.goto(`/deck/${id}`);
    await expect(viewer).toHaveURL(new RegExp(`/review/${id}$`));
    await expect(viewer.getByText(/Read-only review/)).toBeVisible();
    expect(
      await viewer.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    let comments = await openComments(viewer);
    await comments
      .getByLabel("Your comment", { exact: true })
      .fill("A comment draft that should survive a failure.");
    await viewer.route(`**/api/decks/${id}/comments`, async (route) =>
      route.request().method() === "POST"
        ? route.fulfill({
            status: 503,
            contentType: "application/json",
            body: JSON.stringify({ error: "Temporary review outage" }),
          })
        : route.continue(),
    );
    await comments
      .getByRole("button", { name: "Post comment", exact: true })
      .click();
    await expect(comments.getByRole("alert")).toContainText(
      "Temporary review outage",
    );
    await expect(
      comments.getByLabel("Your comment", { exact: true }),
    ).toHaveValue("A comment draft that should survive a failure.");
    await viewer.unroute(`**/api/decks/${id}/comments`);
    await viewer.reload();
    comments = await openComments(viewer);
    await expect(
      comments.getByLabel("Your comment", { exact: true }),
    ).toHaveValue("A comment draft that should survive a failure.");
    await comments
      .getByRole("button", { name: "Post comment", exact: true })
      .click();
    await expect(comments.locator(".review-comment")).toContainText(
      "should survive",
    );
    await checkA11y(viewer);
    expect(
      await viewer.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await viewer.screenshot({ path: "/tmp/frame-review-mobile-comments.png" });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await checkA11y(page);
  } finally {
    await context.close();
  }
});
