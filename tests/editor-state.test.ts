import { afterAll, afterEach, describe, test, expect } from "bun:test";
import { Window } from "happy-dom";
import { makeDocument } from "../shared/templates";
import { applyOperations } from "../shared/operations";
import { newElement } from "../shared/operations";
import { documentSchema, type FrameDocument } from "../shared/schema";
const window = new Window({ url: "http://127.0.0.1:5174" });
const browserGlobals = [
  "window",
  "document",
  "navigator",
  "HTMLElement",
  "HTMLInputElement",
  "HTMLTextAreaElement",
  "Event",
  "MouseEvent",
  "KeyboardEvent",
  "PopStateEvent",
  "BeforeUnloadEvent",
  "localStorage",
  "sessionStorage",
  "history",
  "location",
  "IS_REACT_ACT_ENVIRONMENT",
] as const;
const originalGlobals = new Map(
  browserGlobals.map((key) => [
    key,
    Object.getOwnPropertyDescriptor(globalThis, key),
  ]),
);
for (const key of browserGlobals)
  Object.defineProperty(globalThis, key, {
    value:
      key === "window"
        ? window
        : (window as unknown as Record<string, unknown>)[key],
    writable: true,
    configurable: true,
  });
Object.defineProperty(window.navigator, "onLine", {
  value: true,
  writable: true,
  configurable: true,
});
Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  value: true,
  writable: true,
  configurable: true,
});
const { renderHook, act, cleanup, waitFor } =
  await import("@testing-library/react");
