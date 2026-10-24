import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { isIP } from "node:net";
import ipaddr from "ipaddr.js";
import sharp from "sharp";
import { JobFailure } from "./jobs";

export function publicAddress(address: string) {
  try {
    return ipaddr.process(address).range() === "unicast";
  } catch {
    return false;
  }
}
async function withinDeadline<T>(
  work: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  signal.throwIfAborted();
  let abort: () => void = () => {};
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        abort = () => reject(signal.reason);
        signal.addEventListener("abort", abort, { once: true });
      }),
    ]);
  } finally {
    signal.removeEventListener("abort", abort);
  }
}
export function externalImageURL(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new JobFailure("The external image URL is invalid.");
  }
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443") ||
    (!host.includes(".") && !isIP(host)) ||
    /(^|\.)(localhost|local|internal)$/.test(host) ||
    host.endsWith(".home.arpa") ||
    (isIP(host) && !publicAddress(host))
  )
    throw new JobFailure(
      "External images must use a public HTTPS address on port 443. Upload private-network images instead.",
    );
  return url;
}
/** Resolve each redirect, reject every non-public result, and pin the socket's DNS lookup. */
export async function remoteImage(
  value: string,
  parentSignal: AbortSignal,
): Promise<{ bytes: Uint8Array; mime: string }> {
  const signal = AbortSignal.any([parentSignal, AbortSignal.timeout(15000)]);
  let url = externalImageURL(value);
  try {
    for (let redirects = 0; redirects <= 3; redirects++) {
      signal.throwIfAborted();
      const host = url.hostname.replace(/^\[|\]$/g, "");
      const addresses = isIP(host)
        ? [{ address: host, family: isIP(host) }]
        : await withinDeadline(
            lookup(host, { all: true, verbatim: true }),
            signal,
          );
      signal.throwIfAborted();
      if (!addresses.length || addresses.some((a) => !publicAddress(a.address)))
        throw new JobFailure(
          "The external image resolves to a restricted network. Upload the image instead.",
        );
      const pinned = addresses[0];
      const response = await new Promise<{
        bytes: Buffer;
        mime: string;
        redirect?: string;
      }>((resolve, reject) => {
        const req = request(
          url,
          {
            agent: false,
            signal,
            timeout: 15000,
            headers: {
              Accept: "image/png,image/jpeg,image/webp,image/gif",
              "Accept-Encoding": "identity",
              "User-Agent": "Frame image exporter",
            },
            lookup: ((_hostname: any, options: any, done: any) =>
              options.all
                ? done(null, [pinned])
                : done(null, pinned.address, pinned.family)) as any,
          },
          (res) => {
            if (
              [301, 302, 303, 307, 308].includes(res.statusCode || 0) &&
              res.headers.location
            ) {
              res.destroy();
              resolve({
                bytes: Buffer.alloc(0),
                mime: "",
                redirect: res.headers.location,
              });
              return;
            }
            const mime = String(res.headers["content-type"] || "")
              .split(";")[0]
              .trim()
              .toLowerCase();
            if (
              res.statusCode !== 200 ||
              !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(
                mime,
              ) ||
              Number(res.headers["content-length"] || 0) > 10 * 1024 * 1024 ||
              (res.headers["content-encoding"] &&
                res.headers["content-encoding"] !== "identity")
            ) {
              res.destroy();
              reject(
                new JobFailure(
                  "The external image must be a still PNG, JPEG, WebP or GIF under 10 MiB.",
                ),
              );
              return;
            }
            const chunks: Buffer[] = [];
            let length = 0;
            res.on("data", (chunk) => {
              length += chunk.length;
              if (length > 10 * 1024 * 1024) {
                req.destroy(new Error("Image too large"));
                return;
              }
              chunks.push(Buffer.from(chunk));
            });
            res.once("error", reject);
            res.once("end", () =>
              resolve({ bytes: Buffer.concat(chunks), mime }),
            );
          },
        );
        req.once("timeout", () => req.destroy(new Error("Image timed out")));
        req.once("error", reject);
        req.end();
      });
      if (response.redirect) {
        if (redirects === 3)
          throw new JobFailure("The external image redirects too many times.");
        url = externalImageURL(new URL(response.redirect, url).href);
        continue;
      }
      const image = sharp(response.bytes, {
          limitInputPixels: 40000000,
          failOn: "error",
        }).timeout({ seconds: 10 }),
        metadata = await withinDeadline(image.metadata(), signal);
      const actual =
        metadata.format === "jpeg" ? "image/jpeg" : `image/${metadata.format}`;
      if (actual !== response.mime || (metadata.pages || 1) > 1)
        throw new JobFailure(
          "The external image content does not match a supported still image.",
        );
      const bytes = await withinDeadline(
        image.rotate().webp({ quality: 92 }).toBuffer(),
        signal,
      );
      signal.throwIfAborted();
      return { bytes: new Uint8Array(bytes), mime: "image/webp" };
    }
  } catch (error) {
    if (error instanceof JobFailure) throw error;
    throw new JobFailure(
      parentSignal.aborted
        ? "Export cancelled."
        : "The external image could not be retrieved safely within 15 seconds. Upload it to Frame and retry.",
    );
  }
  throw new JobFailure("The external image could not be retrieved.");
}
