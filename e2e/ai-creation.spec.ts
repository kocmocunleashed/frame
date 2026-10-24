import { test, expect, type Page } from "@playwright/test";
import { signup, checkA11y } from "./helpers";
async function idea(page: Page) {
  await page
    .getByRole("button", {
      name: "Create",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "About what?", exact: true }),
  ).toBeVisible();
}
async function brief(page: Page, topic = "A workshop on useful feedback") {
  await page.getByLabel("Presentation idea", { exact: true }).fill(topic);
  await page.getByRole("slider", { name: "Slide count", exact: true }).focus();
  await page
    .getByRole("slider", { name: "Slide count", exact: true })
    .press("Home");
  await expect(
    page.getByRole("slider", { name: "Slide count", exact: true }),
  ).toHaveValue("3");
  await page
    .getByRole("button", { name: "Choose a look", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Choose Rage theme", exact: true })
    .click();
  await expect(page.locator(".creation-studio")).toHaveAttribute(
    "data-theme",
    "look-rage",
  );
  await page
    .getByRole("button", { name: "Use this look", exact: true })
    .click();
}
test("idea, real source extraction, reviewed outline, slide preview, create, edit and reload form one workflow", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await signup(page);
  await idea(page);
  await brief(page);
  await page
    .getByLabel("Upload source document", { exact: true })
    .setInputFiles({
      name: "feedback-notes.txt",
      mimeType: "text/plain",
      buffer: Buffer.from(
        "Useful feedback describes an observable action and a practical next step.",
      ),
    });
  await expect(
    page.getByRole("button", { name: "Inspect text", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Inspect text", exact: true }).click();
  await expect(
    page.getByLabel("Extracted source text", { exact: true }),
  ).toContainText("observable action");
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByLabel("Include feedback-notes.txt", { exact: true }).check();
  await page
    .getByRole("button", { name: "Build outline", exact: true })
    .click();
  await expect(
    page.getByLabel("Section 1 title", { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Section 2 title", { exact: true })
    .fill("Feedback people can use");
  await page
    .getByRole("button", { name: "Move section 2 up", exact: true })
    .click();
  await expect(page.getByLabel("Section 1 title", { exact: true })).toHaveValue(
    "Feedback people can use",
  );
  await page.getByRole("button", { name: "Add section", exact: true }).click();
  await expect(page.getByLabel("Section 4 title", { exact: true })).toHaveValue(
    "A new idea",
  );
  await page
    .getByRole("button", { name: "Remove section 4", exact: true })
    .click();
  await page.screenshot({ path: "/tmp/frame-ai-outline.png" });
  await checkA11y(page);
  await page
    .getByRole("button", { name: "Generate slide preview", exact: true })
    .click();
  await expect(page.locator(".generated-slide-card")).toHaveCount(3);
  await page
    .getByText("Notes, sources & things to check", { exact: false })
    .click();
  await expect(page.locator(".review-details")).toContainText(
    "feedback-notes.txt",
  );
  await expect(page.locator(".review-details")).toContainText(
    "observable action",
  );
  await page.screenshot({ path: "/tmp/frame-ai-preview.png" });
  await checkA11y(page);
  await page
    .getByRole("button", { name: "Create editable presentation", exact: true })
    .click();
  await expect(
    page.getByLabel("Presentation title", { exact: true }),
  ).toHaveValue("A workshop on useful feedback");
  await expect(page.locator(".editable-stage")).toContainText(
    "Feedback people can use",
  );
  await page.reload();
  await expect(page.locator(".editable-stage")).toContainText(
    "Feedback people can use",
  );
  expect(errors).toEqual([]);
});
test("quick draft skips review, survives navigation and creates a preview from the workspace draft", async ({
  page,
}) => {
  await signup(page);
  await idea(page);
  await brief(page, "A quick product story");
  await page.getByText("Make a quick first draft", { exact: true }).click();
  await page
    .getByRole("button", { name: "Generate slide preview", exact: true })
    .click();
  await page.getByRole("button", { name: "Workspace", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Creation drafts", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /A quick product story/ }).click();
  await expect(page.locator(".generated-slide-card")).toHaveCount(3);
  await page.reload();
  await expect(page.locator(".generated-slide-card")).toHaveCount(3);
  await page
    .getByRole("button", { name: "Create editable presentation", exact: true })
    .click();
  await expect(
    page.getByLabel("Presentation title", { exact: true }),
  ).toHaveValue("A quick product story");
});
test("creation has an honest unconfigured state and usable narrow-screen source review", async ({
  page,
}) => {
  await signup(page);
  await page.route("**/api/ai/status", async (route) =>
    route.fulfill({ json: { configured: false, provider: "OpenAI" } }),
  );
  await idea(page);
  await brief(page, "A saved idea without a provider");
  await expect(
    page.getByText("AI needs a server connection.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Continue without sources", exact: true }),
  ).toBeDisabled();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Paste text", exact: true }).click();
  await page.getByLabel("Source name", { exact: true }).fill("My notes");
  await page
    .getByLabel("Source text", { exact: true })
    .fill("A useful source can be saved before AI is enabled.");
  await page.getByRole("button", { name: "Add source", exact: true }).click();
  await expect(
    page.getByLabel("Include My notes", { exact: true }),
  ).toBeChecked();
  await page.screenshot({ path: "/tmp/frame-ai-mobile.png" });
  await checkA11y(page);
});
test("scoped AI previews leave the document alone until apply, then share undo and preserve unrelated content", async ({
  page,
}) => {
  await signup(page);
  await page
    .getByRole("button", { name: "New presentation", exact: true })
    .click();
  await page
    .getByLabel("Presentation name", { exact: true })
    .fill("AI editor verification");
  await page
    .getByRole("button", { name: "Create presentation", exact: true })
    .click();
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await page.getByLabel("Content", { exact: true }).fill("My original words.");
  await page.getByLabel("Content", { exact: true }).press("Tab");
  await expect(
    page.getByText("All changes saved", { exact: true }),
  ).toBeVisible();
  const documentId = new URL(page.url()).pathname.split("/").at(-1);
  const before = await (
    await page.request.get(`/api/decks/${documentId}`)
  ).json();
  await page.getByRole("button", { name: "Edit with AI", exact: true }).click();
  const modal = page.getByRole("dialog", { name: "Edit with AI", exact: true });
  await expect(
    modal.getByLabel("AI editing scope", { exact: true }),
  ).toHaveValue("objects");
  await modal
    .getByLabel("AI edit instruction", { exact: true })
    .fill("Make these words clearer for beginners.");
  await modal
    .getByRole("button", { name: "Preview edit", exact: true })
    .click();
  await expect(
    modal.getByText("Proposed changes", { exact: true }),
  ).toBeVisible();
  const untouched = await (
    await page.request.get(`/api/decks/${documentId}`)
  ).json();
  expect(untouched.slides).toEqual(before.slides);
  await checkA11y(page);
  await page.screenshot({ path: "/tmp/frame-ai-edit-preview.png" });
  await modal
    .getByRole("button", { name: "Apply proposed changes", exact: true })
    .click();
  await expect(page.locator(".editable-stage")).toContainText(
    "Clearer words for your audience.",
  );
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator(".editable-stage")).toContainText(
    "My original words.",
  );
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.locator(".editable-stage")).toContainText(
    "Clearer words for your audience.",
  );
  await expect(
    page.getByText("All changes saved", { exact: true }),
  ).toBeVisible();
  const after = await (
    await page.request.get(`/api/decks/${documentId}`)
  ).json();
  expect(after.slides[0].elements[0].id).toBe(before.slides[0].elements[0].id);
  expect(after.slides[0].elements[0].x).toBe(before.slides[0].elements[0].x);
  await page.getByRole("button", { name: "Edit with AI", exact: true }).click();
  await modal
    .getByRole("button", { name: "Regenerate current slide", exact: true })
    .click();
  await expect(
    modal.getByText("A refreshed current slide.", { exact: true }),
  ).toBeVisible();
  await modal
    .getByRole("button", { name: "Apply proposed changes", exact: true })
    .click();
  await expect(page.locator(".editable-stage")).toContainText(
    "A refreshed point of view.",
  );
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator(".editable-stage")).toContainText(
    "Clearer words for your audience.",
  );
});
test("failed draft saves retain local work and recover into a separate creation draft after reload", async ({
  page,
}) => {
  await signup(page);
  await idea(page);
  const originalUrl = page.url();
  await page.route("**/api/creation/*", async (route) =>
    route.request().method() === "PUT"
      ? route.fulfill({
          status: 503,
          json: { error: "Draft storage temporarily unavailable." },
        })
      : route.continue(),
  );
  await page
    .getByLabel("Presentation idea", { exact: true })
    .fill("An unsaved idea worth keeping");
  await expect(
    page.getByText("Save failed · draft preserved", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", {
      name: "There’s a device draft to recover.",
      exact: true,
    }),
  ).toBeVisible();
  await page.unroute("**/api/creation/*");
  await page
    .getByRole("button", { name: "Recover as a separate draft", exact: true })
    .click();
  await expect(
    page.getByLabel("Presentation idea", { exact: true }),
  ).toHaveValue("An unsaved idea worth keeping");
  expect(page.url()).not.toBe(originalUrl);
  const originalId = new URL(originalUrl).pathname.split("/").at(-1);
  const original = await (
    await page.request.get(`/api/creation/${originalId}`)
  ).json();
  expect(original.data.brief.topic).toBe("");
});
