import { test, expect, type Page } from "@playwright/test";
import sharp from "sharp";
import { signup, newBlank, checkA11y } from "./helpers";
import type { FrameDocument } from "../shared/schema";
import type { SavedTheme } from "../shared/design-library";
async function openLibrary(page: Page) {
  await page.getByRole("button", { name: "Theme", exact: true }).click();
  await page
    .getByRole("button", { name: "Design library & brand kits", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Design library" }),
  ).toBeVisible();
  await expect(page.getByText("Loading designs…", { exact: true })).toHaveCount(
    0,
  );
}
async function doc(page: Page): Promise<FrameDocument> {
  return await (
    await page.request.get(
      `/api/decks/${new URL(page.url()).pathname.split("/").at(-1)}`,
    )
  ).json();
}
async function saved(page: Page) {
  await expect(
    page.getByText("All changes saved", { exact: true }),
  ).toBeVisible();
}
test("theme library saves, previews real charts, applies selected slides and keeps embedded snapshots stable", async ({
  page,
}) => {
  await signup(page);
  await page
    .getByRole("button", {
      name: "Open Illustrative story — make it yours",
      exact: true,
    })
    .click();
  const before = await doc(page);
  await page.getByLabel("Select slide 1", { exact: true }).check();
  await page.getByLabel("Select slide 3", { exact: true }).check();
  await openLibrary(page);
  const modal = page.getByRole("dialog");
  await modal
    .getByLabel("Theme name", { exact: true })
    .fill("Fieldwork electric");
  await modal.getByLabel("heading type scale", { exact: true }).fill("1.15");
  await modal.getByRole("button", { name: "Data", exact: true }).click();
  await expect(modal.locator('svg[role="img"]')).toBeVisible();
  await modal.getByRole("button", { name: "Save theme", exact: true }).click();
  await expect(modal.getByText(/Saved to workspace/)).toBeVisible();
  await modal.locator(".design-library").evaluate((el) => (el.scrollTop = 0));
  await page.screenshot({ path: "/tmp/frame-design-library.png" });
  await checkA11y(page);
  await modal.getByRole("button", { name: "Use theme", exact: true }).click();
  await page.getByLabel("Apply to", { exact: true }).selectOption("selected");
  await page
    .getByRole("button", { name: "Apply Fieldwork electric", exact: true })
    .click();
  await saved(page);
  const applied = await doc(page);
  expect(applied.slides[0].themeId).toBe(applied.slides[2].themeId);
  expect(applied.slides[1].themeId).toBeUndefined();
  expect(applied.slides.map((s) => s.elements)).toEqual(
    before.slides.map((s) => s.elements),
  );
  const oldId = applied.slides[0].themeId!;
  await page
    .getByRole("button", { name: "Design library & brand kits", exact: true })
    .click();
  await modal
    .getByRole("button", { name: /Fieldwork electric Your theme/ })
    .click();
  await modal
    .getByLabel("Theme name", { exact: true })
    .fill("Fieldwork updated");
  await modal
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(modal.getByText(/Saved to workspace/)).toBeVisible();
  expect((await doc(page)).slides[0].themeId).toBe(oldId);
  expect((await doc(page)).themes.find((t) => t.id === oldId)?.name).toBe(
    "Fieldwork electric",
  );
  await modal.getByRole("button", { name: "Use theme", exact: true }).click();
  await page.getByLabel("Apply to", { exact: true }).selectOption("slide");
  await page
    .getByRole("button", { name: "Apply Fieldwork updated", exact: true })
    .click();
  await saved(page);
  const updated = await doc(page);
  expect(updated.slides[0].themeId).not.toBe(oldId);
  expect(updated.slides[2].themeId).toBe(oldId);
  await page.reload();
  await saved(page);
  expect((await doc(page)).slides[2].themeId).toBe(oldId);
});
test("brand kits save logo, palette, fonts and rules, then reuse the logo as an editable image", async ({
  page,
}) => {
  await signup(page);
  await newBlank(page);
  await openLibrary(page);
  const modal = page.getByRole("dialog");
  await modal.getByRole("tab", { name: "Brand kits", exact: true }).click();
  await modal
    .getByLabel("Brand kit name", { exact: true })
    .fill("North studio");
  await modal
    .getByLabel("Brand rules", { exact: true })
    .fill("Leave generous space around the mark.");
  const png = await sharp({
    create: { width: 240, height: 120, channels: 4, background: "#2347dd" },
  })
    .png()
    .toBuffer();
  await modal.getByLabel("Upload brand logo", { exact: true }).setInputFiles({
    name: "north-logo.png",
    mimeType: "image/png",
    buffer: png,
  });
  await expect(
    modal.getByLabel("Logo alternative text", { exact: true }),
  ).toBeVisible();
  await modal
    .getByLabel("Logo alternative text", { exact: true })
    .fill("North studio wordmark");
  await modal
    .getByRole("button", { name: "Save brand kit", exact: true })
    .click();
  await expect(modal.getByText(/Saved to workspace/)).toBeVisible();
  await checkA11y(page);
  await modal
    .getByRole("button", { name: "Insert brand logo", exact: true })
    .click();
  await saved(page);
  let document = await doc(page);
  expect(document.slides[0].elements.find((e) => e.type === "image")?.alt).toBe(
    "North studio wordmark",
  );
  await page.reload();
  await saved(page);
  await openLibrary(page);
  await modal.getByRole("tab", { name: "Brand kits", exact: true }).click();
  await modal
    .getByRole("button", { name: /North studio Your brand kit/ })
    .click();
  await expect(modal.getByLabel("Brand rules", { exact: true })).toHaveValue(
    "Leave generous space around the mark.",
  );
  await expect(
    modal.getByLabel("Logo alternative text", { exact: true }),
  ).toHaveValue("North studio wordmark");
  await modal
    .getByRole("button", { name: "Use brand styling", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Apply North studio", exact: true })
    .click();
  await saved(page);
  document = await doc(page);
  expect(document.themes.find((t) => t.id === document.themeId)?.name).toBe(
    "North studio",
  );
});
test("library save failures and revision conflicts retain drafts and support a deliberate copy", async ({
  page,
}) => {
  await signup(page);
  await newBlank(page);
  await openLibrary(page);
  const modal = page.getByRole("dialog");
  await modal
    .getByLabel("Theme name", { exact: true })
    .fill("My recoverable theme");
  await page.route("**/api/themes", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({
        status: 503,
        json: { error: "Design storage temporarily unavailable." },
      });
      await page.unroute("**/api/themes");
    } else await route.continue();
  });
  await modal.getByRole("button", { name: "Save theme", exact: true }).click();
  await expect(modal.getByRole("alert")).toContainText(
    "temporarily unavailable",
  );
  await expect(modal.getByLabel("Theme name", { exact: true })).toHaveValue(
    "My recoverable theme",
  );
  await modal.getByRole("button", { name: "Save theme", exact: true }).click();
  await expect(modal.getByText(/Saved to workspace/)).toBeVisible();
  const [existing] = (await (
    await page.request.get("/api/themes")
  ).json()) as SavedTheme[];
  const remote = await page.request.put(`/api/themes/${existing.id}`, {
    data: {
      revision: existing.revision,
      theme: { ...existing.theme, name: "Changed elsewhere" },
    },
  });
  expect(remote.ok()).toBe(true);
  await modal
    .getByLabel("Theme name", { exact: true })
    .fill("Keep my local draft");
  await modal
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(modal.getByRole("alert")).toContainText("another window");
  await expect(modal.getByLabel("Theme name", { exact: true })).toHaveValue(
    "Keep my local draft",
  );
  await modal.getByRole("button", { name: "Make a copy", exact: true }).click();
  await modal.getByRole("button", { name: "Save theme", exact: true }).click();
  await expect(modal.getByText(/Saved to workspace/)).toBeVisible();
  const list = (await (
    await page.request.get("/api/themes")
  ).json()) as SavedTheme[];
  expect(list.map((i) => i.theme.name).sort()).toEqual([
    "Changed elsewhere",
    "Keep my local draft copy",
  ]);
  await modal.getByLabel("background color", { exact: true }).fill("#777777");
  await modal.getByLabel("foreground color", { exact: true }).fill("#777777");
  await expect(
    modal.getByText("Check text contrast", { exact: true }),
  ).toBeVisible();
  await modal
    .getByRole("button", { name: "Improve contrast", exact: true })
    .click();
  await expect(
    modal.getByText("Text palette meets 4.5:1 on base surfaces.", {
      exact: true,
    }),
  ).toBeVisible();
});
test("reset-to-theme preserves content, library adapts to mobile and keyboard tabs, rehearsal respects reduced motion", async ({
  page,
}) => {
  await signup(page);
  await newBlank(page);
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await page.getByLabel("Font size", { exact: true }).fill("72");
  await page.getByLabel("Font size", { exact: true }).press("Tab");
  await page.getByRole("button", { name: "Theme", exact: true }).click();
  await page.getByRole("button", { name: /Sunday paper/ }).click();
  await page
    .getByRole("button", { name: "Apply Sunday paper", exact: true })
    .click();
  await page.getByRole("button", { name: "Design", exact: true }).click();
  await expect(page.getByLabel("Font size", { exact: true })).toHaveValue("72");
  await page
    .getByRole("button", { name: "Reset to theme", exact: true })
    .click();
  await expect(page.getByLabel("Font size", { exact: true })).toHaveValue("36");
  await saved(page);
  const reset = await doc(page);
  expect(reset.slides[0].elements[0].fontSize).toBeUndefined();
  expect(reset.slides[0].elements[0].text).toBe("Make your point.");
  await openLibrary(page);
  await page.setViewportSize({ width: 390, height: 844 });
  const modal = page.getByRole("dialog");
  expect(await modal.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  );
  await modal.getByRole("tab", { name: "Saved themes", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    modal.getByRole("tab", { name: "Brand kits", exact: true }),
  ).toBeFocused();
  await expect(
    modal.getByLabel("Brand kit name", { exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: "/tmp/frame-design-library-mobile.png" });
  await checkA11y(page);
  await modal
    .getByRole("button", { name: "Close dialog", exact: true })
    .click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "Present", exact: true }).click();
  await expect(page.locator(".present-stage-host")).toContainText(
    "Make your point.",
  );
  await expect(
    page.locator(".present-stage-host .slide-object-motion").first(),
  ).toHaveCSS("animation-name", "none");
});
test("workspace themes can create, save and reuse a custom design across new presentations", async ({
  page,
}) => {
  await signup(page);
  await page.getByRole("button", { name: "Themes", exact: true }).click();
  await page
    .getByRole("button", { name: "Design library & brand kits", exact: true })
    .click();
  const modal = page.getByRole("dialog");
  await modal
    .getByLabel("Theme name", { exact: true })
    .fill("Workspace signal");
  await modal
    .getByRole("combobox", { name: "Heading font", exact: true })
    .selectOption("Georgia");
  await modal.getByRole("button", { name: "Save theme", exact: true }).click();
  await expect(modal.getByText(/Saved to workspace/)).toBeVisible();
  await modal.getByRole("button", { name: "Use theme", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "A new presentation." }),
  ).toBeVisible();
  await page
    .getByLabel("Presentation name", { exact: true })
    .fill("With my saved design");
  await page
    .getByRole("button", { name: "Create presentation", exact: true })
    .click();
  await saved(page);
  let created = await doc(page);
  expect(
    created.themes.find((t) => t.id === created.themeId)?.headingFont,
  ).toBe("Georgia");
  expect(created.themes.find((t) => t.id === created.themeId)?.name).toBe(
    "Workspace signal",
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Themes", exact: true }).click();
  await page
    .getByRole("button", { name: /Workspace signal Your saved theme/ })
    .click();
  await page
    .getByLabel("Presentation name", { exact: true })
    .fill("Another reusable design");
  await page
    .getByRole("button", { name: "Create presentation", exact: true })
    .click();
  await saved(page);
  created = await doc(page);
  expect(created.themes.find((t) => t.id === created.themeId)?.name).toBe(
    "Workspace signal",
  );
});
