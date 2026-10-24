import { test, expect } from "@playwright/test";
import { signup } from "../e2e/helpers";
import { newElement } from "../shared/operations";
import { cpus } from "node:os";
test("record pointer latency on a 100-slide document with bounded mounted thumbnails", async ({
  page,
  browser,
}) => {
  await signup(page);
  const doc = await (
    await page.request.post("/api/decks", {
      data: {
        title: "100-slide pointer fixture",
        template: "blank",
        themeId: "studio",
      },
    })
  ).json();
  doc.slides = Array.from({ length: 100 }, (_, i) => ({
    ...doc.slides[0],
    id: crypto.randomUUID(),
    title: `Slide ${i + 1}`,
    elements: Array.from({ length: 10 }, (_, j) =>
      newElement("text", {
        text: `Illustrative point ${i + 1}.${j + 1}`,
        x: 64 + (j % 2) * 600,
        y: 40 + Math.floor(j / 2) * 120,
        width: 500,
        height: 90,
      }),
    ),
  }));
  expect(
    (
      await page.request.put(`/api/decks/${doc.id}`, {
        data: { baseRevision: 0, document: doc },
      })
    ).ok(),
  ).toBe(true);
  await page.goto(`/deck/${doc.id}`);
  await expect(page.locator(".editable-stage")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const mounted = await page.locator(".slide-rail-list .slide-stage").count();
  expect(mounted).toBeLessThan(20);
  const canvas = page.getByRole("region", { name: "Slide canvas" }),
    box = (await canvas.boundingBox())!;
  await page.evaluate(() => {
    (window as any).framePointerSamples = [];
    document.addEventListener(
      "pointermove",
      () => {
        const start = performance.now();
        requestAnimationFrame(() => {
          (window as any).framePointerSamples.push(performance.now() - start);
        });
      },
      { capture: true },
    );
  });
  await page.mouse.move(
    box.x + (80 * box.width) / 1280,
    box.y + (70 * box.width) / 1280,
  );
  await page.mouse.down();
  await page.mouse.move(
    box.x + (180 * box.width) / 1280,
    box.y + (130 * box.width) / 1280,
    { steps: 90 },
  );
  await page.mouse.up();
  await expect(
    page.getByText("All changes saved", { exact: true }),
  ).toBeVisible();
  const samples: number[] = await page.evaluate(
    () => (window as any).framePointerSamples,
  );
  expect(samples.length).toBeGreaterThan(30);
  samples.sort((a, b) => a - b);
  const measurement = {
    event: "editor_capacity_measurement",
    cpu: cpus()[0]?.model,
    browser: browser.version(),
    viewport: { width: 1440, height: 1000 },
    slides: 100,
    elementsPerSlide: 10,
    mountedThumbnails: mounted,
    samples: samples.length,
    p95PointerToAnimationFrameMs: samples[Math.ceil(samples.length * 0.95) - 1],
    targetMs: 50,
  };
  console.log(JSON.stringify(measurement));
  await test
    .info()
    .attach("capacity", {
      body: JSON.stringify(measurement, null, 2),
      contentType: "application/json",
    });
});
