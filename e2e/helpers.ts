import { test, expect, type Page } from "@playwright/test";
import path from "node:path";
export async function signup(page: Page) {
  const response = await page.request.post("/api/auth/signup", {
    data: {
      name: "Frame tester",
      email: `browser-${crypto.randomUUID()}@example.test`,
    },
  });
  expect(response.ok()).toBe(true);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "What’s your next big idea?" }),
  ).toBeVisible();
}
export async function newBlank(page: Page) {
  await page
    .getByRole("button", { name: "New presentation", exact: true })
    .click();
  await page
    .getByLabel("Presentation name", { exact: true })
    .fill("My verified presentation");
  await page
    .getByRole("button", { name: "Create presentation", exact: true })
    .click();
  await expect(
    page.getByLabel("Presentation title", { exact: true }),
  ).toHaveValue("My verified presentation");
}
export async function checkA11y(page: Page) {
  await page.addScriptTag({
    path: path.resolve("node_modules/axe-core/axe.min.js"),
  });
  const violations = await page.evaluate(async () => {
    const result = await (
      window as unknown as {
        axe: {
          run: (
            root: Document,
            options: unknown,
          ) => Promise<{
            violations: unknown[];
          }>;
        };
      }
    ).axe.run(document, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag22aa"] },
    });
    return result.violations;
  });
  expect(violations).toEqual([]);
}

test.afterEach(async ({ page }, info) => {
  if (info.status !== info.expectedStatus) {
    try {
      const response = await page.request.get("/__fixture/diagnostics", {
        timeout: 5000,
      });
      if (response.ok())
        await info.attach("worker-state", {
          body: JSON.stringify(await response.json(), null, 2),
          contentType: "application/json",
        });
    } catch {}
  }
});
