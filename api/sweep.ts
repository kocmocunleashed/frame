import { timingSafeEqual } from "node:crypto";
import { runtime, dispatchPending } from "../server/vercel-runtime";
import { cleanupUploads } from "../server/uploads";
Bun.serve({
  async fetch(request) {
    const secret = process.env.CRON_SECRET,
      actual = Buffer.from(request.headers.get("authorization") || ""),
      expected = Buffer.from(`Bearer ${secret}`);
    if (
      !secret ||
      actual.length !== expected.length ||
      !timingSafeEqual(actual, expected)
    )
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    const { store } = await runtime();
    const dispatched = await dispatchPending(store);
    await cleanupUploads(store);
    return Response.json({ dispatched });
  },
});
