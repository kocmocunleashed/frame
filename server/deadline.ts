export class DeadlineExceeded extends Error {
  constructor() {
    super("The operation exceeded its time budget.");
    this.name = "TimeoutError";
  }
}

// The SDK's fetch timeout ends at response headers. Keep a deadline alive
// through streamed bodies, rendering and providers that ignore cancellation.
export async function withDeadline<T>(
  signal: AbortSignal,
  timeoutMs: number,
  run: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  signal.throwIfAborted();
  const deadline = new AbortController();
  const combined = AbortSignal.any([signal, deadline.signal]);
  const timer = setTimeout(
    () => deadline.abort(new DeadlineExceeded()),
    timeoutMs,
  );
  let onAbort = () => {};
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => reject(combined.reason);
    combined.addEventListener("abort", onAbort, { once: true });
  });
  try {
    return await Promise.race([
      Promise.resolve().then(() => {
        combined.throwIfAborted();
        return run(combined);
      }),
      aborted,
    ]);
  } finally {
    clearTimeout(timer);
    combined.removeEventListener("abort", onAbort);
  }
}
