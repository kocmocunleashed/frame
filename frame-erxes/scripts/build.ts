import { mkdir, cp } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
process.chdir(root);
for (const [entry, target] of [
  ["backend/plugins/frame_api/src/main.ts", "bun"],
  ["frontend/plugins/frame_ui/src/main.ts", "browser"],
  ["frontend/plugins/frame_ui/src/config.tsx", "browser"],
] as const) {
  const result = await Bun.build({
    entrypoints: [entry],
    target,
    packages: "external",
  });
  if (!result.success)
    throw new AggregateError(result.logs, `Failed to bundle ${entry}`);
}
await mkdir("dist", { recursive: true });
for (const directory of ["backend", "frontend", "patches"])
  await cp(directory, `dist/${directory}`, { recursive: true });
await cp("README.md", "dist/README.md");
console.log(
  "Validated source bundles and packaged erxes plugin sources in dist/. Run Nx builds in the erxes host to produce the federation remote and backend service.",
);
