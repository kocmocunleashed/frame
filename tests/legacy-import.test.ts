import { test, expect } from "bun:test";
import { Store } from "./postgres";
import { tables } from "../server/db/schema";
import { importLegacy } from "../scripts/import-legacy";

test("legacy import dry-runs, preserves IDs and slide content, and rejects populated or invalid targets", async () => {
  const source = new Store(),
    target = new Store();
  try {
    const user = await source.createUser(
      "Imported owner",
      "imported@example.test",
    );
    const doc = await source.create(
      user,
      "Keep every slide",
      "story",
      "studio",
    );
    await target.testReady;
    const resources: Record<string, Record<string, unknown>[]> = {};
    for (const name of Object.keys(tables))
      if (!["snapshots", "slides"].includes(name))
        resources[name] = await source.db.find(
          name,
          {},
          { hydrateSnapshot: false },
        );
    const archive = {
      version: 1,
      resources,
      snapshots: [
        {
          id: (await source.db.one("decks", { id: doc.id })).headSnapshotId,
          document: doc,
        },
      ],
    };
    expect((await importLegacy(target, archive)).applied).toBe(false);
    expect(await target.db.count("users")).toBe(0);
    expect((await importLegacy(target, archive, { apply: true })).applied).toBe(
      true,
    );
    expect(await target.access(doc.id, user)).toEqual(doc);
    expect((await target.user(user.id))?.workspaceId).toBe(user.workspaceId);
    expect(await target.db.count("accounts")).toBe(0);
    await expect(
      importLegacy(target, archive, { apply: true }),
    ).rejects.toThrow("empty");
    const empty = new Store();
    try {
      await empty.testReady;
      const broken = structuredClone(archive);
      broken.resources.members[0].userId = "nonexistent";
      await expect(
        importLegacy(empty, broken, { apply: true }),
      ).rejects.toThrow();
      expect(await empty.db.count("users")).toBe(0);
      const unknown = structuredClone(archive);
      unknown.resources.unknown = [{ id: "preserve-me" }];
      await expect(importLegacy(empty, unknown)).rejects.toThrow(
        "Unsupported import resource",
      );
    } finally {
      await empty.db.close();
    }
  } finally {
    await source.db.close();
    await target.db.close();
  }
});
