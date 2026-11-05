import { test, expect } from "@playwright/test";
import { newBlank, checkA11y } from "./helpers";
test("real registration → workspace → editor → reload → presentation → logout → login", async ({
  page,
}) => {
  const email = `standalone-${crypto.randomUUID()}@example.test`,
    password = "standalone-test-password";
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/signup");
  await page
    .getByLabel("Your name", { exact: true })
    .fill("Standalone creator");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await checkA11y(page);
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "What’s your next big idea?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Manage workspaces" }).click();
  await page.getByLabel("New workspace name").fill("Independent team");
  await page
    .getByRole("button", { name: "Create workspace", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "What’s your next big idea?" }),
  ).toBeVisible();
  await newBlank(page);
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await page
    .getByLabel("Content", { exact: true })
    .fill("Saved in PostgreSQL.");
  await page.getByLabel("Content", { exact: true }).press("Tab");
  await expect(
    page.getByText("All changes saved", { exact: true }),
  ).toBeVisible();
  const editorUrl = page.url();
  await page.reload();
  await expect(page.locator(".editable-stage")).toContainText(
    "Saved in PostgreSQL.",
  );
  await page.getByRole("button", { name: "Present", exact: true }).click();
  await expect(page.locator(".present-stage-host")).toContainText(
    "Saved in PostgreSQL.",
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Profile menu", exact: true }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Welcome back." }),
  ).toBeVisible();
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "What’s your next big idea?" }),
  ).toBeVisible();
  await page.goto(editorUrl);
  await expect(page.locator(".editable-stage")).toContainText(
    "Saved in PostgreSQL.",
  );
  expect(errors).toEqual([]);
});
