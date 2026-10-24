import { afterEach, expect, test } from "bun:test";
import { Store } from "./mongo";
import { createApp } from "./support/legacy-app";
import { uid, operationSchema, type Theme, type User } from "../shared/schema";
import { THEMES, resolveFontSize, resolveTheme } from "../shared/themes";
import { makeDocument } from "../shared/templates";
import { applyOperations, newElement } from "../shared/operations";
import {
  contrastIssues,
  readablePalette,
  type SavedTheme,
} from "../shared/design-library";
const stores: Store[] = [];
afterEach(async () => {
  for (const s of stores.splice(0)) await s.db.close();
});
const req = (method: string, cookie: string, body?: unknown) => ({
  method,
  headers: { cookie, "content-type": "application/json" },
  ...(body ? { body: JSON.stringify(body) } : {}),
});
async function setup() {
  const store = new Store(":memory:");
  stores.push(store);
  const app = createApp(store);
  async function account() {
    const r = await app.request(
      "/api/auth/signup",
      req("POST", "", {
        name: "Design tester",
        email: `${uid()}@example.test`,
        password: "test-design-passphrase",
      }),
    );
    expect(r.status).toBe(200);
    const { user } = (await r.json()) as {
      user: User;
    };
    return { user, cookie: r.headers.get("set-cookie")!.split(";")[0] };
  }
  return { store, app, account };
}
test("theme sizes resolve from a layout base; explicit sizes and object geometry survive multi-slide styling and reset", () => {
  const doc = makeDocument("u", "w", "Design", "story", "studio"),
    slide = doc.slides[0],
    el = slide.elements.find((e) => e.type === "text")!;
  el.baseFontSize = 80;
  delete el.fontSize;
  const theme: Theme = {
    ...THEMES[2],
    id: uid(),
    typeScale: { heading: 1.2, body: 1.1, label: 1 },
  };
  const next = applyOperations(doc, [
    { type: "theme.apply", theme, slideIds: [slide.id, doc.slides[2].id] },
  ]);
  expect(
    resolveFontSize(
      next.slides[0].elements.find((e) => e.id === el.id)!,
      resolveTheme(next, next.slides[0]),
    ),
  ).toBe(96);
  expect(next.slides[1]).toBe(doc.slides[1]);
  expect(next.slides[0].elements).toEqual(slide.elements);
  expect(doc.themeId).toBe("studio");
  const override = applyOperations(next, [
    {
      type: "element.update",
      slideId: slide.id,
      ids: [el.id],
      patch: { fontSize: 53, color: "#123456", radius: 7 },
    },
  ]);
  expect(
    resolveFontSize(
      override.slides[0].elements.find((e) => e.id === el.id)!,
      theme,
    ),
  ).toBe(53);
  const op = JSON.parse(
    JSON.stringify({ type: "element.reset", slideId: slide.id, ids: [el.id] }),
  );
  expect(operationSchema.safeParse(op).success).toBe(true);
  const reset = applyOperations(override, [op]);
  const target = reset.slides[0].elements.find((e) => e.id === el.id)!;
  expect(resolveFontSize(target, theme)).toBe(96);
  expect(target.color).toBeUndefined();
  expect(target.x).toBe(el.x);
  expect(target.text).toBe(el.text);
  expect(
    override.slides[0].elements.find((e) => e.id === el.id)!.fontSize,
  ).toBe(53);
});
test("theme IDs identify immutable snapshots; a same-ID edit cannot silently restyle other slides", () => {
  const doc = makeDocument("u", "w", "Design", "story", "studio");
  expect(() =>
    applyOperations(doc, [
      {
        type: "theme.apply",
        theme: {
          ...THEMES[0],
          colors: { ...THEMES[0].colors, background: "#000000" },
        },
        slideIds: [doc.slides[0].id],
      },
    ]),
  ).toThrow("immutable");
  expect(doc.themes[0].colors.background).toBe(THEMES[0].colors.background);
});
test("palette contrast fixes cover base text roles and surfaces", () => {
  const colors = {
    ...THEMES[0].colors,
    foreground: "#777777",
    background: "#777777",
    surface: "#777777",
    accent: "#888888",
  };
  expect(contrastIssues(colors).length).toBeGreaterThan(0);
  expect(contrastIssues(readablePalette(colors))).toEqual([]);
  expect(resolveFontSize(newElement("table"), THEMES[0])).toBe(26);
});
test("saved designs are versioned, owned and separate from embedded deck snapshots", async () => {
  const { store, app, account } = await setup(),
    a = await account(),
    b = await account();
  const result = await app.request(
    "/api/themes",
    req("POST", a.cookie, { theme: THEMES[0] }),
  );
  expect(result.status).toBe(201);
  const saved = (await result.json()) as SavedTheme;
  expect(saved.theme.id).not.toBe(THEMES[0].id);
  expect(saved.theme.custom).toBe(true);
  const doc = await store.create(a.user, "My design", "blank", "studio");
  const applied = await store.mutate(doc.id, a.user, 0, [
    { type: "theme.apply", theme: saved.theme },
  ]);
  const changed = await app.request(
    `/api/themes/${saved.id}`,
    req("PUT", a.cookie, {
      revision: 0,
      theme: { ...saved.theme, name: "Updated design" },
    }),
  );
  expect(changed.status).toBe(200);
  const newer = (await changed.json()) as SavedTheme;
  expect(newer.revision).toBe(1);
  expect(newer.theme.id).not.toBe(saved.theme.id);
  expect((await store.access(doc.id, a.user)).themeId).toBe(applied.themeId);
  expect(
    (await store.access(doc.id, a.user)).themes.find(
      (t) => t.id === saved.theme.id,
    )?.name,
  ).toBe(saved.theme.name);
  expect(
    (
      await app.request(
        `/api/themes/${saved.id}`,
        req("PUT", a.cookie, { revision: 0, theme: saved.theme }),
      )
    ).status,
  ).toBe(409);
  expect(
    await (await app.request("/api/themes", req("GET", b.cookie))).json(),
  ).toEqual([]);
  for (const method of ["PUT", "DELETE"])
    expect(
      (
        await app.request(
          `/api/themes/${saved.id}`,
          req(method, b.cookie, { theme: saved.theme, revision: 1 }),
        )
      ).status,
    ).toBe(404);
  expect(
    (await app.request(`/api/themes/${saved.id}`, req("DELETE", a.cookie)))
      .status,
  ).toBe(200);
  expect((await store.access(doc.id, a.user)).themeId).toBe(saved.theme.id);
  await store.db.update("members",{userId:a.user.id},{$set:{role:"viewer"}});
  expect(
    (
      await app.request(
        "/api/themes",
        req("POST", a.cookie, { theme: THEMES[0] }),
      )
    ).status,
  ).toBe(403);
});
test("brand kits validate logo asset ownership and persist colors, fonts and rules", async () => {
  const { store, app, account } = await setup(),
    a = await account(),
    b = await account();
  const kit = {
    name: "Fieldwork",
    colors: THEMES[0].colors,
    headingFont: "Manrope",
    bodyFont: "DM Sans",
    rules: "Always leave clear space.",
    logo: null,
  };
  const response = await app.request(
    "/api/brand-kits",
    req("POST", a.cookie, { kit }),
  );
  expect(response.status).toBe(201);
  const saved = await response.json();
  expect(saved.kit).toEqual(kit);
  expect(
    (await app.request(`/api/brand-kits/${saved.id}`, req("DELETE", b.cookie)))
      .status,
  ).toBe(404);
  const foreign = uid();
  await store.db.insert("assets",{id:foreign,ownerId:b.user.id,workspaceId:b.user.workspaceId,name:"logo",mime:"image/webp",bytes:1,storageKey:foreign,createdAt:new Date().toISOString()});
  expect(
    (
      await app.request(
        "/api/brand-kits",
        req("POST", a.cookie, {
          kit: { ...kit, logo: { src: `/api/assets/${foreign}`, alt: "Logo" } },
        }),
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await app.request(
        "/api/brand-kits",
        req("POST", a.cookie, {
          kit: {
            ...kit,
            logo: { src: "https://example.test/logo.svg", alt: "Logo" },
          },
        }),
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await app.request(
        `/api/brand-kits/${saved.id}`,
        req("PUT", a.cookie, {
          revision: 0,
          kit: { ...kit, rules: "Use sparingly." },
        }),
      )
    ).status,
  ).toBe(200);
  expect(
    (
      await app.request(
        `/api/brand-kits/${saved.id}`,
        req("PUT", a.cookie, { revision: 0, kit }),
      )
    ).status,
  ).toBe(409);
  expect(
    await store.db.one("schemaMigrations",{id:"1"}),
  ).toBeTruthy();
});
test("custom-theme creation validates and embeds a snapshot in the new owned deck", async () => {
  const { app, account } = await setup(),
    a = await account();
  const theme = {
    ...THEMES[0],
    id: uid(),
    name: "New workspace theme",
    custom: true,
  };
  const created = await app.request(
    "/api/decks",
    req("POST", a.cookie, {
      title: "Created with theme",
      template: "story",
      theme,
    }),
  );
  expect(created.status).toBe(201);
  const deck = await created.json();
  expect(deck.themeId).toBe(theme.id);
  expect(deck.themes.find((t: Theme) => t.id === theme.id)).toEqual(theme);
  expect(deck.ownerId).toBe(a.user.id);
  const bad = await app.request(
    "/api/decks",
    req("POST", a.cookie, {
      title: "Invalid theme",
      theme: {
        ...theme,
        colors: { ...theme.colors, accent: "javascript:alert(1)" },
      },
    }),
  );
  expect(bad.status).toBe(400);
});
