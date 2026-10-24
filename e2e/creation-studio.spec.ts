import { test, expect, type Page } from "@playwright/test";
import {FEATURED_THEMES} from "../shared/featured-themes";
import { signup, checkA11y } from "./helpers";
async function start(page: Page) {
  await signup(page);
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "About what?", exact: true }),
  ).toBeVisible();
}
async function look(page: Page) {
  await page
    .getByLabel("Presentation idea")
    .fill("A better way to give useful feedback");
  await page.getByRole("slider", { name: "Slide count" }).focus();
  await page.getByRole("slider", { name: "Slide count" }).press("Home");
  await page
    .getByRole("button", { name: "Choose a look", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Choose a look.", exact: true }),
  ).toBeVisible();
}
test("the brief is simple, keeps length visible, and saves advanced details through reload", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await start(page);
  const slider = page.getByRole("slider", { name: "Slide count" });
  await expect(slider).toHaveValue("8");
  expect(
    (await slider.boundingBox())!.y + (await slider.boundingBox())!.height,
  ).toBeLessThan(768);
  await expect(
    page.getByRole("button", { name: "Choose a look", exact: true }),
  ).toBeDisabled();
  await expect(page.getByLabel("Presentation audience")).toBeHidden();
  await slider.focus();
  await slider.press("End");
  await expect(slider).toHaveValue("30");
  await slider.press("Home");
  await expect(slider).toHaveValue("3");
  await page.getByText("More details", { exact: true }).click();
  await page.getByLabel("Presentation audience").fill("New team leads");
  await page
    .getByLabel("Presentation requirements")
    .fill("Use practical examples.");
  await page
    .getByLabel("Presentation idea")
    .fill("Useful feedback for new leads");
  await page
    .getByRole("button", { name: "Choose a look", exact: true })
    .click();
  await expect(page.getByRole("heading", {name:"Choose a look.",exact:true})).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Choose a look.", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "Presentation creation" })
    .getByRole("button", { name: "01 Idea" })
    .click();
  await page.getByText("More details", { exact: true }).click();
  await expect(page.getByLabel("Presentation audience")).toHaveValue(
    "New team leads",
  );
  await expect(page.getByLabel("Presentation requirements")).toHaveValue(
    "Use practical examples.",
  );
  await expect(slider).toHaveValue("3");
  await page.screenshot({ path: "/tmp/frame-redesign-brief-desktop.png" });
  await checkA11y(page);
});
test("curated themes loop with keyboard and pointer, show real compositions, and carry their look into context", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await start(page);
  await look(page);
  const studio = page.locator(".creation-studio");
  const names = [
    "Monochrome",
    "Rage",
    "Liquid glass",
    "Material You",
    "Retro future",
    "Y2K",
    "Nostalgia",
    "Clay",
    "Terminal",
  ];
  const ids = [
    "monochrome",
    "rage",
    "liquid",
    "material",
    "future",
    "y2k",
    "nostalgia",
    "clay",
    "terminal",
  ];
  await expect(page.locator(".theme-carousel-item")).toHaveCount(FEATURED_THEMES.length);
  const carousel = page.getByRole("region", {
    name: "Presentation themes",
    exact: true,
  });
  // Works immediately on entry, while the page heading still has focus.
  await page.keyboard.press("ArrowLeft");
  await expect(studio).toHaveAttribute("data-theme", FEATURED_THEMES.at(-1)!.id);
  await page.keyboard.press("ArrowRight");
  await expect(studio).toHaveAttribute("data-theme", "look-monochrome");
  // Ordinary buttons also allow browsing; the focused carousel moves only once.
  await page.getByRole("button", { name: "Cover", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(studio).toHaveAttribute("data-theme", "look-rage");
  await carousel.focus();
  await page.keyboard.press("ArrowRight");
  await expect(studio).toHaveAttribute("data-theme", "look-liquid");
  await page.keyboard.press("Shift+ArrowRight");
  await expect(studio).toHaveAttribute("data-theme", "look-liquid");
  await page.keyboard.press("Home");
  await expect(studio).toHaveAttribute("data-theme", "look-monochrome");
  for (let i = 0; i < names.length; i++) {
    await page
      .getByRole("button", { name: `Choose ${names[i]} theme`, exact: true })
      .click();
    await expect(studio).toHaveAttribute("data-theme", `look-${ids[i]}`);
    await page.getByRole("button", { name: "Content", exact: true }).click();
    await expect(
      page.locator(".theme-carousel-item.is-selected .slide-stage"),
    ).toContainText("From idea to action.");
    await page.screenshot({
      path: `/tmp/frame-redesign-content-${ids[i]}.png`,
    });
    await page
      .locator(".theme-carousel-item.is-selected .theme-carousel-slide")
      .screenshot({ path: `/tmp/frame-distinct-content-${ids[i]}.png` });
    await page.getByRole("button", { name: "Data", exact: true }).click();
    await expect(
      page.locator(".theme-carousel-item.is-selected").getByRole("img"),
    ).toHaveCount(0); // artwork is announced once by its theme label
    await page.screenshot({ path: `/tmp/frame-redesign-data-${ids[i]}.png` });
    await page
      .locator(".theme-carousel-item.is-selected .theme-carousel-slide")
      .screenshot({ path: `/tmp/frame-distinct-data-${ids[i]}.png` });
    await page.getByRole("button", { name: "Cover", exact: true }).click();
    await expect
      .poll(async () =>
        page
          .locator(".theme-carousel-item.is-selected [data-text-id]")
          .evaluateAll((nodes) =>
            nodes
              .filter((node) => node.textContent?.trim())
              .every(
                (node) =>
                  node.scrollHeight <= node.clientHeight + 2 &&
                  node.scrollWidth <= node.clientWidth + 2,
              ),
          ),
      )
      .toBe(true);
    await checkA11y(page);
    await page
      .locator(".theme-carousel-item.is-selected .theme-carousel-slide")
      .screenshot({ path: `/tmp/frame-distinct-cover-${ids[i]}.png` });
    await page.screenshot({ path: `/tmp/frame-redesign-theme-${ids[i]}.png` });
  }
  await page
    .getByRole("button", { name: "Your themes & brand", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Design library", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close dialog", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(studio).toHaveAttribute("data-theme", "look-terminal");
  await page.getByRole("tab", { name: "Saved themes", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("tab", { name: "Brand kits", exact: true }),
  ).toBeFocused();
  await expect(studio).toHaveAttribute("data-theme", "look-terminal");
  await checkA11y(page);
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page
    .getByRole("button", { name: "Choose Clay theme", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Use this look", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Give it some depth.", exact: true }),
  ).toBeVisible();
  await expect(studio).toHaveAttribute("data-theme", "look-clay");
  await page.keyboard.press("ArrowRight");
  await expect(studio).toHaveAttribute("data-theme", "look-clay");
  await page.reload();
  await expect(studio).toHaveAttribute("data-theme", "look-clay");
  await expect(
    page.getByRole("heading", { name: "Give it some depth.", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: "/tmp/frame-redesign-context-clay.png" });
  await checkA11y(page);
});
test("mobile theme swipes preserve vertical scrolling and the selected theme survives back navigation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await start(page);
  await look(page);
  const viewport = page.locator(".theme-carousel-viewport");
  const box = (await viewport.boundingBox())!;
  const client = await page.context().newCDPSession(page);
  await client.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: 315, y: box.y + box.height / 2 }],
  });
  for (const x of [280, 230, 180, 130, 75])
    await client.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x, y: box.y + box.height / 2 }],
    });
  await client.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect(page.locator(".creation-studio")).not.toHaveAttribute(
    "data-theme",
    "look-monochrome",
  );
  await page
    .getByRole("button", { name: "Choose Liquid glass theme", exact: true })
    .click();
  await expect(page.locator(".creation-studio")).toHaveAttribute(
    "data-theme",
    "look-liquid",
  );
  await page
    .getByRole("button", { name: "Use this look", exact: true })
    .click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Paste text", exact: true }).click();
  await page.getByLabel("Source name").fill("Working notes");
  await checkA11y(page);
  await page
    .getByLabel("Source text", { exact: true })
    .fill("Good feedback starts with a specific observation.");
  await page.getByRole("button", { name: "Add source", exact: true }).click();
  await expect(page.getByLabel("Include Working notes")).toBeChecked();
  await page
    .getByRole("button", { name: "Choose a look", exact: true })
    .click();
  await expect(page.locator(".creation-studio")).toHaveAttribute(
    "data-theme",
    "look-liquid",
  );
  await page.screenshot({ path: "/tmp/frame-redesign-theme-mobile.png" });
  await checkA11y(page);
});
test("slide review rehearses real question feedback and reveals locally, then creates an editable deck", async ({
  page,
}) => {
  const errors: string[] = [],
    liveRequests: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));
  page.on("request", (request) => {
    if (request.url().includes("/api/live")) liveRequests.push(request.url());
  });
  await start(page);
  await look(page);
  await page
    .getByRole("button", { name: "Choose Terminal theme", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Use this look", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Continue without sources", exact: true })
    .click();
  await page.getByLabel("Section 2 layout").selectOption("questions");
  await page
    .getByRole("button", { name: "Generate slide preview", exact: true })
    .click();
  await expect(page.locator(".review-stage")).toBeVisible({ timeout: 30000 });
  await page.getByRole("button", { name: /^Preview slide 2:/ }).click();
  await page
    .getByRole("button", { name: "Try interactions", exact: true })
    .click();
  await page
    .getByRole("button", { name: "A specific observation", exact: true })
    .click();
  await expect(page.locator(".review-question")).toContainText("Correct.");
  await expect(page.locator(".review-question")).toContainText(
    "practical starting point",
  );
  expect(liveRequests).toEqual([]);
  await page
    .getByRole("button", { name: "Restart slide", exact: true })
    .click();
  await expect(page.locator(".review-question [role=status]")).toHaveCount(0);
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await expect(
    page.locator(".review-overview .generated-slide-card"),
  ).toHaveCount(3);
  await page.locator(".review-overview .generated-slide-card").last().click();
  await page
    .getByRole("button", { name: "Next preview slide or step", exact: true })
    .click();
  await page.screenshot({ path: "/tmp/frame-redesign-slides-terminal.png" });
  await checkA11y(page);
  await page
    .getByRole("button", { name: "Create editable presentation", exact: true })
    .click();
  await expect(page.locator(".editable-stage")).toBeVisible();
  await page.reload();
  await expect(page.locator(".editable-stage")).toBeVisible();
  expect(errors).toEqual([]);
});
