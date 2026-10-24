// Fixed rendering code, never model-generated JavaScript. This process receives
// projected HTML in a private temporary directory and no service credentials.
import { chromium } from "playwright";
import { readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
if (process.versions.bun)
  throw new Error("The browser driver requires Node 22.");
const directory = process.argv[2];
let browser,
  stopping = false,
  abandoned = false;
const stop = () => {
  stopping = true;
  if (browser) void browser.close().catch(() => {});
};
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
process.stdin.resume();
process.stdin.on("end", () => {
  abandoned = true;
  stop();
});
const deadline = setTimeout(stop, 150000);
const progress = (step, percent) =>
  process.stdout.write(JSON.stringify({ step, percent }) + "\n");
try {
  const task = JSON.parse(await readFile(join(directory, "task.json"), "utf8"));
  const html = await readFile(join(directory, "slide.html"), "utf8");
  if (stopping) throw new Error("Cancelled");
  browser = await chromium.launch({
    headless: true,
    timeout: 10000,
    executablePath: process.env.FRAME_CHROME_PATH || undefined,
  });
  if (stopping) throw new Error("Cancelled");
  const page = await browser.newPage({
    viewport: { width: Math.ceil(task.width), height: Math.ceil(task.height) },
    deviceScaleFactor: task.scale || 1,
    reducedMotion: "reduce",
  });
  page.setDefaultTimeout(15000);
  await page.route("**/*", (route) => route.abort());
  progress("Loading slides, fonts and media", 18);
  await page.setContent(html, {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  await page.waitForFunction(
    () => document.body.dataset.frameInitialized === "true",
    undefined,
    { timeout: 20000 },
  );
  await page.waitForFunction(
    () => document.fonts.status === "loaded",
    undefined,
    { timeout: 15000 },
  );
  const result = { count: 0, changes: [], failed: [] };
  if (task.format === "measure") {
    const measured = await page.evaluate(
      ({ minimums }) => {
        const changes = [],
          failed = [];
        for (const node of document.querySelectorAll("[data-text-id]")) {
          if (!node.textContent?.trim()) continue;
          const fits = () =>
            node.scrollHeight <= node.clientHeight + 2 &&
            node.scrollWidth <= node.clientWidth + 2;
          if (fits()) continue;
          const original = parseFloat(getComputedStyle(node).fontSize),
            min = Math.min(original, minimums[node.dataset.textId] || 18);
          node.style.fontSize = `${min}px`;
          if (!fits()) {
            failed.push(node.dataset.textId);
            continue;
          }
          let low = min,
            high = original;
          for (let n = 0; n < 9; n++) {
            const middle = (low + high) / 2;
            node.style.fontSize = `${middle}px`;
            if (fits()) low = middle;
            else high = middle;
          }
          changes.push({
            id: node.dataset.textId,
            size: Math.floor(low * 10) / 10,
          });
        }
        for (const node of document.querySelectorAll(".milestone-timeline"))
          if (
            node.scrollHeight > node.clientHeight + 2 ||
            node.scrollWidth > node.clientWidth + 2
          )
            failed.push(node.dataset.fitId || "timeline");
        return { changes, failed };
      },
      { minimums: task.minimums || {} },
    );
    Object.assign(result, measured);
  } else {
    const imageErrors = await page.evaluate(async () => {
      const decoded = await Promise.all(
        Array.from(document.images).map((image) =>
          image
            .decode()
            .then(() => true)
            .catch(() => false),
        ),
      );
      return decoded.filter((v) => !v).length;
    });
    if (imageErrors) throw new Error("An image could not be decoded.");
    let total = 0;
    if (task.format === "pdf") {
      progress("Printing slide pages", 65);
      const bytes = await page.pdf({
        width: `${task.width}px`,
        height: `${task.height}px`,
        margin: { top: 0, left: 0, right: 0, bottom: 0 },
        printBackground: true,
        preferCSSPageSize: true,
        tagged: true,
      });
      if (bytes.length > 125 * 1024 * 1024) throw new Error("Oversized PDF");
      await writeFile(join(directory, "0.pdf"), bytes, { mode: 0o600 });
      result.count = 1;
    } else if (task.format === "images") {
      const slides = page.locator("[data-export-slide]");
      const count = await slides.count();
      if (count < 1 || count > 200) throw new Error("Invalid slide count");
      for (let i = 0; i < count; i++) {
        if (stopping) throw new Error("Cancelled");
        progress(
          `Rendering slide ${i + 1} of ${count}`,
          20 + Math.round((i / count) * 65),
        );
        const bytes = await slides
          .nth(i)
          .screenshot({ type: "png", animations: "disabled", timeout: 20000 });
        total += bytes.length;
        if (total > 125 * 1024 * 1024) throw new Error("Oversized images");
        await writeFile(join(directory, `${i}.png`), bytes, { mode: 0o600 });
      }
      result.count = count;
    } else throw new Error("Invalid browser task");
  }
  if (stopping) throw new Error("Cancelled");
  await writeFile(join(directory, "result.json"), JSON.stringify(result), {
    mode: 0o600,
  });
} catch {
  process.exitCode = 1;
} finally {
  clearTimeout(deadline);
  if (browser) await browser.close().catch(() => {});
  if (abandoned) await rm(directory, { recursive: true, force: true });
  process.stdin.destroy();
}
