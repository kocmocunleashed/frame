import { Store } from "../server/store";
import { backup, verifyBackup, restoreBackup } from "../server/backup";
import { maintain } from "../server/maintenance";
const [command, path] = process.argv.slice(2);
if (command === "verify") {
  if (!path) throw new Error("Usage: bun run ops verify DIRECTORY");
  console.log(JSON.stringify(await verifyBackup(path)));
} else {
  const store = new Store();
  try {
    switch (command) {
      case "status":
        console.log(
          JSON.stringify({
            database: await store.db.ping(),
            migration: await store.db.one("schemaMigrations", { id: "1" }),
            activeJobs: await store.db.count("jobs", {
              status: { $in: ["running", "queued"] },
            }),
            outbox: await store.db.count("outbox", { sentAt: null }),
          }),
        );
        break;
      case "backup":
        if (!path) throw new Error("Supply a new backup directory.");
        console.log(JSON.stringify(await backup(store, path)));
        break;
      case "restore":
        if (!path)
          throw new Error(
            "Supply a verified backup directory and empty target configuration.",
          );
        console.log(JSON.stringify(await restoreBackup(store, path)));
        break;
      case "maintenance":
        console.log(
          JSON.stringify(
            await maintain(store, {
              dryRun: !process.argv.includes("--execute"),
            }),
          ),
        );
        break;
      default:
        throw new Error(
          "Usage: bun run ops status|backup DIRECTORY|verify DIRECTORY|restore DIRECTORY|maintenance [--execute]",
        );
    }
  } finally {
    await store.db.close();
  }
}
