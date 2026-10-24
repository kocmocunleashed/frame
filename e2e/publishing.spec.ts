import { test, expect, type Page } from "@playwright/test";
import sharp from "sharp";
import { signup, newBlank, checkA11y } from "./helpers";
async function openSharing(page: Page) {
  await page
    .getByRole("button", { name: "Publish & share", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Publish & share", exact: true }),
  ).toBeVisible();
}
test("publish a stable anonymous view with protected assets, update explicitly and revoke the same link", async ({
  page,
  browser,
}) => {
  await signup(page);
  await newBlank(page);
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await page.getByLabel("Content", { exact: true }).fill("The shared story.");
  await page.getByLabel("Content", { exact: true }).press("Tab");
  await page
    .getByLabel("Speaker notes", { exact: true })
    .fill("PRIVATE_SPEAKER_NOTES_NEVER_PUBLIC");
  await page.getByLabel("Speaker notes", { exact: true }).press("Tab");
  const png = await sharp({
    create: { width: 200, height: 120, channels: 3, background: "#c44120" },
  })
    .png()
    .toBuffer();
  await page.locator("input[type=file]").first().setInputFiles({
    name: "published-image.png",
    mimeType: "image/png",
    buffer: png,
  });
  await expect(
    page.getByText("All changes saved", { exact: true }),
  ).toBeVisible();
  await openSharing(page);
  const sharing = page.getByRole("dialog", {
    name: "Publish & share",
    exact: true,
  });
  await sharing
    .getByLabel("Published visibility", { exact: true })
    .selectOption("unlisted");
  await sharing
    .getByRole("button", { name: "Publish version", exact: true })
    .click();
  await expect(
    sharing.getByLabel("Published presentation link", { exact: true }),
  ).toBeVisible();
  const url = await sharing
      .getByLabel("Published presentation link", { exact: true })
      .inputValue(),
    publicationId = new URL(url).pathname.split("/").at(-1);
  await page.screenshot({ path: "/tmp/frame-publishing.png" });
  await checkA11y(page);
  const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    }),
    viewer = await context.newPage();
  try {
    await viewer.goto(url);
    await expect(viewer.locator(".present-stage-host")).toContainText(
      "The shared story.",
    );
    expect(
      await viewer
        .locator(".present-stage-host img")
        .evaluate(
          (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
        ),
    ).toBe(true);
    const payload = await (
      await viewer.request.get(`/api/publications/${publicationId}`)
    ).json();
    expect(JSON.stringify(payload)).not.toContain("PRIVATE_SPEAKER");
    expect(payload.document.slides[0].notes).toBeUndefined();
    const asset = payload.document.slides[0].elements.find(
      (e: { type: string }) => e.type === "image",
    ).src;
    expect((await viewer.request.get(asset)).status()).toBe(200);
    await checkA11y(viewer);
    await viewer.screenshot({ path: "/tmp/frame-published-view.png" });
    await sharing
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    await page.getByRole("button", { name: "Text", exact: true }).click();
    await page.getByLabel("Content", { exact: true }).fill("A draft addition.");
    await page.getByLabel("Content", { exact: true }).press("Tab");
    await expect(
      page.getByText("All changes saved", { exact: true }),
    ).toBeVisible();
    await viewer.reload();
    await expect(viewer.locator(".present-stage-host")).not.toContainText(
      "A draft addition.",
    );
    await openSharing(page);
    await sharing
      .getByRole("button", { name: "Publish update", exact: true })
      .click();
    await expect(
      sharing.getByText("Published version 2", { exact: true }),
    ).toBeVisible();
    await viewer.reload();
    await expect(viewer.locator(".present-stage-host")).toContainText(
      "A draft addition.",
    );
    await sharing
      .getByRole("button", { name: "Revoke link", exact: true })
      .click();
    await expect(
      sharing.getByText("Link revoked. Publishing again creates a new link.", {
        exact: true,
      }),
    ).toBeVisible();
    await viewer.reload();
    await expect(
      viewer.getByRole("heading", {
        name: "This link has been revoked.",
        exact: true,
      }),
    ).toBeVisible();
    expect((await viewer.request.get(asset)).status()).toBe(410);
  } finally {
    await context.close();
  }
});
test("private views require sign-in and public sharing is explicitly discoverable", async ({
  page,
  browser,
}) => {
  await signup(page);
  await newBlank(page);
  const uniqueTitle = `Public story ${crypto.randomUUID()}`;
  await page
    .getByLabel("Presentation title", { exact: true })
    .fill(uniqueTitle);
  await page.getByLabel("Presentation title", { exact: true }).press("Tab");
  await openSharing(page);
  const sharing = page.getByRole("dialog", {
    name: "Publish & share",
    exact: true,
  });
  await sharing
    .getByLabel("Published visibility", { exact: true })
    .selectOption("private");
  await sharing
    .getByRole("button", { name: "Publish version", exact: true })
    .click();
  await expect(
    sharing.getByLabel("Published presentation link", { exact: true }),
  ).toBeVisible();
  const url = await sharing
    .getByLabel("Published presentation link", { exact: true })
    .inputValue();
  const guest = await browser.newContext(),
    viewer = await guest.newPage();
  try {
    await viewer.goto(url);
    await expect(
      viewer.getByRole("heading", {
        name: "This presentation is private.",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      viewer.getByRole("link", { name: "Sign in", exact: true }),
    ).toBeVisible();
    await sharing
      .getByLabel("Published visibility", { exact: true })
      .selectOption("public");
    await sharing
      .getByRole("button", { name: "Publish update", exact: true })
      .click();
    await expect(
      sharing.getByText("Published version 2", { exact: true }),
    ).toBeVisible();
    await viewer.goto("/explore");
    await expect(
      viewer.getByRole("heading", {
        name: uniqueTitle,
        exact: true,
      }),
    ).toBeVisible();
    await viewer.getByRole("link", { name: uniqueTitle }).click();
    await expect(
      viewer.getByText("Read-only presentation", { exact: true }),
    ).toBeVisible();
    await checkA11y(viewer);
  } finally {
    await guest.close();
  }
});
test("read-only player supports keyboard navigation, overview, full screen and visible keyboard controls", async ({
  page,
}) => {
  await signup(page);
  await page
    .getByRole("button", {
      name: "Open Illustrative story — make it yours",
      exact: true,
    })
    .click();
  await openSharing(page);
  const sharing = page.getByRole("dialog", {
    name: "Publish & share",
    exact: true,
  });
  await sharing
    .getByRole("button", { name: "Publish version", exact: true })
    .click();
  await expect(
    sharing.getByLabel("Published presentation link", { exact: true }),
  ).toBeVisible();
  const url = await sharing
    .getByLabel("Published presentation link", { exact: true })
    .inputValue();
  await page.goto(url);
  await expect(page.locator(".slide-counter")).toContainText("1 /");
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".slide-counter")).toContainText("2 /");
  await page.keyboard.press("Home");
  await expect(page.locator(".slide-counter")).toContainText("1 /");
  await page
    .getByRole("button", { name: "Slide overview", exact: true })
    .focus();
  await page.keyboard.press("Space");
  await expect(
    page.getByRole("dialog", { name: "Slide overview", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Go to slide 3:/ }).click();
  await expect(page.locator(".slide-counter")).toContainText("3 /");
  await page
    .getByRole("button", { name: "Enter full screen", exact: true })
    .click();
  await expect
    .poll(async () => page.evaluate(() => !!document.fullscreenElement))
    .toBe(true);
  await page
    .getByRole("button", { name: "Exit full screen", exact: true })
    .click();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.keyboard.press("End");
  await expect(
    page.locator(".present-stage-host .slide-object-motion").first(),
  ).toHaveCSS("animation-name", "none");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await checkA11y(page);
});
