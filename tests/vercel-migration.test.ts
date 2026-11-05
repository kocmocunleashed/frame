import { test, expect } from "bun:test";
import { postgresArchive } from "../scripts/export-legacy-postgres";
import { importLegacy } from "../scripts/import-legacy";
import { Store } from "./postgres";
import { makeDocument } from "../shared/templates";
import { createApp } from "../server/app";

test("the earlier Vercel schema preserves users, password login, workspaces, slides, revisions and publications", async () => {
  const target = new Store(),
    password = "legacy-password-test-only";
  try {
    await target.testReady;
    const doc = makeDocument(
      "legacy-owner",
      "legacy-workspace",
      "Keep the existing deck",
      "story",
    );
    const { slides, ...metadata } = doc;
    const source = {
      users: [
        {
          id: doc.ownerId,
          name: "Existing owner",
          email: "existing-owner@example.test",
          password_hash: await Bun.password.hash(password),
          created_at: doc.createdAt,
        },
      ],
      workspaces: [
        {
          id: doc.workspaceId,
          owner_id: doc.ownerId,
          name: "Existing workspace",
        },
      ],
      members: [
        { workspace_id: doc.workspaceId, user_id: doc.ownerId, role: "owner" },
      ],
      presentations: [
        {
          id: doc.id,
          owner_id: doc.ownerId,
          workspace_id: doc.workspaceId,
          metadata: JSON.stringify(metadata),
          created_at: doc.createdAt,
          updated_at: doc.updatedAt,
        },
      ],
      slides: slides.map((slide, position) => ({
        id: slide.id,
        presentation_id: doc.id,
        position,
        data: JSON.stringify(slide),
      })),
      revisions: [
        {
          id: "legacy-revision",
          presentation_id: doc.id,
          revision: doc.revision,
          document: JSON.stringify(doc),
          created_at: doc.createdAt,
        },
      ],
      publications: [
        {
          id: "legacy-publication",
          presentation_id: doc.id,
          owner_id: doc.ownerId,
          visibility: "unlisted",
          allow_download: 0,
          revision: doc.revision,
          document: JSON.stringify(doc),
          edition: 1,
          revoked_at: null,
          created_at: doc.createdAt,
          updated_at: doc.updatedAt,
        },
      ],
      jobs: [
        {
          id: "old-job-with-deleted-draft",
          owner_id: doc.ownerId,
          presentation_id: doc.id,
          parent_id: null,
          kind: "creation",
          status: "succeeded",
          progress: "{}",
          payload: JSON.stringify({ draftId: "old-removed-draft" }),
          result: "{}",
          error: null,
          attempts: 1,
          created_at: doc.createdAt,
          updated_at: doc.updatedAt,
        },
      ],
    };
    const archive = postgresArchive(source);
    expect((await importLegacy(target, archive)).applied).toBe(false);
    expect(await target.db.count("users")).toBe(0);
    await importLegacy(target, archive, { apply: true });
    expect(
      await target.access(doc.id, (await target.user(doc.ownerId))!),
    ).toEqual(doc);
    expect(await target.db.count("publicationEditions")).toBe(1);
    expect(
      (await target.db.one("jobs", { id: "old-job-with-deleted-draft" }))
        .draftId,
    ).toBeNull();
    const app = createApp(target),
      origin = "http://127.0.0.1:5174";
    const login = await app.request(origin + "/api/auth/sign-in/email", {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify({ email: source.users[0].email, password }),
    });
    expect(login.status).toBe(200);
    expect((await login.json()).user.id).toBe(doc.ownerId);
    expect(await target.db.count("workspaces")).toBe(1);
    expect(() =>
      postgresArchive({
        ...source,
        unknown_data: [{ id: "must-not-discard" }],
      }),
    ).toThrow("Unknown nonempty");
  } finally {
    await target.db.close();
  }
});