const { useDocument } = await import("../src/lib/useDocument");
const originalFetch = globalThis.fetch;
let serverDoc: FrameDocument;
let writes = 0;
let rejectWrites: number | null = null;
let disconnected = false;
function setup() {
  serverDoc = makeDocument("o", "w", "An editable story", "story");
  writes = 0;
  rejectWrites = null;
  disconnected = false;
  window.localStorage.clear();
  Object.defineProperty(window.navigator, "onLine", {
    value: true,
    writable: true,
    configurable: true,
  });
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    if (disconnected) throw new TypeError("Network request failed");
    if (!init?.method || init.method === "GET") return Response.json(serverDoc);
    writes++;
    if (rejectWrites)
      return Response.json(
        {
          error:
            rejectWrites === 409
              ? "Changed in another tab"
              : "Server temporarily unavailable",
        },
        { status: rejectWrites },
      );
    const body = JSON.parse(init.body as string);
    if (body.baseRevision !== serverDoc.revision)
      return Response.json({ error: "Changed elsewhere" }, { status: 409 });
    serverDoc = documentSchema.parse({
      ...body.document,
      revision: serverDoc.revision + 1,
      updatedAt: new Date().toISOString(),
    });
    return Response.json(serverDoc);
  }) as typeof fetch;
  return serverDoc.id;
}
afterAll(() => {
  for (const [key, descriptor] of originalGlobals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
  void window.happyDOM.close();
});
afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  window.localStorage.clear();
});
describe("actual editor history, autosave and recovery behavior", () => {
  test("editing, undo and redo persist the document users actually see", async () => {
    const id = setup();
    const { result } = renderHook(() => useDocument(id));
    await waitFor(() => expect(result.current.doc).not.toBeNull());
    const original = structuredClone(result.current.doc!),
      slide = original.slides[0],
      el = slide.elements.find((e) => e.type === "text")!;
    act(() =>
      result.current.execute({
        type: "element.update",
        slideId: slide.id,
        ids: [el.id],
        patch: { text: "My revised title" },
      }),
    );
    expect(result.current.canUndo).toBe(true);
    expect(
      result.current.doc!.slides[0].elements.find((e) => e.id === el.id)!.text,
    ).toBe("My revised title");
    act(() => result.current.undo());
    expect(result.current.doc!.slides).toEqual(original.slides);
    expect(result.current.canRedo).toBe(true);
    act(() => result.current.redo());
    await act(async () => {
      await result.current.save();
    });
    expect(serverDoc.slides[0].elements.find((e) => e.id === el.id)!.text).toBe(
      "My revised title",
    );
    expect(result.current.status).toBe("saved");
    expect(writes).toBe(1);
    expect(window.localStorage.getItem(`frame:recovery:o:${id}`)).toBeNull();
  });
  test("offline edits remain in a recovery copy and save on reconnection", async () => {
    const id = setup();
    const { result } = renderHook(() => useDocument(id));
    await waitFor(() => expect(result.current.doc).not.toBeNull());
    disconnected = true;
    Object.defineProperty(window.navigator, "onLine", {
      value: false,
      writable: true,
      configurable: true,
    });
    act(() =>
      result.current.execute({
        type: "document.update",
        patch: { title: "An offline idea" },
      }),
    );
    await act(async () => {
      await result.current.save();
    });
    expect(result.current.status).toBe("offline");
    expect(writes).toBe(0);
    const local = JSON.parse(
      window.localStorage.getItem(`frame:recovery:o:${id}`)!,
    );
    expect(local.document.title).toBe("An offline idea");
    disconnected = false;
    Object.defineProperty(window.navigator, "onLine", {
      value: true,
      writable: true,
      configurable: true,
    });
    await act(async () => {
      window.dispatchEvent(new window.Event("online"));
    });
    await waitFor(() => expect(result.current.status).toBe("saved"));
    expect(serverDoc.title).toBe("An offline idea");
  });
  test("a failed save keeps the changed document and recovery data", async () => {
    const id = setup();
    const { result } = renderHook(() => useDocument(id));
    await waitFor(() => expect(result.current.doc).not.toBeNull());
    rejectWrites = 503;
    act(() =>
      result.current.execute({
        type: "document.update",
        patch: { title: "Keep this work" },
      }),
    );
    await act(async () => {
      await result.current.save();
    });
    expect(result.current.status).toBe("failed");
    expect(result.current.doc!.title).toBe("Keep this work");
    expect(serverDoc.title).toBe("An editable story");
    expect(window.localStorage.getItem(`frame:recovery:o:${id}`)).toContain(
      "Keep this work",
    );
    rejectWrites = null;
    await act(async () => {
      await result.current.save();
    });
    expect(serverDoc.title).toBe("Keep this work");
  });
  test("revision conflicts stop writes and preserve both versions", async () => {
    const id = setup();
    const { result } = renderHook(() => useDocument(id));
    await waitFor(() => expect(result.current.doc).not.toBeNull());
    serverDoc = { ...serverDoc, title: "Another writer", revision: 1 };
    act(() =>
      result.current.execute({
        type: "document.update",
        patch: { title: "My version" },
      }),
    );
    await act(async () => {
      await result.current.save();
    });
    expect(result.current.conflict).toBe(true);
    expect(result.current.doc!.title).toBe("My version");
    expect(serverDoc.title).toBe("Another writer");
    const count = writes;
    await act(async () => {
      await result.current.save();
    });
    expect(writes).toBe(count);
  });
  test("reload offers recovery before replacing the server document", async () => {
    const id = setup();
    const recovered = applyOperations(serverDoc, [
      { type: "document.update", patch: { title: "Recovered idea" } },
    ]);
    window.localStorage.setItem(
      `frame:recovery:o:${id}`,
      JSON.stringify({
        document: recovered,
        baseRevision: 0,
        savedAt: new Date().toISOString(),
      }),
    );
    const { result } = renderHook(() => useDocument(id));
    await waitFor(() => expect(result.current.recovery).not.toBeNull());
    expect(result.current.doc!.title).toBe("An editable story");
    expect(writes).toBe(0);
    act(() => result.current.recover());
    await act(async () => {
      await result.current.save();
    });
    expect(serverDoc.title).toBe("Recovered idea");
  });
  test("a fresh edit after undo clears redo without touching unrelated slides", async () => {
    const id = setup();
    const { result } = renderHook(() => useDocument(id));
    await waitFor(() => expect(result.current.doc).not.toBeNull());
    const rest = structuredClone(result.current.doc!.slides.slice(1));
    act(() =>
      result.current.execute({
        type: "document.update",
        patch: { title: "First" },
      }),
    );
    act(() => result.current.undo());
    expect(result.current.canRedo).toBe(true);
    act(() =>
      result.current.execute({
        type: "document.update",
        patch: { title: "A new direction" },
      }),
    );
    expect(result.current.canRedo).toBe(false);
    expect(result.current.doc!.slides.slice(1)).toEqual(rest);
    await act(async () => {
      await result.current.save();
    });
  });
});
test("explicit save waits for in-flight work and flushes the newest edit", async () => {
  const id = setup();
  const adapter = globalThis.fetch;
  let release: (() => Promise<void>) | undefined;
  let held = false;
  globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
    if (init?.method === "PUT" && !held) {
      held = true;
      return await new Promise<Response>((resolve) => {
        release = async () => resolve(await adapter(url as RequestInfo, init));
      });
    }
    return adapter(url as RequestInfo, init);
  }) as typeof fetch;
  const { result } = renderHook(() => useDocument(id));
  await waitFor(() => expect(result.current.doc).not.toBeNull());
  act(() =>
    result.current.execute({
      type: "document.update",
      patch: { title: "First change" },
    }),
  );
  let first: Promise<void>;
  await act(async () => {
    first = result.current.save();
  });
  await waitFor(() => expect(held).toBe(true));
  act(() =>
    result.current.execute({
      type: "document.update",
      patch: { title: "Newest change" },
    }),
  );
  let secondDone = false;
  const second = result.current.save().then(() => {
    secondDone = true;
  });
  await Promise.resolve();
  expect(secondDone).toBe(false);
  await act(async () => {
    await release!();
    await first!;
    await second;
  });
  expect(serverDoc.title).toBe("Newest change");
  expect(result.current.status).toBe("saved");
});
test("actions requiring a saved version can detect failed saves", async () => {
  const id = setup();
  const { result } = renderHook(() => useDocument(id));
  await waitFor(() => expect(result.current.doc).not.toBeNull());
  rejectWrites = 503;
  act(() =>
    result.current.execute({
      type: "document.update",
      patch: { title: "An unsaved change" },
    }),
  );
  let confirmed = true;
  await act(async () => {
    confirmed = await result.current.saveAndConfirm();
  });
  expect(confirmed).toBe(false);
  expect(serverDoc.title).toBe("An editable story");
  rejectWrites = null;
  await act(async () => {
    confirmed = await result.current.saveAndConfirm();
  });
  expect(confirmed).toBe(true);
  expect(serverDoc.title).toBe("An unsaved change");
});
test("repeated text edits coalesce into one undo transaction and redo remains consistent", async () => {
  const id = setup();
  const { result } = renderHook(() => useDocument(id));
  await waitFor(() => expect(result.current.doc).not.toBeNull());
  const slide = result.current.doc!.slides[0],
    el = slide.elements.find((e) => e.type === "text")!,
    original = el.text;
  act(() =>
    result.current.execute({
      type: "element.update",
      slideId: slide.id,
      ids: [el.id],
      patch: { text: "First typed text" },
    }),
  );
  act(() =>
    result.current.execute({
      type: "element.update",
      slideId: slide.id,
      ids: [el.id],
      patch: { text: "The completed thought" },
    }),
  );
  act(() => result.current.undo());
  expect(
    result.current.doc!.slides[0].elements.find((e) => e.id === el.id)!.text,
  ).toBe(original);
  act(() => result.current.redo());
  expect(
    result.current.doc!.slides[0].elements.find((e) => e.id === el.id)!.text,
  ).toBe("The completed thought");
  await act(async () => {
    await result.current.save();
  });
});
test("structured timeline changes keep separate undo boundaries even when committed quickly", async () => {
  const id = setup(),
    { result } = renderHook(() => useDocument(id));
  await waitFor(() => expect(result.current.doc).not.toBeNull());
  const slide = result.current.doc!.slides[0],
    timeline = newElement("timeline");
  act(() =>
    result.current.execute({
      type: "element.insert",
      slideId: slide.id,
      elements: [timeline],
    }),
  );
  const dated = {
    ...timeline.timeline!,
    items: timeline.timeline!.items.map((item, i) =>
      i === 0 ? { ...item, date: "2026" } : item,
    ),
  };
  act(() =>
    result.current.execute({
      type: "element.update",
      slideId: slide.id,
      ids: [timeline.id],
      patch: { timeline: dated },
    }),
  );
  act(() =>
    result.current.execute({
      type: "element.update",
      slideId: slide.id,
      ids: [timeline.id],
      patch: {
        timeline: {
          ...dated,
          items: [dated.items[1], dated.items[0], ...dated.items.slice(2)],
        },
      },
    }),
  );
  act(() => result.current.undo());
  const restored = result.current.doc!.slides[0].elements.find(
    (el) => el.id === timeline.id,
  )!.timeline!;
  expect(restored.items[0].date).toBe("2026");
  expect(restored.items[0].id).toBe(timeline.timeline!.items[0].id);
  await act(async () => {
    await result.current.save();
  });
});
