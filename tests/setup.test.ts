import { describe, test, expect } from "bun:test";
import { mkdtemp, readFile, rm, stat, writeFile, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { makeSetup, setupOptions } from "../scripts/setup-config";
import { writeSetup } from "../scripts/setup-config";
import { checkOpenRouterKey } from "../scripts/check-openrouter";
const template = await readFile(new URL("../.env.example", import.meta.url), "utf8");
describe("fresh setup", () => {
  test("standalone setup generates private auth secrets and PostgreSQL configuration", async () => {
    const root = await mkdtemp(join(tmpdir(), "frame-setup-"));
    try {
      const setup = makeSetup(template, { mode: "standalone", database: "docker" });
      await writeSetup(root, setup);
      expect((await stat(join(root, ".env"))).mode & 0o777).toBe(0o600);
      const child = Bun.spawn([process.execPath, "--env-file=.env", "-e", `
        if (!process.env.DATABASE_URL.startsWith('postgresql://frame:')) process.exit(1);
        if (process.env.BETTER_AUTH_SECRET.length !== 64) process.exit(2);
        if (!process.env.DATABASE_URL.includes(process.env.FRAME_POSTGRES_PASSWORD)) process.exit(3);
      `], { cwd: root, env: { PATH: process.env.PATH, HOME: process.env.HOME }, stdout: "pipe", stderr: "pipe" });
      expect(await child.exited).toBe(0);
      expect(setup.commands).toContain("docker compose up -d --wait");
      expect(setup.commands).toContain("bun run db:migrate");
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  test("existing files, symlinks, and concurrent setup never overwrite configuration", async () => {
    const root = await mkdtemp(join(tmpdir(), "frame-setup-"));
    try {
      const setup = makeSetup(template, { mode: "standalone", database: "docker" });
      await writeFile(join(root, ".env"), "KEEP_EXISTING=yes\n");
      await expect(writeSetup(root, setup)).rejects.toThrow("already exist");
      expect(await readFile(join(root, ".env"), "utf8")).toBe("KEEP_EXISTING=yes\n");
      await rm(join(root, ".env")); await symlink(join(root, "missing"), join(root, ".env"));
      await expect(writeSetup(root, setup)).rejects.toThrow("already exist");
      await rm(join(root, ".env"));
      const attempts = await Promise.allSettled([writeSetup(root, setup), writeSetup(root, setup)]);
      expect(attempts.filter(r => r.status === "fulfilled")).toHaveLength(1);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  test("Neon setup preserves its URL and preview is explicitly disposable", () => {
    const url = "postgresql://fixture:private@db.example.test/frame_dev?sslmode=verify-full";
    const setup = makeSetup(template, { mode: "standalone", database: "existing", databaseUrl: url });
    expect(setup.env).toContain(`DATABASE_URL="${url}"`);
    expect(setup.commands.join("\n")).not.toContain("docker");
    expect(makeSetup(template, { mode: "preview" }).commands.at(-1)).toBe("bun run dev:fixture");
    expect(setupOptions.safeParse({ mode: "standalone", database: "existing" }).success).toBe(false);
    expect(setupOptions.safeParse({ mode: "standalone", databaseUrl: "https://unrelated.example" }).success).toBe(false);
  });
  test("setup rejects unsafe origins and environment injection", () => {
    for (const origin of ["https://work.example.com", "http://user:pass@localhost:5174", "http://localhost:5174/", "http://192.168.1.10:5174", "http://localhost:5174\nOTHER=yes"])
      expect(setupOptions.safeParse({ mode: "standalone", origin }).success).toBe(false);
    expect(setupOptions.safeParse({ mode: "standalone", openrouterKey: "private\nVITE_SECRET=bad" }).success).toBe(false);
  });
  test("CLI help is safe without a terminal or credentials", async () => {
    const child = Bun.spawn([process.execPath, "--no-env-file", resolve("scripts/setup.ts"), "--help"], { env: { PATH: process.env.PATH, HOME: process.env.HOME }, stdout: "pipe", stderr: "pipe" });
    expect(await child.exited).toBe(0);
    expect(await new Response(child.stdout).text()).toContain("Does not start services");
  });
  test("OpenRouter connection checks only use the read-only key route and never disclose secrets or provider errors", async () => {
    const key = "private-test-value";
    let calls = 0;
    const fetcher = async (url: string | URL | Request, init?: RequestInit) => {
      calls++;
      expect(url).toBe("https://openrouter.ai/api/v1/key");
      expect(init?.method || "GET").toBe("GET");
      expect(new Headers(init?.headers).get("Authorization")).toBe(
        `Bearer ${key}`,
      );
      expect(init?.redirect).toBe("error");
      return new Response("do not display account details", { status: 200 });
    };
    expect((await checkOpenRouterKey(undefined, fetcher)).ok).toBe(false);
    expect(calls).toBe(0);
    expect((await checkOpenRouterKey(key, fetcher)).ok).toBe(true);
    expect(calls).toBe(1);
    const denied = await checkOpenRouterKey(
      key,
      async () => new Response(key, { status: 401 }),
    );
    expect(denied.ok).toBe(false);
    expect(denied.message).toContain("401");
    expect(denied.message).not.toContain(key);
    const failed = await checkOpenRouterKey(key, async () => {
      throw new Error(key);
    });
    expect(failed.ok).toBe(false);
    expect(failed.message).not.toContain(key);
  });
});
