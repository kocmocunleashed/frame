// Integration check against a dedicated private fixture bucket, never a production bucket.
import { ObjectStorage, storageConfig } from "../server/storage";
import { uid } from "../shared/schema";
const config = storageConfig();
if (config.mode !== "s3")
  throw new Error("Set FRAME_STORAGE=s3 with a dedicated fixture bucket.");
const storage = new ObjectStorage(config),
  key = uid(),
  bytes = new TextEncoder().encode(
    "Frame private object integration 0123456789",
  ),
  keys = [key, uid()];
try {
  await storage.probe();
  await storage.put("assets", keys[0], bytes, "video/mp4");
  await storage.put("exports", keys[1], bytes, "application/octet-stream");
  const info = await storage.stat("assets", key);
  if (info?.bytes !== bytes.length) throw new Error("S3 metadata mismatch");
  if (
    !Buffer.from(await storage.read("assets", key)).equals(Buffer.from(bytes))
  )
    throw new Error("S3 byte mismatch");
  const range = await new Response(
    await storage.stream("assets", key, { start: 6, end: 12 }),
  ).text();
  if (range !== new TextDecoder().decode(bytes.slice(6, 13)))
    throw new Error("S3 range mismatch");
  const listed = [];
  for await (const item of await storage.list("assets")) listed.push(item.key);
  if (!listed.includes(key)) throw new Error("S3 listing mismatch");
  await storage.delete("assets", key);
  if (await storage.stat("assets", key))
    throw new Error("S3 deletion mismatch");
  console.log(
    JSON.stringify({
      ok: true,
      checks: [
        "private S3 put/head/read/range/list/delete",
        "separate asset and export namespaces",
      ],
    }),
  );
} finally {
  await Promise.allSettled([
    storage.delete("assets", keys[0]),
    storage.delete("exports", keys[1]),
  ]);
  storage.close();
}
