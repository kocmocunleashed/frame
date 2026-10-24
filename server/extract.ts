import { JobFailure } from "./jobs";
import type { ExtractedSource } from "./extract-core";
export function extractFile(
  bytes: Uint8Array,
  name: string,
  signal: AbortSignal,
  timeoutMs = 25000,
): Promise<ExtractedSource> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new JobFailure("Source extraction cancelled."));
      return;
    }
    const worker = new Worker(new URL("./extract-worker.ts", import.meta.url), {
      type: "module",
      smol: true,
    } as WorkerOptions & {
      smol: boolean;
    });
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", cancel);
      void worker.terminate();
    };
    const cancel = () => {
      finish();
      reject(new JobFailure("Source extraction cancelled."));
    };
    const timer = setTimeout(() => {
      finish();
      reject(
        new JobFailure(
          "Document extraction exceeded 25 seconds. Split the document or paste its text.",
        ),
      );
    }, timeoutMs);
    signal.addEventListener("abort", cancel, { once: true });
    worker.onmessage = (
      event: MessageEvent<{
        ok: boolean;
        result: ExtractedSource;
        error?: string;
      }>,
    ) => {
      finish();
      if (event.data.ok) resolve(event.data.result);
      else
        reject(
          new JobFailure(event.data.error || "Document extraction failed."),
        );
    };
    worker.onerror = () => {
      finish();
      reject(
        new JobFailure(
          "Document extraction stopped unexpectedly. Try a smaller file or paste its text.",
        ),
      );
    };
    worker.postMessage({ bytes, name });
  });
}
