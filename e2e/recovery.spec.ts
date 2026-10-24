import { test, expect } from "@playwright/test";
import { signup, newBlank, checkA11y } from "./helpers";
test("an offline browser hint does not block saving to a reachable API", async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "onLine", {
      get: () => false,
      configurable: true,
    }),
  );
  await signup(page);
  await newBlank(page);
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await page
    .getByLabel("Content", { exact: true })
    .fill("Saved over a reachable private network.");
  await page.getByLabel("Content", { exact: true }).press("Tab");
  await expect(
    page.getByText("All changes saved", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator(".editable-stage")).toContainText(
    "Saved over a reachable private network.",
  );
});
test("offline edits reconnect, closed-tab recovery is explicit, and failed saves retain work until retry", async ({
  page,
  context,
}) => {
  await signup(page);
  await newBlank(page);
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await page
    .getByLabel("Content", { exact: true })
    .fill("Saved before the connection dropped.");
  await page.getByLabel("Content", { exact: true }).press("Tab");
  await expect(
    page.getByText("All changes saved", { exact: true }),
  ).toBeVisible();
  const url = page.url(),
    id = new URL(url).pathname.split("/").at(-1)!;
  await context.setOffline(true);
  await page
    .getByLabel("Content", { exact: true })
    .fill("An offline edit that should reconnect.");
  await page.getByLabel("Content", { exact: true }).press("Tab");
  await page
    .getByLabel("Speaker notes", { exact: true })
    .fill("Private notes written offline.");
  await page.getByLabel("Speaker notes", { exact: true }).press("Tab");
  await expect(
    page.getByRole("button", {
      name: "Offline · saved on this device",
      exact: true,
    }),
  ).toBeVisible();
  let server = await (await page.request.get(`/api/decks/${id}`)).json();
  expect(JSON.stringify(server)).not.toContain(
    "An offline edit that should reconnect.",
  );
  await context.setOffline(false);
  await expect(
    page.getByText("All changes saved", { exact: true }),
  ).toBeVisible();
  server = await (await page.request.get(`/api/decks/${id}`)).json();
  expect(JSON.stringify(server)).toContain(
    "An offline edit that should reconnect.",
  );
  expect(server.slides[0].notes).toBe("Private notes written offline.");
  const recoveredText = "An offline edit recovered after closing the tab.";
  await context.setOffline(true);
  await page.getByLabel("Content", { exact: true }).fill(recoveredText);
  await page.getByLabel("Content", { exact: true }).press("Tab");
  await expect(
    page.getByRole("button", {
      name: "Offline · saved on this device",
      exact: true,
    }),
  ).toBeVisible();
  await page.close();
  await context.setOffline(false);
  const restored = await context.newPage();
  await restored.goto(url);
  await expect(
    restored.getByText("An unsaved version from this device is available.", {
      exact: true,
    }),
  ).toBeVisible();
  server = await (await restored.request.get(`/api/decks/${id}`)).json();
  expect(JSON.stringify(server)).not.toContain(recoveredText);
  await restored
    .getByRole("button", { name: "Recover changes", exact: true })
    .click();
  await expect(
    restored.getByText("All changes saved", { exact: true }),
  ).toBeVisible();
  await expect(
    restored.getByRole("region", { name: "Slide canvas" }),
  ).toContainText(recoveredText);
  await expect(
    restored.getByLabel("Speaker notes", { exact: true }),
  ).toHaveValue("Private notes written offline.");
  await restored.route(`**/api/decks/${id}`, async (route) => {
    if (route.request().method() === "PUT")
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Save unavailable. Your device copy is retained.",
        }),
      });
    else await route.continue();
  });
  await restored
    .getByRole("region", { name: "Slide canvas" })
    .getByText(recoveredText, { exact: true })
    .click();
  const finalText = "A failed save must keep this work until retry succeeds.";
  await restored.getByLabel("Content", { exact: true }).fill(finalText);
  await restored.getByLabel("Content", { exact: true }).press("Tab");
  await expect(
    restored.getByRole("button", { name: "Save failed · retry", exact: true }),
  ).toBeVisible();
  await expect(restored.getByRole("alert")).toContainText("Save unavailable");
  await expect(restored.getByLabel("Content", { exact: true })).toHaveValue(
    finalText,
  );
  server = await (await restored.request.get(`/api/decks/${id}`)).json();
  expect(JSON.stringify(server)).toContain(recoveredText);
  expect(JSON.stringify(server)).not.toContain(finalText);
  await checkA11y(restored);
  await restored.unroute(`**/api/decks/${id}`);
  await restored
    .getByRole("button", { name: "Retry saving", exact: true })
    .click();
  await expect(
    restored.getByText("All changes saved", { exact: true }),
  ).toBeVisible();
  await restored.reload();
  await expect(
    restored.getByRole("region", { name: "Slide canvas" }),
  ).toContainText(finalText);
  await expect(
    restored.getByText("An unsaved version from this device is available.", {
      exact: true,
    }),
  ).not.toBeVisible();
});
