import { expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

test("installer adds only the paired plugins and refuses to overwrite them", async () => {
  const root = await mkdtemp(join(tmpdir(), "frame-erxes-install-"));
  try {
    await mkdir(join(root, "backend/erxes-api-shared"), { recursive: true });
    await mkdir(join(root, "frontend/core-ui/src/plugins/utils"), {
      recursive: true,
    });
    await writeFile(join(root, "nx.json"), "{}");
    await writeFile(
      join(root, "frontend/core-ui/src/plugins/utils/resolveRemoteComponent.ts"),
      "export const resolveRemoteComponent = () => null;",
    );
    const run = async () => {
      const child = Bun.spawn(
        [
          process.execPath,
          fileURLToPath(new URL("../scripts/install.ts", import.meta.url)),
          root,
        ],
        { stdout: "pipe", stderr: "pipe" },
      );
      const [code, stdout, stderr] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ]);
      return { code, stdout, stderr };
    };
    expect((await run()).code).toBe(0);
    expect(
      JSON.parse(
        await readFile(join(root, "backend/plugins/frame_api/project.json"), "utf8"),
      ).name,
    ).toBe("frame_api");
    expect(
      JSON.parse(
        await readFile(join(root, "frontend/plugins/frame_ui/project.json"), "utf8"),
      ).name,
    ).toBe("frame_ui");
    const sentinel = join(root, "frontend/plugins/frame_ui/src/main.ts");
    await writeFile(sentinel, "// Local changes must survive");
    const again = await run();
    expect(again.code).not.toBe(0);
    expect(again.stderr).toContain("already exists");
    expect(await readFile(sentinel, "utf8")).toBe("// Local changes must survive");
    expect(await readFile(join(root, "nx.json"), "utf8")).toBe("{}");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
