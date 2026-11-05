import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
const root = await mkdtemp(join(tmpdir(), "frame-runtime-audit-"));
try {
  const manifest = JSON.parse(await readFile("package.json", "utf8"));
  const forbidden = /(?:erxes|mongodb|mongoose|@clerk)/i;
  if (
    Object.keys({ ...manifest.dependencies, ...manifest.devDependencies }).some(
      (name) => forbidden.test(name),
    )
  )
    throw new Error("Obsolete direct dependency found.");
  if (forbidden.test(await readFile(".env.example", "utf8")))
    throw new Error("Obsolete environment setting found.");
  const metafile = join(root, "graph.json");
  const child = Bun.spawn(
    [
      process.execPath,
      "--no-env-file",
      "build",
      "server/index.ts",
      "server/workers/worker.ts",
      "server/workers/dispatcher.ts",
      "server/workers/maintenance.ts",
      "api/server.ts",
      "api/worker.ts",
      "api/sweep.ts",
      "api/studio.ts",
      "--target=bun",
      "--packages=bundle",
      `--outdir=${root}`,
      `--metafile=${metafile}`,
    ],
    { stdout: "pipe", stderr: "pipe" },
  );
  if (await child.exited)
    throw new Error("Runtime dependency graph could not be built.");
  const graph = JSON.parse(await readFile(metafile, "utf8"));
  const forbiddenInputs = Object.keys(graph.inputs).filter(
    (path) => forbidden.test(path) || /better-auth\/mongo-adapter/.test(path),
  );
  if (forbiddenInputs.length)
    throw new Error(
      "Obsolete runtime dependency found in the bundled import graph.",
    );
  console.log(
    `Standalone audit passed: ${Object.keys(graph.inputs).length} runtime modules; no host, MongoDB, or Clerk imports.`,
  );
} finally {
  await rm(root, { recursive: true, force: true });
}
