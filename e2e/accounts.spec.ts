import { test, expect } from "@playwright/test";
import { signup, checkA11y } from "./helpers";
test("profile save failures preserve the draft; saved identity and workspace survive sign-out and sign-in", async ({
  page,
  context,
}) => {
  await signup(page);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await expect(page.locator(".workspace-topbar .credit-balance")).toContainText("Unlimited");
  await expect(page.locator(".workspace-main > .credit-balance")).toHaveCount(0);
  await expect(page.locator(".workspace-sidebar").getByRole("button", { name: "Account settings", exact: true })).toHaveCount(0);
  await expect(page.locator(".workspace-sidebar").getByRole("button", { name: "Templates", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Themes", exact: true }).click();
  await page.getByRole("tab", { name: "Templates", exact: true }).click();
  await expect(page.getByRole("tabpanel", { name: "Templates", exact: true })).toContainText("Tell a story");
  await page.getByRole("tab", { name: "Templates", exact: true }).press("ArrowLeft");
  await expect(page.getByRole("tab", { name: "Themes", exact: true })).toBeFocused();
  await expect(page.getByRole("tabpanel", { name: "Themes", exact: true })).toBeVisible();
  await checkA11y(page);
  await page.screenshot({ path: "/tmp/frame-touchups-themes.png", fullPage: true });
  await page.getByRole("button", { name: "Presentations", exact: false }).first().click();
  await page.getByRole("button", { name: "Profile menu", exact: true }).click();
  await page.screenshot({ path: "/tmp/frame-touchups-desktop.png", fullPage: true });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Profile menu", exact: true })).toBeFocused();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Profile menu", exact: true }).click();
  await expect(page.getByRole("button", { name: "AI settings", exact: true })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await checkA11y(page);
  await page.screenshot({ path: "/tmp/frame-touchups-mobile.png", fullPage: true });
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "Profile menu", exact: true }).click();
  await page
    .getByRole("button", { name: "Account settings", exact: true })
    .first()
    .click();
  const settings = page.getByRole("dialog", {
    name: "Your account",
    exact: true,
  });
  const email = await settings
    .getByLabel("Email", { exact: true })
    .inputValue();
  const before = await (await page.request.get("/api/decks")).json();
  await settings.getByLabel("Your name", { exact: true }).fill("Alex Rivera");
  await page.route("**/api/me", async (route) => {
    if (route.request().method() === "PATCH")
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Profile save unavailable. Try again." }),
      });
    else await route.continue();
  });
  await settings
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(settings.getByRole("alert")).toContainText(
    "Profile save unavailable",
  );
  await expect(settings.getByLabel("Your name", { exact: true })).toHaveValue(
    "Alex Rivera",
  );
  await checkA11y(page);
  await page.unroute("**/api/me");
  await settings
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(settings.getByRole("status")).toContainText("Settings saved");
  await settings.getByRole("button",{name:"Close dialog",exact:true}).click();
  await page.reload();
  await page.getByRole("button", { name: "Profile menu", exact: true }).click();
  await page
    .getByRole("button", { name: "Account settings", exact: true })
    .first()
    .click();
  await expect(settings.getByLabel("Your name", { exact: true })).toHaveValue(
    "Alex Rivera",
  );
  await expect(settings.getByLabel("Email", { exact: true })).toHaveValue(
    email,
  );
  await settings
    .getByRole("button", { name: "Close dialog", exact: true })
    .click();
  await page.route("**/api/auth/signout", async (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        error: "Sign-out unavailable. Reconnect and try again.",
      }),
    }),
  );
  await page.getByRole("button", { name: "Profile menu", exact: true }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Sign-out unavailable");
  await expect(
    page.getByRole("button", { name: "Reconnect", exact: true }),
  ).toBeVisible();
  await page.unroute("**/api/auth/signout");
  await page.getByRole("button", { name: "Reconnect", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "What’s your next big idea?",
      exact: true,
    }),
  ).toBeVisible();
  const prior = (await context.cookies()).find(
    (cookie) => cookie.name === "frame_fixture",
  )!;
  await page.getByRole("button", { name: "Profile menu", exact: true }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Open your local Frame workspace", exact: true }),
  ).toBeVisible();
  expect(
    (
      await page.request.get("/api/me", {
        headers: { cookie: `${prior.name}=${prior.value}` },
      })
    ).status(),
  ).toBe(401);
  await page.getByLabel("Email address", { exact: true }).fill(email);
  await page.getByRole("button", { name: "Open local workspace", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "What’s your next big idea?",
      exact: true,
    }),
  ).toBeVisible();
  const me = await (await page.request.get("/api/me")).json();
  expect(me.user.name).toBe("Alex Rivera");
  const after = await (await page.request.get("/api/decks")).json();
  expect(after.map((deck: { id: string }) => deck.id).sort()).toEqual(
    before.map((deck: { id: string }) => deck.id).sort(),
  );
  expect(errors).toEqual([]);
});
test("reconnect recognizes a completed sign-out when its response was lost", async ({
  page,
}) => {
  await signup(page);
  await page.route("**/api/auth/signout", async (route) => {
    await route.fetch();
    await route.abort("failed");
  });
  await page.getByRole("button", { name: "Profile menu", exact: true }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Reconnect", exact: true }),
  ).toBeVisible();
  await page.unroute("**/api/auth/signout");
  expect((await page.request.get("/api/me")).status()).toBe(401);
  await page.getByRole("button", { name: "Reconnect", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Open your local Frame workspace", exact: true }),
  ).toBeVisible();
});
