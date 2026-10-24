import { test, expect } from "@playwright/test";
import { signup, newBlank } from "./helpers";

test("MongoDB application edits survive reload and structured JSON remains copyable", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await signup(page);
  await newBlank(page);
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await page
    .getByLabel("Content", { exact: true })
    .fill("Saved through the MongoDB application.");
  await page.getByLabel("Presentation title", { exact: true }).click();
  await expect(
    page.getByRole("button", { name: "All changes saved", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "All changes saved", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "View and copy presentation JSON",
      exact: true,
    })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Presentation JSON",
    exact: true,
  });
  await expect(dialog).toBeVisible();
  await dialog
    .getByRole("combobox", { name: "What to copy" })
    .selectOption("slide");
  const serialized = await dialog
    .getByRole("textbox", { name: "JSON preview" })
    .inputValue();
  expect(
    JSON.parse(serialized).elements.some(
      (element: { text?: string }) =>
        element.text === "Saved through the MongoDB application.",
    ),
  ).toBe(true);
  await dialog.getByRole("button", { name: "Copy JSON", exact: true }).click();
  await expect(dialog.getByRole("status")).toHaveText(
    "JSON copied to clipboard.",
  );
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    serialized,
  );
});
