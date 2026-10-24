import { Store } from "../server/store";
const store = new Store();
try {
  await store.migrate();
  console.log(JSON.stringify({ event: "database_migrated", schema: 1 }));
} finally {
  await store.db.close();
}
