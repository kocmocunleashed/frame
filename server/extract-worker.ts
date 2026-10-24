import { extractContent } from "./extract-core";
const channel = globalThis as unknown as {
  onmessage:
    | ((
        event: MessageEvent<{
          bytes: Uint8Array;
          name: string;
        }>,
      ) => void)
    | null;
  postMessage: (message: unknown) => void;
};
channel.onmessage = async (event) => {
  try {
    channel.postMessage({
      ok: true,
      result: await extractContent(event.data.bytes, event.data.name),
    });
  } catch (error) {
    channel.postMessage({
      ok: false,
      error:
        error instanceof Error ? error.message : "Document extraction failed.",
    });
  }
};
