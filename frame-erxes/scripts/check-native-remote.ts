// Run after the supported host's native Nx/Rspack build. This checks the real
// federation artifact; authenticated gateway integration remains a separate gate.
import { chromium } from "playwright";
import { resolve, sep } from "node:path";
import assert from "node:assert/strict";

const argument = process.argv[2];
if (!argument)
  throw new Error(
    "Usage: bun frame-erxes/scripts/check-native-remote.ts /path/to/host/dist/frontend/plugins/frame_ui",
  );
const root = resolve(argument);
assert(
  await Bun.file(resolve(root, "remoteEntry.js")).exists(),
  "Build frame_ui in the erxes host first.",
);
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  async fetch(request) {
    const pathname = new URL(request.url).pathname;
    if (pathname === "/")
      return new Response(
        '<!doctype html><html lang="en"><head><title>Native Frame remote verification</title></head><body><script src="/remoteEntry.js"></script></body></html>',
        { headers: { "Content-Type": "text/html" } },
      );
    const filePath = resolve(root, "." + decodeURIComponent(pathname));
    if (!filePath.startsWith(root + sep))
      return new Response("Denied", { status: 403 });
    const file = Bun.file(filePath);
    return (await file.exists())
      ? new Response(file)
      : new Response("Not found", { status: 404 });
  },
});
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.port}`);
  const result = await page.evaluate(async () => {
    const remote = (window as any).frame_ui;
    await remote.init({});
    const frame = (await remote.get("./frame"))();
    const config = (await remote.get("./config"))().CONFIG;
    return {
      frame: typeof frame.Frame,
      name: config.name,
      path: config.path,
      modules: config.modules.map((m: any) => m.name),
    };
  });
  assert.deepEqual(result, {
    frame: "function",
    name: "frame",
    path: "frame",
    modules: ["studio"],
  });
  console.log(
    "Native remoteEntry.js loaded both federation exports in Chromium; Frame component and navigation contract passed.",
  );
} finally {
  await browser?.close();
  await server.stop(true);
}
