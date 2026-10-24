import { cp, access, mkdir, readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const destination = process.argv[2] && resolve(process.argv[2]);
if (!destination)
  throw new Error("Usage: bun run install:erxes /absolute/path/to/erxes");
await access(join(destination, "nx.json"));
await access(join(destination, "backend/erxes-api-shared"));
await access(join(destination, "frontend/core-ui"));
const projects = ["backend/plugins/frame_api", "frontend/plugins/frame_ui"];
for (const project of projects) {
  try {
    await access(join(destination, project));
  } catch {
    continue;
  }
  throw new Error(
    `${project} already exists. Review and merge changes manually; the installer never overwrites a plugin.`,
  );
}
// Verify the host supports the named-module resolution used by this package.
const resolver = await readFile(
  join(
    destination,
    "frontend/core-ui/src/plugins/utils/resolveRemoteComponent.ts",
  ),
  "utf8",
);
if (!resolver.includes("resolveRemoteComponent"))
  throw new Error(
    "This erxes checkout does not expose the supported remote component contract.",
  );
for (const project of projects) {
  await mkdir(resolve(destination, project, ".."), { recursive: true });
  await cp(join(root, project), join(destination, project), {
    recursive: true,
    errorOnExist: true,
    force: false,
  });
}
console.log(
  "Installed frame_api and frame_ui. Configure FRAME_ERXES_TENANTS, add frame to ENABLED_PLUGINS, install host dependencies with Bun, and build both projects.",
);
