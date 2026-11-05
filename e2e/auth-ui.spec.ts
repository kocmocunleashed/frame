import { expect, test } from "@playwright/test";
import { checkA11y } from "./helpers";

test("unsupported sign-in configuration is a recoverable error", async ({ page }) => {
  await page.route("**/api/auth/provider", route => route.fulfill({ json: { provider: "unsupported" } }));
  await page.goto("/signin");
  await expect(page.getByRole("heading", { name: "Frame could not open" })).toBeVisible();
  await expect(page.getByText("Frame needs its standalone sign-in configuration on the server.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toBeEnabled();
  await checkA11y(page);
});

test("explicit fixture login keeps typed values after failure and remains usable on a phone", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByLabel("Email address").fill("fixture-retry@example.test");
  await page.route("**/api/auth/signup", (route) =>
    route.fulfill({ status: 503, json: { error: "Unavailable" } }),
  );
  await page.getByRole("button", { name: "Open local workspace" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByLabel("Email address")).toHaveValue(
    "fixture-retry@example.test",
  );
  await checkA11y(page);
  await page.unroute("**/api/auth/signup");
  await page.getByRole("button", { name: "Open local workspace" }).click();
  await expect(
    page.getByRole("heading", { name: "What’s your next big idea?" }),
  ).toBeVisible();
});
