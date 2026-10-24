import { test, expect, type Page } from "@playwright/test";
import path from "node:path";
import { signup, newBlank, checkA11y } from "./helpers";
test("account → blank deck → edit → undo/redo → save → reload → rehearse", async ({
  page,
}) => {
  const runtimeErrors: string[] = [];
  page.on("pageerror", (e) => runtimeErrors.push(e.message));
  await signup(page);
  await page.screenshot({ path: "/tmp/frame-workspace-desktop.png" });
  await checkA11y(page);
  await newBlank(page);
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await page
    .getByLabel("Content", { exact: true })
    .fill("A story worth sharing.");
  await page.getByLabel("Content", { exact: true }).press("Tab");
  await expect(page.locator(".editable-stage")).toContainText(
    "A story worth sharing.",
  );
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator(".editable-stage")).toContainText(
    "Make your point.",
  );
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.locator(".editable-stage")).toContainText(
    "A story worth sharing.",
  );
  await page
    .getByLabel("Speaker notes", { exact: true })
    .fill("These notes are private.");
  await page.getByLabel("Speaker notes", { exact: true }).press("Tab");
  await expect(
    page.getByText("All changes saved", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator(".editable-stage")).toContainText(
    "A story worth sharing.",
  );
  await expect(page.getByLabel("Speaker notes", { exact: true })).toHaveValue(
    "These notes are private.",
  );
  await page.getByRole("button", { name: "Shape", exact: true }).click();
  await page.getByRole("button", { name: "Circle", exact: true }).click();
  await page
    .getByRole("button", { name: "Duplicate selected objects", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Layers", exact: true })
    .first()
    .click();
  await expect(page.locator(".layer-row")).toHaveCount(3);
  await page.screenshot({ path: "/tmp/frame-editor-desktop.png" });
  await checkA11y(page);
  await page.getByRole("button", { name: "Present", exact: true }).click();
  await expect(
    page.getByText("Local rehearsal", { exact: false }),
  ).toBeVisible();
  await expect(page.locator(".present-stage-host")).toContainText(
    "A story worth sharing.",
  );
  await page
    .getByRole("button", { name: "Open presenter view", exact: true })
    .click();
  await expect(page.locator(".presenter-notes")).toHaveText(
    "These notes are private.",
  );
  await page.getByRole("button", { name: "Start timer", exact: true }).click();
  await expect(page.locator(".presenter-timer strong")).not.toHaveText("00:00");
  await page
    .getByRole("button", { name: "Slide overview", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.screenshot({ path: "/tmp/frame-rehearsal.png" });
  expect(runtimeErrors).toEqual([]);
});
test("library filtering, folder, archive and recoverable trash", async ({
  page,
}) => {
  await signup(page);
  await page.getByLabel("Search presentations").fill("Illustrative lesson");
  await expect(page.locator(".deck-card")).toHaveCount(1);
  await page.getByLabel("Clear search").click();
  await page.getByRole("button", { name: "New folder", exact: true }).click();
  await page.getByLabel("Folder name").fill("Course materials");
  await page
    .getByRole("button", { name: "Create folder", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Course materials", exact: true }),
  ).toBeVisible();
  const card = page
    .locator(".deck-card")
    .filter({ hasText: "Illustrative lesson" });
  await card.getByRole("button", { name: /Actions for/ }).click();
  await page
    .getByRole("button", { name: "Archive", exact: true })
    .last()
    .click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Archive", exact: true })
    .click();
  await expect(page.locator(".deck-card")).toHaveCount(1);
  await page.getByRole("button", { name: /Actions for/ }).click();
  await page
    .getByRole("button", { name: "Move to trash", exact: true })
    .click();
  await page.getByRole("button", { name: "Trash", exact: true }).click();
  await expect(page.locator(".deck-card")).toHaveCount(1);
  await page.getByRole("button", { name: /Actions for/ }).click();
  await page
    .getByRole("button", { name: "Restore presentation", exact: true })
    .click();
  await page.getByRole("button", { name: /^Presentations/ }).click();
  await expect(page.locator(".deck-card")).toHaveCount(3);
});
test("theme preview applies only to the chosen scope and geometry survives", async ({
  page,
}) => {
  await signup(page);
  await page
    .getByRole("button", {
      name: "Open Illustrative story — make it yours",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "Theme", exact: true }).click();
  await page.getByRole("button", { name: /Sunday paper/ }).click();
  await page.getByLabel("Apply to", { exact: true }).selectOption("slide");
  await page
    .getByRole("button", { name: "Apply Sunday paper", exact: true })
    .click();
  await expect(
    page.getByText("All changes saved", { exact: true }),
  ).toBeVisible();
  const doc = await page.evaluate(
    async () =>
      await (
        await fetch(`/api/decks/${location.pathname.split("/").at(-1)}`)
      ).json(),
  );
  expect(doc.themeId).toBe("studio");
  expect(doc.slides[0].themeId).toBe("editorial");
  expect(doc.slides[1].themeId).toBeUndefined();
  expect(
    doc.slides[0].elements.find((e: { type: string }) => e.type === "text").x,
  ).toBe(76);
});
test("narrow workspace, account form and tablet editor remain usable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Open your local Frame workspace" }),
  ).toBeVisible();
  await checkA11y(page);
  await signup(page);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "/tmp/frame-workspace-mobile.png" });
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .click();
  await newBlank(page);
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.getByRole("button", { name: "Text", exact: true }).click();
  const showProperties = page.getByRole("button", {
    name: "Show properties",
    exact: true,
  });
  if (await showProperties.isVisible()) await showProperties.click();
  await expect(page.getByLabel("Content", { exact: true })).toBeVisible();
  await page.screenshot({ path: "/tmp/frame-editor-tablet.png" });
  await checkA11y(page);
});
