import { test, expect } from "@playwright/test";
import { signup, checkA11y } from "./helpers";
import type { AIJob } from "../shared/ai";
test("generation explains long waits, keeps real steps, and distinguishes reconnects from running work", async ({
  page,
}) => {
  await signup(page);
  let disconnected = false,
    staleHeartbeat = false;
  const job: AIJob = {
    id: "preview-job",
    presentationId: null,
    kind: "outline",
    status: "running",
    progress: { step: "Writing the story", percent: 30 },
    attempts: 1,
    result: null,
    error: null,
    createdAt: new Date(Date.now() - 65000).toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await page.route("**/api/jobs/*", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    if (disconnected) return route.abort("failed");
    await route.fulfill({
      json: {
        ...job,
        id: route.request().url().split("/").pop(),
        updatedAt: new Date(
          Date.now() - (staleHeartbeat ? 50000 : 0),
        ).toISOString(),
      },
    });
  });
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page
    .getByLabel("Presentation idea")
    .fill("How a team can give useful feedback");
  await page
    .getByRole("button", { name: "Choose a look", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Choose Y2K theme", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Use this look", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Continue without sources", exact: true })
    .click();
  const progress = page.getByRole("region", { name: "Generation progress" });
  await expect(
    progress.getByRole("heading", { name: "Writing the story" }),
  ).toBeVisible();
  await expect(progress).toContainText(
    "The complete outline arrives in one response.",
  );
  await expect(progress).toContainText(
    "Still waiting for the AI’s full response",
  );
  await expect(progress).toContainText("Step 2 of 3");
  const before = await progress.getByRole("timer").textContent();
  await expect
    .poll(async () => progress.getByRole("timer").textContent())
    .not.toBe(before);
  await expect(progress.locator('[aria-current="step"]')).toContainText(
    "Writing the story",
  );
  await checkA11y(page);
  await page.screenshot({ path: "/tmp/frame-progress-desktop.png" });
  disconnected = true;
  await expect(progress).toContainText("Reconnecting to your generation");
  await expect(progress).not.toContainText("Generation in progress");
  disconnected = false;
  staleHeartbeat = true;
  await expect(progress).toContainText("Waiting for a fresh server update");
  await expect(progress).toContainText("Last known step");
  staleHeartbeat = false;
  job.progress = { step: "Checking the details", percent: 95 };
  job.kind = "generate";
  await expect(progress).toContainText("Checking the details");
  await expect(progress).toContainText(
    "Rendering the slides to check text fits",
  );
  await expect(progress).toContainText("Step 4 of 4");
  await expect(progress).not.toContainText(
    "Still waiting for the AI’s full response",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect
    .poll(async () =>
      progress
        .locator(".story-job-mark svg")
        .evaluate((node) => getComputedStyle(node).animationName),
    )
    .toBe("none");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await checkA11y(page);
  await page.screenshot({
    path: "/tmp/frame-progress-mobile.png",
    fullPage: true,
  });
  job.status = "queued";
  job.attempts = 2;
  await expect(progress).toContainText("A retry is scheduled.");
  await expect(progress).toContainText("retry automatically");
  await expect(progress.locator('[aria-current="step"]')).toHaveCount(0);
  job.status = "failed";
  job.error = "The AI provider could not finish this attempt.";
  await expect(
    progress.getByRole("heading", { name: "This attempt couldn’t finish." }),
  ).toBeVisible();
  await expect(
    progress.getByRole("button", { name: "Start a new attempt" }),
  ).toBeVisible();
  await expect(
    progress.getByRole("button", { name: "Cancel generation" }),
  ).toHaveCount(0);
});
