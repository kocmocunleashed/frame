import { embeddingPolicy } from "./erxes-config";

/** Static assets stay on the CDN; HTML receives the deployment's runtime policy. */
export function studioResponse(request: Request) {
  if (!["GET", "HEAD"].includes(request.method))
    return new Response("Method not allowed", {
      status: 405,
      headers: { Allow: "GET, HEAD" },
    });
  const policy = embeddingPolicy();
  return new Response(
    request.method === "HEAD"
      ? null
      : Bun.file(new URL("../dist/index.html", import.meta.url)),
    {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        ...(policy ? { "Content-Security-Policy": policy } : {}),
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
