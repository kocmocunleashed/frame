import { ApiError } from "./store";
import { objectStorage } from "./storage";
export async function assetResponse(
  storageKey: string,
  mime: string,
  range?: string,
  cache = "no-store",
): Promise<Response> {
  if (!/^[a-zA-Z0-9-]{1,100}$/.test(storageKey))
    throw new ApiError(404, "Asset not found.");
  const storage = objectStorage(),
    file = await storage.stat("assets", storageKey);
  if (!file) throw new ApiError(404, "Asset file is no longer available.");
  const headers = {
    "Content-Type": mime,
    "Accept-Ranges": "bytes",
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": cache,
  };
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    let start = 0,
      end = file.bytes - 1;
    if (!match || (!match[1] && !match[2]))
      return new Response(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${file.bytes}` },
      });
    if (!match[1]) {
      const suffix = Number(match[2]);
      if (!Number.isSafeInteger(suffix) || suffix <= 0)
        return new Response(null, {
          status: 416,
          headers: { "Content-Range": `bytes */${file.bytes}` },
        });
      start = Math.max(0, file.bytes - suffix);
    } else {
      start = Number(match[1]);
      end = match[2]
        ? Math.min(file.bytes - 1, Number(match[2]))
        : file.bytes - 1;
    }
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start < 0 ||
      start >= file.bytes ||
      end < start
    )
      return new Response(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${file.bytes}` },
      });
    return new Response(
      await storage.stream("assets", storageKey, { start, end }),
      {
        status: 206,
        headers: {
          ...headers,
          "Content-Range": `bytes ${start}-${end}/${file.bytes}`,
          "Content-Length": String(end - start + 1),
        },
      },
    );
  }
  return new Response(await storage.stream("assets", storageKey), {
    headers: { ...headers, "Content-Length": String(file.bytes) },
  });
}
