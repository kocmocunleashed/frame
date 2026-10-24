// Isolated replica-set server; this resolver is never imported by production.
import { Store } from "../tests/mongo";
import { createApp } from "../server/app";
import { createAIServices } from "../server/creation";
import { FixtureAIProvider } from "../tests/fixtures/ai-provider";
if(process.env.NODE_ENV!=='test'||!process.env.FRAME_TEST_MONGODB_URI)throw new Error('Use the isolated browser-test launcher.');
const store = new Store();
await store.testReady;
const admin = await store.createUser(
  "Browser administrator",
  "admin@example.test",
  "fixture",
);
const member = await store.createUser(
  "Credit member",
  "credit-member@example.test",
  "fixture",
);
const conflict = await store.createUser(
  "Conflict member",
  "conflict@example.test",
  "fixture",
);
process.env.FRAME_ADMIN_USER_IDS = admin.id;
const app = createApp(
  store,
  createAIServices(store, new FixtureAIProvider()),
  async (_store, headers) => {
    const cookie = headers.get("cookie") || "";
    return cookie.includes("frame_admin_fixture=admin")
      ? (await store.user(admin.id)) || null
      : cookie.includes("frame_admin_fixture=member")
        ? (await store.user(member.id)) || null
        : null;
  },
);
export default { port: 3147, hostname: "127.0.0.1", fetch: app.fetch };
