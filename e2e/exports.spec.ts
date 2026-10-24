import { test, expect } from "@playwright/test";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { unzipSync } from "fflate";
import { signup, checkA11y } from "./helpers";
test("export each format, reopen standalone HTML offline and keep published downloads permissioned", async ({
  page,
  browser,
}) => {
  test.setTimeout(120000);
  await signup(page);
  await page
    .getByRole("button", {
      name: "Open Illustrative story — make it yours",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const panel = page.getByRole("dialog", {
    name: "Export presentation",
    exact: true,
  });
  await expect(panel).toBeVisible();
  await checkA11y(page);
  const folder = await mkdtemp(join(tmpdir(), "frame-export-browser-"));
  try {
    for (const item of [
      { format: "pdf", name: "PDF", extension: "pdf" },
      { format: "images", name: "Slide images", extension: "zip" },
      { format: "html", name: "Standalone HTML", extension: "html" },
      { format: "pptx", name: "Image-based PowerPoint", extension: "pptx" },
    ]) {
      await panel.locator(`input[value=${item.format}]`).check();
      const started = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          /\/exports$/.test(new URL(response.url()).pathname),
      );
      await panel
        .getByRole("button", { name: `Create ${item.name}`, exact: true })
        .click();
      const response = await started;
      expect(response.status()).toBe(202);
      const created = await response.json();
      const job = panel.locator(`[data-export-job="${created.id}"]`);
      await expect(job.getByRole("button", { name: /^Download / })).toBeVisible(
        { timeout: 45000 },
      );
      const pending = page.waitForEvent("download");
      await job.getByRole("button", { name: /^Download / }).click();
      const file = await pending,
        path = join(folder, `presentation.${item.extension}`);
      await file.saveAs(path);
      const bytes = await readFile(path);
      expect(bytes.length).toBeGreaterThan(1000);
      if (item.format === "pdf")
        expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
      if (item.format === "images")
        expect(
          Object.keys(unzipSync(bytes)).filter((k) => k.endsWith(".png"))
            .length,
        ).toBeGreaterThan(1);
      if (item.format === "html") {
        const offline = await browser.newContext({
            offline: true,
            viewport: { width: 390, height: 844 },
            reducedMotion: "reduce",
          }),
          viewer = await offline.newPage();
        const errors: string[] = [];
        viewer.on("pageerror", (err) => errors.push(err.message));
        try {
          await viewer.goto(pathToFileURL(path).href);
          await expect(viewer.locator("body")).toHaveAttribute(
            "data-frame-initialized",
            "true",
          );
          await expect(viewer.locator("#frame-counter")).toContainText("1 /");
          await viewer.keyboard.press("ArrowRight");
          await expect(viewer.locator("#frame-counter")).toContainText("2 /");
          await viewer
            .getByRole("button", { name: "Slides", exact: true })
            .click();
          await expect(
            viewer.getByRole("dialog", { name: "Slide overview", exact: true }),
          ).toBeVisible();
          await viewer.getByRole("button", { name: /^3\./ }).click();
          await expect(viewer.locator("#frame-counter")).toContainText("3 /");
          expect(
            await viewer.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
          ).toBe(true);
          expect(errors).toEqual([]);
          await viewer.screenshot({
            path: "/tmp/frame-export-offline-mobile.png",
          });
        } finally {
          await offline.close();
        }
      }
      if (item.format === "pptx") {
        expect(Object.keys(unzipSync(bytes))).toContain("ppt/presentation.xml");
        await expect(job).toContainText("Image-based PowerPoint");
      }
    }
    await page.screenshot({ path: "/tmp/frame-export-panel.png" });
    await panel
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Publish & share", exact: true })
      .click();
    const share = page.getByRole("dialog", {
      name: "Publish & share",
      exact: true,
    });
    await share
      .getByRole("checkbox", {
        name: /Allow PDF and standalone HTML downloads/,
      })
      .check();
    await share
      .getByRole("button", { name: "Publish version", exact: true })
      .click();
    await expect(
      share.getByText("PDF and HTML downloads are ready.", { exact: true }),
    ).toBeVisible({ timeout: 45000 });
    const url = await share
        .getByLabel("Published presentation link", { exact: true })
        .inputValue(),
      guest = await browser.newContext(),
      viewer = await guest.newPage();
    try {
      await viewer.goto(url);
      await viewer
        .getByRole("button", { name: "Download presentation", exact: true })
        .click();
      const downloadModal = viewer.getByRole("dialog", {
        name: "Download presentation",
        exact: true,
      });
      await expect(
        downloadModal.getByRole("button", { name: /Download PDF/ }),
      ).toBeVisible();
      const pending = viewer.waitForEvent("download");
      await downloadModal.getByRole("button", { name: /Download PDF/ }).click();
      expect((await pending).suggestedFilename()).toMatch(/\.pdf$/);
      await checkA11y(viewer);
      const payload = await (
        await viewer.request.get(
          `/api/publications/${new URL(url).pathname.split("/").at(-1)}`,
        )
      ).json();
      const href = payload.downloads[0].href;
      await share
        .getByRole("button", { name: "Revoke link", exact: true })
        .click();
      await expect(
        share.getByText("Link revoked. Publishing again creates a new link.", {
          exact: true,
        }),
      ).toBeVisible();
      expect((await viewer.request.get(href)).status()).toBe(410);
    } finally {
      await guest.close();
    }
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
test("Vite denies private database, uploaded assets and export storage paths", async ({
  page,
}) => {
  await signup(page);
  const root = "/tmp/frame-browser-tests";
  await mkdir(`${root}/assets`, { recursive: true });
  await mkdir(`${root}/exports`, { recursive: true });
  await writeFile(`${root}/assets/private-image`, "PRIVATE_ASSET_TEST_BYTES");
  await writeFile(
    `${root}/exports/private-export`,
    "PRIVATE_EXPORT_TEST_BYTES",
  );
  try {
    for (const path of [
      "/@fs/tmp/frame-browser-tests/frame.sqlite",
      "/@fs/tmp/frame-browser-tests/frame.sqlite-wal",
      "/@fs/tmp/frame-browser-tests/assets/private-image",
      "/@fs/tmp/frame-browser-tests/exports/private-export",
      "/@fs/home/leohunt/frame/.frame-data/frame.sqlite",
      "/.frame-data/frame.sqlite",
      "/.env",
      "/server/ai-provider.ts",
      "/server/openrouter.ts",
    ]) {
      const response = await page.request.get(path);
      expect(response.status(), path).toBe(403);
    }
  } finally {
    await rm(`${root}/assets/private-image`, { force: true });
    await rm(`${root}/exports/private-export`, { force: true });
  }
});
