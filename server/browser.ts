import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { withDeadline } from "./deadline";

export type BrowserTask = {
  html: string;
  width: number;
  height: number;
  scale?: number;
  format: "pdf" | "images" | "measure";
  minimums?: Record<string, number>;
};
const resultSchema = z.object({
  count: z.number().int().min(0).max(200),
  changes: z
    .array(
      z.object({
        id: z.string().max(200),
        size: z.number().finite().positive(),
      }),
    )
    .max(20000),
  failed: z.array(z.string().max(200)).max(20000),
});
// Bun 1.3.14 can disconnect Playwright's extra Chromium pipes on recycling
// (oven-sh/bun#34785). Run the complete browser driver on pinned Node. The
// shared HTML renderer, application, job leases and packaging remain on Bun.
export async function runBrowserTask(
  task: BrowserTask,
  signal: AbortSignal,
  progress: (step: string, percent: number) => void | Promise<void> = () => {},
) {
  signal.throwIfAborted();
  const node = process.env.FRAME_NODE_PATH || Bun.which("node");
  if (!node)
    throw new Error("Install Node 22 for the Playwright browser driver.");
  const directory = await mkdtemp(join(tmpdir(), "frame-browser-"));
  let cleanup: () => Promise<void> = async () => {};
  try {
    const { html, ...settings } = task;
    await writeFile(join(directory, "slide.html"), html, { mode: 0o600 });
    await writeFile(join(directory, "task.json"), JSON.stringify(settings), {
      mode: 0o600,
    });
    const env: Record<string, string> = {};
    for (const key of [
      "PATH",
      "HOME",
      "TMPDIR",
      "TEMP",
      "TMP",
      "XDG_CACHE_HOME",
      "XDG_CONFIG_HOME",
      "FONTCONFIG_FILE",
      "FONTCONFIG_PATH",
      "PLAYWRIGHT_BROWSERS_PATH",
      "FRAME_CHROME_PATH",
    ])
      if (process.env[key]) env[key] = process.env[key]!;
    await withDeadline(
      signal,
      task.format === "measure" ? 60000 : 150000,
      async (bounded) => {
        bounded.throwIfAborted();
        const child = Bun.spawn(
          [
            node,
            fileURLToPath(new URL("./browser-driver.mjs", import.meta.url)),
            directory,
          ],
          {
            env,
            stdin: "pipe",
            stdout: "pipe",
            stderr: "ignore",
          },
        );
        let killTimer: ReturnType<typeof setTimeout> | undefined;
        const stop = () => {
          try {
            child.stdin.end();
          } catch {}
          child.kill("SIGTERM");
          killTimer ||= setTimeout(() => child.kill("SIGKILL"), 12000);
        };
        let cleaned: Promise<void> | undefined;
        cleanup = () =>
          (cleaned ||= (async () => {
            if (child.exitCode === null) stop();
            await child.exited;
            if (killTimer) clearTimeout(killTimer);
          })());
        bounded.addEventListener("abort", stop, { once: true });
        const reader = child.stdout.getReader();
        try {
          let pending = "";
          while (true) {
            const { value: chunk, done } = await reader.read();
            if (done) break;
            pending += new TextDecoder().decode(chunk);
            if (pending.length > 8192)
              throw new Error("Invalid browser progress.");
            let end: number;
            while ((end = pending.indexOf("\n")) >= 0) {
              const message = JSON.parse(pending.slice(0, end));
              pending = pending.slice(end + 1);
              if (
                typeof message.step !== "string" ||
                message.step.length > 200 ||
                !Number.isFinite(message.percent) ||
                message.percent < 0 ||
                message.percent > 100
              )
                throw new Error("Invalid browser progress.");
              await progress(message.step, message.percent);
            }
          }
          bounded.throwIfAborted();
          if (await child.exited)
            throw new Error(
              "The rendering browser could not complete this task.",
            );
        } finally {
          reader.releaseLock();
          bounded.removeEventListener("abort", stop);
          await cleanup();
        }
      },
    );
    signal.throwIfAborted();
    const resultBytes = await readFile(join(directory, "result.json"));
    if (resultBytes.length > 8 * 1024 * 1024)
      throw new Error("Oversized browser result.");
    const result = resultSchema.parse(JSON.parse(resultBytes.toString()));
    const files: Uint8Array[] = [];
    let total = 0;
    for (let i = 0; i < result.count; i++) {
      signal.throwIfAborted();
      const bytes = await readFile(
        join(directory, `${i}.${task.format === "pdf" ? "pdf" : "png"}`),
      );
      total += bytes.length;
      if (total > 125 * 1024 * 1024)
        throw new Error("Rendered output exceeds 125 MiB.");
      files.push(new Uint8Array(bytes));
    }
    return { ...result, files };
  } finally {
    await cleanup();
    await rm(directory, { recursive: true, force: true });
  }
}
