import { expect, test } from "bun:test";
import type { AIJob } from "../shared/ai";
import {
  creationProgress,
  elapsedLabel,
  elapsedSeconds,
} from "../src/lib/creation-progress";
const job: AIJob = {
  id: "job",
  presentationId: null,
  kind: "outline",
  status: "running",
  progress: { step: "Writing the story", percent: 30 },
  attempts: 1,
  result: null,
  error: null,
  createdAt: "2026-10-17T01:00:00Z",
  updatedAt: "2026-10-17T01:00:30Z",
};
test("progress follows real checkpoints and never advances just because time passes", () => {
  expect(creationProgress(job).current).toBe(1);
  expect(creationProgress(job).waitingForAI).toBe(true);
  const quick = creationProgress({ ...job, kind: "generate" });
  expect(quick.current).toBe(0);
  expect(quick.stages[0].title).toBe("Writing the story");
  expect(quick.waitingForAI).toBe(true);
  expect(creationProgress({ ...job, status: "queued" }).current).toBe(-1);
  expect(creationProgress({ ...job, status: "queued" }).waitingForAI).toBe(
    false,
  );
  expect(creationProgress({ ...job, status: "succeeded" }).current).toBe(3);
  expect(
    creationProgress(
      { ...job, progress: { step: "Reading your sources", percent: 10 } },
      true,
    ).stages[0].title,
  ).toBe("Reading your sources");
  for (const [percent, current] of [
    [10, 0],
    [45, 1],
    [85, 2],
    [95, 3],
  ]) {
    const value = creationProgress({
      ...job,
      kind: "generate",
      progress: { step: "work", percent },
    });
    expect(value.current).toBe(current);
    expect(value.waitingForAI).toBe(current === 1);
  }
});
test("elapsed time survives reloads, handles clock skew and formats long waits", () => {
  expect(
    elapsedLabel(
      elapsedSeconds(job.createdAt, Date.parse("2026-10-17T01:01:05Z")),
    ),
  ).toBe("1:05");
  expect(elapsedSeconds(job.createdAt, 0)).toBe(0);
  expect(elapsedSeconds("invalid", Date.now())).toBe(0);
  expect(elapsedLabel(3605)).toBe("60:05");
});
