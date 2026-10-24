import { test, expect } from "@playwright/test";
import { signup, newBlank, checkA11y } from "./helpers";
test("named tools expose a spreadsheet editor, preserve invalid data, and share undo and delete", async ({
  page,
}) => {
  await signup(page);
  await newBlank(page);
  await expect(
    page.getByRole("button", { name: "Insert more objects", exact: true }),
  ).toHaveCount(0);
  for (const type of ["chart", "table", "diagram", "icon", "question", "video"])
    await expect(
      page.getByRole("button", { name: `Add ${type}`, exact: true }),
    ).toBeAttached();
  await page.getByRole("button", { name: "Add chart", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Chart data", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Open spreadsheet editor", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Edit chart data",
    exact: true,
  });
  await dialog.getByText("Paste from a spreadsheet", { exact: true }).click();
  await dialog
    .getByLabel("Spreadsheet cells")
    .fill("Label\tValue\nExplore\t14\nBuild\t28\nShare\t42");
  await dialog
    .getByRole("button", { name: "Apply pasted data", exact: true })
    .click();
  await expect(dialog.getByLabel("Data value 3", { exact: true })).toHaveValue(
    "42",
  );
  await dialog.getByLabel("Data value 1", { exact: true }).fill("");
  await dialog.getByLabel("Data value 1", { exact: true }).press("Tab");
  await expect(dialog.getByRole("alert")).toContainText(
    "Enter a numeric value",
  );
  await dialog.getByLabel("Data value 1", { exact: true }).fill("14");
  await dialog.getByLabel("Data value 1", { exact: true }).press("Tab");
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  await dialog.getByLabel("Spreadsheet cells").fill("Explore\tnot a number");
  await dialog
    .getByRole("button", { name: "Apply pasted data", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText("numeric value");
  await expect(dialog.getByLabel("Data value 1", { exact: true })).toHaveValue(
    "14",
  );
  await dialog.getByLabel("Spreadsheet cells").fill("");
  await dialog
    .getByRole("button", { name: "Done editing", exact: true })
    .click();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByLabel("Data value 1", { exact: true })).toHaveValue(
    "30",
  );
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.getByLabel("Data value 1", { exact: true })).toHaveValue(
    "14",
  );
  await page
    .getByRole("button", { name: "Delete selection", exact: true })
    .click();
  await expect(page.locator(".canvas-element")).toHaveCount(0);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator(".canvas-element")).toHaveCount(1);
  await page.locator(".canvas-element").click();
  await page
    .getByRole("button", { name: "Delete selection", exact: true })
    .click();
  await page.getByRole("button", { name: "Add diagram", exact: true }).click();
  const first = await page.getByLabel("Node 1", { exact: true }).inputValue();
  await page
    .getByRole("button", { name: "Move node 1 down", exact: true })
    .click();
  await expect(page.getByLabel("Node 2", { exact: true })).toHaveValue(first);
  await checkA11y(page);
  await page.screenshot({ path: "/tmp/frame-exposed-tools-desktop.png" });
  await page.getByRole("button", { name: "Add table", exact: true }).click();
  await page
    .getByRole("button", { name: "Open spreadsheet editor", exact: true })
    .click();
  const table = page.getByRole("dialog", {
    name: "Edit table data",
    exact: true,
  });
  await table.getByText("Paste from a spreadsheet", { exact: true }).click();
  await table
    .getByLabel("Spreadsheet cells")
    .fill("Name\tStatus\nObserve\tReady\nListen\tNext");
  await table
    .getByRole("button", { name: "Apply pasted data", exact: true })
    .click();
  await table
    .getByRole("button", { name: "Remove row 2", exact: true })
    .click();
  await expect(
    table.getByLabel("Row 2, column 1", { exact: true }),
  ).toHaveValue("Listen");
  await table
    .getByRole("button", { name: "Remove column 2", exact: true })
    .click();
  await expect(
    table.getByLabel("Row 2, column 2", { exact: true }),
  ).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await checkA11y(page);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "/tmp/frame-data-editor-mobile.png",
    fullPage: true,
  });
});
test("make visual previews editable tools and applies only to the current slide with undo", async ({
  page,
}) => {
  await signup(page);
  await newBlank(page);
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await expect(
    page.getByText("All changes saved", { exact: true }),
  ).toBeVisible();
  const before = await (
    await page.request.get(`/api/decks/${page.url().split("/").pop()}`)
  ).json();
  await page.getByRole("button", { name: "Edit with AI", exact: true }).click();
  const modal = page.getByRole("dialog", { name: "Edit with AI", exact: true });
  await modal
    .getByRole("button", { name: "Make this slide visual", exact: true })
    .click();
  await expect(
    modal.getByText("A refreshed current slide.", { exact: true }),
  ).toBeVisible();
  const unchanged = await (
    await page.request.get(`/api/decks/${before.id}`)
  ).json();
  expect(unchanged.slides).toEqual(before.slides);
  await modal
    .getByRole("button", { name: "Apply proposed changes", exact: true })
    .click();
  await expect(page.locator(".canvas-element")).toHaveCount(11);
  await expect(
    page.getByText("All changes saved", { exact: true }),
  ).toBeVisible();
  const after = await (
    await page.request.get(`/api/decks/${before.id}`)
  ).json();
  expect(
    after.slides[0].elements.filter(
      (el: { type: string }) => el.type === "icon",
    ),
  ).toHaveLength(2);
  expect(
    after.slides[0].elements.filter(
      (el: { type: string }) => el.type === "shape",
    ),
  ).toHaveLength(4);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator(".canvas-element")).toHaveCount(1);
});
