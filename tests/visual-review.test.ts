import { expect, test } from "bun:test";
import { makeDocument } from "../shared/templates";
import { reviewVisualBatch } from "../server/visual-review";
import { JobFailure } from "../server/jobs";
import type { Store } from "../server/store";
import type { User } from "../shared/schema";
import type { AIProvider } from "../server/ai-provider";

function fixture() {
  const doc = makeDocument("owner", "workspace", "Saved design", "blank");
  const pairs = [{ slide: doc.slides[0], theme: doc.themes[0], warnings: [] }];
  const owner = { id: "owner", workspaceId: "workspace" } as User;
  return { doc, pairs, owner };
}

test("a stalled optional review preserves the design within its budget, even if the provider ignores abort", async () => {
  const { doc, pairs, owner } = fixture();
  let reviewSignal: AbortSignal | undefined;
  const provider: AIProvider = {
    configured: true,
    generate: async (_name, _schema, _instructions, _input, signal) => {
      reviewSignal = signal;
      return new Promise(() => {});
    },
  };
  const result = await Promise.race([
    reviewVisualBatch(
      pairs,
      {} as Store,
      owner,
      provider,
      doc,
      {},
      {
        signal: new AbortController().signal,
        progress: () => {},
      },
      { timeoutMs: 25, render: async () => ["synthetic-screenshot"] },
    ),
    Bun.sleep(200).then(() => null),
  ]);
  expect(result).not.toBeNull();
  expect(result!.slides).toEqual(pairs);
  expect(result!.visualReview).toMatchObject({
    checks: 0,
    status: "unavailable",
  });
  expect(result!.warnings.join(" ")).toContain("time limit");
  expect(reviewSignal?.aborted).toBe(true);
});
test("an unconfirmed repair is discarded when the recheck times out", async () => {
  const { doc, pairs, owner } = fixture();
  let calls = 0;
  const result = await reviewVisualBatch(
    pairs,
    {} as Store,
    owner,
    {
      configured: true,
      generate: async () => {
        if (++calls > 1) return new Promise(() => {});
        return {
          slides: [
            {
              slideId: pairs[0].slide.id,
              issues: [
                { severity: "minor", message: "Adjust background contrast" },
              ],
              background: "#112233",
              elementOrder: null,
              updates: [],
            },
          ],
        };
      },
    },
    doc,
    {},
    { signal: new AbortController().signal, progress: () => {} },
    {
      timeoutMs: 25,
      render: async () => ["synthetic-screenshot"],
      fit: async (document) => ({ document, warnings: [] }),
    },
  );
  expect(calls).toBe(2);
  expect(result.slides).toEqual(pairs);
  expect(result.visualReview).toMatchObject({
    checks: 1,
    fixedSlides: 0,
    remainingIssues: 1,
    status: "needs-review",
  });
  expect(result.warnings.join(" ")).toContain("time limit");
});

test("user cancellation still stops review even when the reviewer ignores its signal", async () => {
  const { doc, pairs, owner } = fixture();
  const controller = new AbortController();
  const provider: AIProvider = {
    configured: true,
    generate: async () => {
      controller.abort();
      return new Promise(() => {});
    },
  };
  await expect(
    reviewVisualBatch(
      pairs,
      {} as Store,
      owner,
      provider,
      doc,
      {},
      {
        signal: controller.signal,
        progress: () => {},
      },
      { timeoutMs: 100, render: async () => ["synthetic-screenshot"] },
    ),
  ).rejects.toThrow("cancelled");
});

test("a successful review keeps its validated result", async () => {
  const { doc, pairs, owner } = fixture();
  const result = await reviewVisualBatch(
    pairs,
    {} as Store,
    owner,
    {
      configured: true,
      generate: async () => ({
        slides: [
          {
            slideId: pairs[0].slide.id,
            issues: [],
            background: null,
            elementOrder: null,
            updates: [],
          },
        ],
      }),
    },
    doc,
    {},
    { signal: new AbortController().signal, progress: () => {} },
    {
      timeoutMs: 100,
      render: async () => ["synthetic-screenshot"],
    },
  );
  expect(result.slides).toEqual(pairs);
  expect(result.visualReview).toMatchObject({ checks: 1, status: "passed" });
  expect(result.warnings).toEqual([]);
});
