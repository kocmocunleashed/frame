import { test, expect } from "@playwright/test";
import { signup, newBlank, checkA11y } from "./helpers";
test("milestones, vector points and timed reveals edit, save, reload and remain accessible", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await signup(page);
  await newBlank(page);
  await page.getByRole("button", { name: "Add timeline", exact: true }).click();
  await page.getByLabel("Milestone 1 date", { exact: true }).fill("2026");
  await page.getByLabel("Milestone 1 date", { exact: true }).press("Tab");
  await page
    .getByRole("button", { name: "Add milestone", exact: true })
    .click();
  await expect(
    page.getByLabel("Milestone 4 label", { exact: true }),
  ).toHaveValue("New milestone");
  await page
    .getByRole("button", { name: "Move milestone 2 up", exact: true })
    .click();
  await expect(
    page.getByLabel("Milestone 1 label", { exact: true }),
  ).toHaveValue("Build");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(
    page.getByLabel("Milestone 1 label", { exact: true }),
  ).toHaveValue("Discover");
  await page
    .getByLabel("Timeline arrangement", { exact: true })
    .selectOption("alternating");
  await page
    .getByRole("button", { name: "Add editable vector", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Edit vector points", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Edit vector points",
    exact: true,
  });
  await dialog.getByLabel("Point 1 x", { exact: true }).fill("20");
  await dialog.getByLabel("Point 1 x", { exact: true }).press("Tab");
  await expect(dialog.locator(".vector-pad path")).toHaveAttribute(
    "d",
    /^M20 90/,
  );
  await checkA11y(page);
  await dialog
    .getByRole("button", { name: "Done editing", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Animation timeline", exact: true })
    .click();
  const timeline = page.getByRole("region", {
    name: "Animation timeline",
    exact: true,
  });
  await timeline
    .getByLabel("Animation effect for Vector leaf", { exact: true })
    .selectOption("rise");
  await timeline
    .getByLabel("delay for Vector leaf", { exact: true })
    .fill("300");
  await timeline
    .getByLabel("delay for Vector leaf", { exact: true })
    .press("Tab");
  await timeline
    .getByLabel("duration for Vector leaf", { exact: true })
    .fill("700");
  await timeline
    .getByLabel("duration for Vector leaf", { exact: true })
    .press("Tab");
  const track = timeline.locator(".motion-track").filter({
    has: page.getByLabel("Animation effect for Vector leaf", { exact: true }),
  });
  const bar = await track.locator(".motion-bar").boundingBox();
  if (!bar) throw new Error("Expected a draggable animation bar");
  await page.mouse.move(bar.x + bar.width / 3, bar.y + bar.height / 2);
  await page.mouse.down();
  await page.mouse.move(bar.x + bar.width / 3 + 20, bar.y + bar.height / 2);
  await page.mouse.up();
  expect(
    Number(
      await timeline
        .getByLabel("delay for Vector leaf", { exact: true })
        .inputValue(),
    ),
  ).toBeGreaterThan(300);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(
    timeline.getByLabel("delay for Vector leaf", { exact: true }),
  ).toHaveValue("300");
  await timeline
    .getByRole("slider", { name: "Animation playhead", exact: true })
    .press("End");
  await expect(
    timeline.locator(".motion-preview .motion-content").last(),
  ).toHaveCSS("opacity", "1");
  await page.getByText("All changes saved", { exact: true }).waitFor();
  const id = page.url().split("/").pop();
  const doc = await (await page.request.get(`/api/decks/${id}`)).json();
  expect(doc.version).toBe(2);
  expect(
    doc.slides[0].elements.find((e: any) => e.timeline).timeline.items[0].date,
  ).toBe("2026");
  const vector = doc.slides[0].elements.find((e: any) => e.path);
  expect(vector.path[0].x).toBe(20);
  expect(vector.animation).toEqual({
    type: "rise",
    step: 1,
    delay: 300,
    duration: 700,
  });
  await page.screenshot({ path: "/tmp/frame-creative-timeline-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await checkA11y(page);
  await page.screenshot({
    path: "/tmp/frame-creative-timeline-mobile.png",
    fullPage: true,
  });
  await page.reload();
  await page
    .getByRole("button", { name: "Animation timeline", exact: true })
    .click();
  await expect(
    page.getByLabel("delay for Vector leaf", { exact: true }),
  ).toHaveValue("300");
  expect(errors).toEqual([]);
});
test("AI draws editable illustrations, redesigns a custom look, and choreographs reveals through preview and undo", async ({
  page,
}) => {
  await signup(page);
  await newBlank(page);
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await page.getByText("All changes saved", { exact: true }).waitFor();
  const id = page.url().split("/").pop(),
    before = await (await page.request.get(`/api/decks/${id}`)).json();
  await page
    .getByRole("button", { name: "Add illustration", exact: true })
    .click();
  let dialog = page.getByRole("dialog", { name: "Edit with AI", exact: true });
  await dialog
    .getByRole("button", { name: "Preview illustration", exact: true })
    .click();
  await expect(
    dialog.getByText("Added editable vector illustrations.", { exact: true }),
  ).toBeVisible();
  expect(
    (await (await page.request.get(`/api/decks/${id}`)).json()).slides,
  ).toEqual(before.slides);
  await checkA11y(page);
  await dialog
    .getByRole("button", { name: "Apply proposed changes", exact: true })
    .click();
  await expect(page.locator(".canvas-element")).toHaveCount(3);
  await page.getByText("All changes saved", { exact: true }).waitFor();
  const illustrated = await (await page.request.get(`/api/decks/${id}`)).json();
  expect(
    illustrated.slides[0].elements.filter((e: any) => e.path),
  ).toHaveLength(2);
  expect(illustrated.slides[0].elements[1].groupId).toBe(
    illustrated.slides[0].elements[2].groupId,
  );
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator(".canvas-element")).toHaveCount(1);
  await page.getByRole("button", { name: "Edit with AI", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Edit with AI", exact: true });
  await dialog
    .getByRole("button", { name: "Redesign current slide", exact: true })
    .click();
  await expect(
    dialog.getByText(
      "Designed independent slide compositions and custom looks.",
      { exact: true },
    ),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "Apply proposed changes", exact: true })
    .click();
  await page.getByText("All changes saved", { exact: true }).waitFor();
  await expect(dialog).not.toBeVisible();
  await page.getByText("All changes saved", { exact: true }).waitFor();
  const designed = await (await page.request.get(`/api/decks/${id}`)).json();
  expect(designed.slides[0].layout).toBe("free");
  expect(designed.slides[0].themeId).not.toBe(designed.themeId);
  expect(
    designed.themes.find((t: any) => t.id === designed.slides[0].themeId)
      .artDirection,
  ).toBeUndefined();
  await page.getByRole("button", { name: "Edit with AI", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Edit with AI", exact: true });
  await dialog
    .getByRole("button", { name: "Animate reveals", exact: true })
    .click();
  await expect(
    dialog.getByText("A deliberate reveal sequence.", { exact: true }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "Apply proposed changes", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Animation timeline", exact: true })
    .click();
  await expect(
    page.getByLabel("duration for Heading", { exact: true }),
  ).toHaveValue("400");
  await page.screenshot({ path: "/tmp/frame-creative-ai-editor.png" });
});
