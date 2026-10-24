import { expect, test } from "bun:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runBrowserTask } from "../server/browser";

const task = {
  html: '<!doctype html><body data-frame-initialized="true"><div data-text-id="text" style="width:300px;height:50px">Readable text</div></body>',
  width: 300,
  height: 300,
  format: "measure" as const,
};
test("browser driver survives repeated Chromium recycling", async () => {
  for (let i = 0; i < 24; i++) {
    const result = await runBrowserTask(task, AbortSignal.timeout(15000));
    expect(result.failed).toEqual([]);
    expect(result.changes).toEqual([]);
  }
}, 60000);
test("cancellation terminates the driver and removes private scratch files", async () => {
  const directory = await mkdtemp(join(tmpdir(), "frame-driver-test-"));
  const previous = process.env.TMPDIR;
  process.env.TMPDIR = directory;
  try {
    const controller = new AbortController();
    const pending = runBrowserTask(task, controller.signal, () =>
      controller.abort(),
    );
    await expect(pending).rejects.toThrow();
    expect(await readdir(directory)).toEqual([]);
  } finally {
    if (previous === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = previous;
    await rm(directory, { recursive: true, force: true });
  }
}, 20000);
