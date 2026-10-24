import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { checkA11y } from "./helpers";
async function session(context: BrowserContext, role: "admin" | "member") {
  await context.addCookies([
    { name: "frame_admin_fixture", value: role, url: "http://127.0.0.1:5183" },
  ]);
}
async function openAdmin(page: Page, email: string) {
  await session(page.context(), "admin");
  await page.goto("/e2e/admin.fixture.html");
  await page.getByRole("searchbox").fill(email);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.locator(".admin-user")).toHaveCount(1);
}
test("admin changes persist, zero is visible to members, and mobile supports restoring unlimited credits", async ({
  page,
  browser,
}) => {
  const member = await browser.newContext();
  try {
    await session(member, "member");
    await openAdmin(page, "credit-member@example.test");
    const row = page.locator(".admin-user");
    await row.getByRole("checkbox", { name: "Unlimited" }).uncheck();
    await row.getByRole("spinbutton").fill("12");
    await row.getByRole("button", { name: "Save balance" }).click();
    await expect(page.getByRole("status")).toContainText(
      "12 credits remaining",
    );
    await openAdmin(page, "credit-member@example.test");
    await expect(row.getByRole("spinbutton")).toHaveValue("12");
    await checkA11y(page);
    await page.screenshot({
      path: "/tmp/frame-hosted-admin-desktop.png",
      fullPage: true,
    });
    await row.getByRole("spinbutton").fill("0");
    await row.getByRole("button", { name: "Save balance" }).click();
    await expect(page.getByRole("status")).toContainText("0 credits remaining");
    const memberPage = await member.newPage();
    await memberPage.goto(
      "http://127.0.0.1:5183/e2e/admin.fixture.html?view=balance",
    );
    await expect(memberPage.locator(".credit-balance")).toContainText(
      "0 presentation credits",
    );
    await expect(memberPage.locator(".credit-balance")).toContainText(
      "Ask an administrator",
    );
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await checkA11y(page);
    await page.screenshot({
      path: "/tmp/frame-hosted-admin-mobile.png",
      fullPage: true,
    });
    await row.getByRole("checkbox", { name: "Unlimited" }).check();
    await row.getByRole("button", { name: "Save balance" }).click();
    await expect(page.getByRole("status")).toContainText("unlimited credits");
    await memberPage.reload();
    await expect(memberPage.locator(".credit-balance")).toContainText(
      "Unlimited presentation credits",
    );
    await page.getByRole("searchbox").fill("no-matching-user");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "No users found" }),
    ).toBeVisible();
  } finally {
    await member.close();
  }
});
test("stale edits show a conflict and reload the latest balance", async ({
  page,
}) => {
  await openAdmin(page, "conflict@example.test");
  const { users } = await (
    await page.request.get("/api/admin/users?query=conflict@example.test")
  ).json();
  const row = page.locator(".admin-user");
  await row.getByRole("checkbox", { name: "Unlimited" }).uncheck();
  await row.getByRole("spinbutton").fill("7");
  const response = await page.request.patch(
    `/api/admin/users/${users[0].id}/credits`,
    { data: { remaining: 3, revision: users[0].revision } },
  );
  expect(response.ok()).toBe(true);
  await row.getByRole("button", { name: "Save balance" }).click();
  await expect(page.getByRole("alert")).toContainText("This balance changed");
  await page.getByRole("button", { name: "Reload users" }).click();
  await expect(row.getByRole("spinbutton")).toHaveValue("3");
});
test("ordinary users cannot read or modify another user's credits", async ({
  page,
}) => {
  await session(page.context(), "member");
  await page.goto("/e2e/admin.fixture.html");
  await expect(page.getByRole("alert")).toContainText(
    "Administrator access is required.",
  );
  await expect(page.locator(".admin-user")).toHaveCount(0);
  const response = await page.request.patch(
    "/api/admin/users/anything/credits",
    { data: { remaining: 1000, revision: 0 } },
  );
  expect(response.status()).toBe(403);
});
