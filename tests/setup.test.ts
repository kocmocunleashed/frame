import { describe, test, expect } from "bun:test";
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  stat,
  writeFile,
  symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  makeSetup,
  setupOptions,
  writeSetup,
  type SetupOptions,
} from "../scripts/setup-config";
import { checkOpenRouterKey } from "../scripts/check-openrouter";

const template = await readFile(
  new URL("../.env.example", import.meta.url),
  "utf8",
);
const erxes: SetupOptions = {
  mode: "erxes",
  openrouterKey: "",
  database: "existing",
  erxesOrigin: "http://localhost:3001",
  erxesTenant: "school",
};
async function temporary(run: (root: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), "frame-setup-"));
  try {
    await mkdir(join(root, "frame-erxes"));
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

describe("fresh setup", () => {
  test("erxes env files load with matching secrets and isolated, persistent local settings", async () => {
    await temporary(async (root) => {
      const setup = makeSetup(template, erxes);
      await writeSetup(root, setup);
      expect((await stat(join(root, ".env"))).mode & 0o777).toBe(0o600);
      expect(
        (await stat(join(root, "frame-erxes/.env.adapter"))).mode & 0o777,
      ).toBe(0o600);
      const child = Bun.spawn(
        [
          process.execPath,
          "--env-file=.env",
          "--env-file=frame-erxes/.env.adapter",
          "-e",
          `
        const config=JSON.parse(process.env.FRAME_ERXES_TENANTS).school;
        if(config.secret!==process.env.FRAME_ERXES_SECRET || config.secret.length!==64)process.exit(1);
        if(config.frameOrigin!==process.env.APP_ORIGIN || config.erxesOrigin!==process.env.FRAME_ERXES_ORIGIN)process.exit(2);
        if(process.env.MONGODB_DATABASE!=='frame_erxes_dev' || process.env.VITE_CLERK_PUBLISHABLE_KEY)process.exit(3);
        if(process.env.HOST!=='127.0.0.1' || process.env.FRAME_QUEUE_DRIVER!=='local')process.exit(4);
      `,
        ],
        {
          cwd: root,
          env: { PATH: process.env.PATH, HOME: process.env.HOME },
          stdout: "pipe",
          stderr: "pipe",
        },
      );
      expect(await child.exited).toBe(0);
      expect(setup.commands).toEqual([
        "bunx playwright install chromium",
        "bun run db:migrate",
        "bun run dev",
      ]);
      expect(setup.adapter).not.toContain("OPENROUTER_API_KEY");
    });
  });

  test("existing files, symlinks, and simultaneous setup runs never overwrite configuration", async () => {
    await temporary(async (root) => {
      await writeFile(join(root, ".env"), "KEEP_EXISTING=yes\n");
      await expect(
        writeSetup(root, makeSetup(template, erxes)),
      ).rejects.toThrow("already exist");
      expect(await readFile(join(root, ".env"), "utf8")).toBe(
        "KEEP_EXISTING=yes\n",
      );
      await rm(join(root, ".env"));
      await symlink(join(root, "missing-target"), join(root, ".env"));
      await expect(
        writeSetup(root, makeSetup(template, erxes)),
      ).rejects.toThrow("already exist");
      await rm(join(root, ".env"));
      const results = await Promise.allSettled([
        writeSetup(root, makeSetup(template, erxes)),
        writeSetup(root, makeSetup(template, erxes)),
      ]);
      expect(
        results.filter((result) => result.status === "fulfilled"),
      ).toHaveLength(1);
      expect(await stat(join(root, "frame-erxes/.env.adapter"))).toBeDefined();
    });
  });

  test("an adapter collision leaves the main env untouched and a write failure removes only newly created files", async () => {
    await temporary(async (root) => {
      await writeFile(
        join(root, "frame-erxes/.env.adapter"),
        "KEEP_ADAPTER=yes\n",
      );
      await expect(
        writeSetup(root, makeSetup(template, erxes)),
      ).rejects.toThrow("already exist");
      expect(await Bun.file(join(root, ".env")).exists()).toBe(false);
      await rm(join(root, "frame-erxes"), { recursive: true });
      await expect(
        writeSetup(root, makeSetup(template, erxes)),
      ).rejects.toThrow();
      expect(await Bun.file(join(root, ".env")).exists()).toBe(false);
    });
  });

  test("preview and standalone commands distinguish temporary data, real AI and persistent databases", () => {
    const preview = makeSetup(template, {
      mode: "preview",
      openrouterKey: "",
      database: "docker",
    });
    expect(preview.commands.at(-1)).toBe("bun run dev:fixture");
    expect(preview.commands.join("\n")).not.toContain("db:migrate");
    const live = makeSetup(template, {
      mode: "preview",
      openrouterKey: "sk-or-v1-" + "fixture".repeat(8),
      database: "docker",
    });
    expect(live.commands.at(-1)).toBe("bun run dev:fixture --live-ai");
    expect(live.commands).toContain("bun run check:openrouter");
    expect(live.commands.join("\n")).not.toContain("fixturefixture");
    const standalone = makeSetup(template, {
      mode: "standalone",
      openrouterKey: "",
      database: "docker",
      clerkPublishableKey: "pk_test_fixture",
      clerkSecretKey: "sk_test_fixture",
    });
    expect(standalone.env).toContain(
      'CLERK_AUTHORIZED_PARTIES="http://localhost:5174"',
    );
    expect(standalone.commands).toContain("docker compose up -d --wait");
    expect(standalone.adapter).toBeUndefined();
    const loopbackHost = makeSetup(template, {
      ...erxes,
      erxesOrigin: "http://127.0.0.1:3001",
    });
    expect(loopbackHost.origin).toBe("http://127.0.0.1:5174");
  });

  test("unsafe origins, env injection, missing identity and production keys are rejected", () => {
    for (const erxesOrigin of [
      "https://work.example.com",
      "http://user:pass@localhost:3001",
      "http://localhost:3001/",
      "http://192.168.1.10:3001",
      "http://localhost:3001\nOTHER=yes",
    ])
      expect(setupOptions.safeParse({ ...erxes, erxesOrigin }).success).toBe(
        false,
      );
    expect(
      setupOptions.safeParse({ ...erxes, erxesTenant: "$(command)" }).success,
    ).toBe(false);
    expect(setupOptions.safeParse({ mode: "standalone" }).success).toBe(false);
    expect(
      setupOptions.safeParse({
        mode: "standalone",
        clerkPublishableKey: "pk_live_test",
        clerkSecretKey: "sk_live_test",
      }).success,
    ).toBe(false);
    expect(
      setupOptions.safeParse({
        ...erxes,
        openrouterKey: "sk-or-v1-" + "x".repeat(40) + "\nVITE_SECRET=bad",
      }).success,
    ).toBe(false);
  });

  test("CLI help is safe without a terminal or credentials", async () => {
    const child = Bun.spawn(
      [
        process.execPath,
        "--no-env-file",
        resolve("scripts/setup.ts"),
        "--help",
      ],
      {
        env: { PATH: process.env.PATH, HOME: process.env.HOME },
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    expect(await child.exited).toBe(0);
    expect(await new Response(child.stdout).text()).toContain(
      "Does not start services",
    );
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
