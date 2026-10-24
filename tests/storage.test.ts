import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ObjectStorage,
  storageConfig,
  StorageFailure,
} from "../server/storage";
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});
test("private local objects have atomic writes, bounded reads, byte ranges, metadata and deletion", async () => {
  const root = mkdtempSync(join(tmpdir(), "frame-storage-"));
  roots.push(root);
  const storage = new ObjectStorage({
    mode: "local",
    assets: join(root, "assets"),
    exports: join(root, "exports"),
  });
  await storage.put(
    "assets",
    "local-object",
    new TextEncoder().encode("0123456789"),
    "video/mp4",
  );
  expect(statSync(join(root, "assets", "local-object")).mode & 0o777).toBe(
    0o600,
  );
  expect((await storage.stat("assets", "local-object"))?.bytes).toBe(10);
  expect(
    await new Response(
      await storage.stream("assets", "local-object", { start: 2, end: 5 }),
    ).text(),
  ).toBe("2345");
  await expect(storage.read("assets", "local-object", 9)).rejects.toThrow(
    "allowed size",
  );
  await storage.put("exports", "export-object", new Uint8Array([1, 2, 3]));
  const listed = [];
  for await (const object of await storage.list("assets"))
    listed.push(object.key);
  expect(listed).toEqual(["local-object"]);
  expect(await storage.stat("exports", "local-object")).toBeNull();
  await expect(storage.read("assets", "../escape")).rejects.toThrow(
    "Invalid object key",
  );
  await storage.delete("assets", "local-object");
  await storage.delete("assets", "local-object");
  expect(await storage.stat("assets", "local-object")).toBeNull();
  await expect(storage.read("assets", "local-object")).rejects.toThrow(
    "no longer available",
  );
});
test("production configuration is explicit and S3 errors never expose credentials or endpoint details", async () => {
  expect(() => storageConfig({ NODE_ENV: "production" })).toThrow(
    "FRAME_STORAGE",
  );
  expect(() => storageConfig({ FRAME_STORAGE: "s3" })).toThrow("requires");
  const env = {
    FRAME_STORAGE: "s3",
    FRAME_S3_REGION:"us-east-1",
    FRAME_S3_BUCKET: "test",
    FRAME_S3_ACCESS_KEY: "synthetic",
    FRAME_S3_SECRET_KEY: "never-log-this",
    FRAME_S3_ENDPOINT: "http://not-loopback.test",
  };
  expect(() => storageConfig(env)).toThrow("HTTPS");
  expect(
    storageConfig({ ...env, FRAME_S3_ENDPOINT: "http://127.0.0.1:1" }).mode,
  ).toBe("s3");
  const message = new StorageFailure().message;
  expect(message).not.toContain(env.FRAME_S3_SECRET_KEY);
});
