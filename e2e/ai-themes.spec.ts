import { test, expect } from "@playwright/test";
import sharp from "sharp";
import { signup, checkA11y } from "./helpers";
test("describe with a reference, refine, remove the reference, edit tokens, save and use an AI theme", async ({
  page,
}) => {
  await signup(page);
  await page.getByRole("button", { name: "Themes", exact: true }).click();
  await page
    .getByRole("button", { name: "Design library & brand kits", exact: true })
    .click();
  const library = page.getByRole("dialog", {
    name: "Design library",
    exact: true,
  });
  await library
    .getByRole("button", { name: "Describe a theme", exact: true })
    .click();
  const builder = page.getByRole("dialog", {
    name: "Describe a theme",
    exact: true,
  });
  await builder
    .getByLabel("AI theme description", { exact: true })
    .fill("A midnight stage with bright lime accents.");
  const png = await sharp({
    create: { width: 160, height: 90, channels: 3, background: "#2347dd" },
  })
    .png()
    .toBuffer();
  await builder
    .getByLabel("Upload theme reference", { exact: true })
    .setInputFiles({
      name: "direction.png",
      mimeType: "image/png",
      buffer: png,
    });
  await expect(builder.locator(".theme-reference")).toBeVisible();
  await builder
    .getByRole("button", { name: "Generate theme", exact: true })
    .click();
  await expect(
    builder.getByRole("heading", { name: "Midnight signal", exact: true }),
  ).toBeVisible();
  await builder.getByRole("button", { name: "Data", exact: true }).click();
  await expect(builder.locator('svg[role="img"]')).toBeVisible();
  await builder
    .getByRole("button", { name: "Remove theme reference", exact: true })
    .click();
  await builder
    .getByLabel("AI theme description", { exact: true })
    .fill("Make the corners more rounded.");
  await builder
    .getByRole("button", { name: "Refine this direction", exact: true })
    .click();
  await expect(
    builder.getByRole("heading", {
      name: "Midnight signal refined",
      exact: true,
    }),
  ).toBeVisible();
  const jobs = await (await page.request.get("/api/theme-jobs")).json();
  expect(jobs[0].result.referenceAssetId).toBeNull();
  await page.screenshot({ path: "/tmp/frame-ai-theme.png" });
  await checkA11y(page);
  await builder
    .getByRole("button", { name: "Use in theme designer", exact: true })
    .click();
  await expect(
    library.getByRole("spinbutton", { name: "Corner radius", exact: true }),
  ).toHaveValue("36");
  await library
    .getByLabel("Theme name", { exact: true })
    .fill("Workshop signal");
  await library
    .getByRole("button", { name: "Save theme", exact: true })
    .click();
  await expect(library.getByText(/Saved to workspace/)).toBeVisible();
  await library.getByRole("button", { name: "Use theme", exact: true }).click();
  await page
    .getByLabel("Presentation name", { exact: true })
    .fill("An AI styled deck");
  await page
    .getByRole("button", { name: "Create presentation", exact: true })
    .click();
  await expect(
    page.getByText("All changes saved", { exact: true }),
  ).toBeVisible();
  const id = new URL(page.url()).pathname.split("/").at(-1),
    doc = await (await page.request.get(`/api/decks/${id}`)).json();
  const theme = doc.themes.find((t: { id: string }) => t.id === doc.themeId);
  expect(theme.name).toBe("Workshop signal");
  expect(theme.radius).toBe(36);
  await page.reload();
  await expect(
    page.getByText("All changes saved", { exact: true }),
  ).toBeVisible();
});
test("AI theme generation exposes an honest setup state while manual design stays available", async ({
  page,
}) => {
  await signup(page);
  await page.route("**/api/ai/status", async (route) =>
    route.fulfill({ json: { configured: false } }),
  );
  await page.getByRole("button", { name: "Themes", exact: true }).click();
  await page
    .getByRole("button", { name: "Design library & brand kits", exact: true })
    .click();
  const library = page.getByRole("dialog", {
    name: "Design library",
    exact: true,
  });
  await library
    .getByRole("button", { name: "Describe a theme", exact: true })
    .click();
  const builder = page.getByRole("dialog", {
    name: "Describe a theme",
    exact: true,
  });
  await builder
    .getByLabel("AI theme description", { exact: true })
    .fill("A warm editorial direction");
  await expect(
    builder.getByText("AI needs a server connection.", { exact: true }),
  ).toBeVisible();
  await expect(
    builder.getByRole("button", { name: "Generate theme", exact: true }),
  ).toBeDisabled();
  await builder
    .getByRole("button", { name: "Close dialog", exact: true })
    .click();
  await expect(library.getByLabel("Theme name", { exact: true })).toBeEnabled();
});
