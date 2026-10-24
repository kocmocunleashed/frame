import assert from "node:assert/strict";

const origin = process.argv[2] || "http://localhost:4000";
const base = new URL(origin);
assert(["localhost", "127.0.0.1"].includes(base.hostname), "This local check refuses external hosts.");
async function graphql(query: string) {
  const response = await fetch(new URL("/graphql", base), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(10000),
  });
  assert.equal(response.status, 200);
  return response.json();
}
const available = await graphql("query FrameHostAnonymousAvailability { frameAvailable }");
assert.deepEqual(available, { data: { frameAvailable: false } });
const denied = await graphql("mutation FrameHostAnonymousLaunch { frameLaunch { origin } }");
assert(denied.errors?.length > 0 && !denied.data?.frameLaunch, "Anonymous launch must be denied.");
const plugins = await fetch(new URL("/get-frontend-plugins", base), { signal: AbortSignal.timeout(10000) }).then(r => r.json());
const frame = plugins.find((plugin: { name: string }) => plugin.name === "frame_ui");
assert(frame, "Host must discover frame_ui.");
assert.equal((await fetch(frame.entry, { signal: AbortSignal.timeout(10000) })).status, 200);
console.log("Actual erxes gateway: anonymous availability false, anonymous launch denied, Frame remote discovered and reachable.");
