import { Store } from "../server/store";
const store = new Store();
try {
  await store.migrate();
  console.log(JSON.stringify({ event: "database_migrated", schema: "drizzle" }));
} finally {
  await store.db.close();
}
