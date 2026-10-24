import { describe, test, expect } from "bun:test";
import { documentSchema, themeSchema } from "../shared/schema";
import { makeDocument, layoutSlide } from "../shared/templates";
import { applyOperations, cloneSlide, newElement } from "../shared/operations";
import { THEMES } from "../shared/themes";
const fresh = () => makeDocument("owner", "workspace", "Test", "story");
describe("versioned document and explicit operations", () => {
  test("every curated theme and template validates", () => {
    for (const theme of THEMES) {
      expect(themeSchema.safeParse(theme).success).toBe(true);
      for (const template of ["blank", "story", "lesson", "pitch"])
        expect(
          documentSchema.safeParse(
            makeDocument("owner", "workspace", "Example", template, theme.id),
          ).success,
        ).toBe(true);
    }
  });
  test("input is immutable and a targeted edit leaves unrelated elements unchanged", () => {
    const doc = fresh(),
      s = doc.slides[0],
      target = s.elements.find((e) => e.type === "text")!;
    const before = structuredClone(doc);
    const next = applyOperations(doc, [
      {
        type: "element.update",
        slideId: s.id,
        ids: [target.id],
        patch: { text: "A precise change" },
      },
    ]);
    expect(doc).toEqual(before);
    expect(next.slides[0].elements.find((e) => e.id === target.id)?.text).toBe(
      "A precise change",
    );
    expect(next.slides.slice(1)).toEqual(doc.slides.slice(1));
    expect(next.slides[0].elements.filter((e) => e.id !== target.id)).toEqual(
      s.elements.filter((e) => e.id !== target.id),
    );
  });
  test("theme switching preserves geometry, text and explicit overrides", () => {
    const doc = fresh(),
      s = doc.slides[0],
      el = s.elements[0];
    el.fill = "#fa1122";
    el.radius = 7;
    const next = applyOperations(doc, [
      { type: "theme.apply", theme: THEMES[3] },
    ]);
    expect(next.slides).toEqual(doc.slides);
    expect(next.themeId).toBe(THEMES[3].id);
    expect(next.slides[0].elements[0].fill).toBe("#fa1122");
  });
  test("slide-scoped theme application leaves the rest of the deck intact", () => {
    const doc = fresh();
    const next = applyOperations(doc, [
      { type: "theme.apply", theme: THEMES[4], slideIds: [doc.slides[1].id] },
    ]);
    expect(next.themeId).toBe(doc.themeId);
    expect(next.slides[0]).toEqual(doc.slides[0]);
    expect(next.slides[1].themeId).toBe(THEMES[4].id);
  });
  test("invalid operations are atomic and never mutate the source", () => {
    const doc = fresh(),
      before = structuredClone(doc);
    expect(() =>
      applyOperations(doc, [
        { type: "document.update", patch: { title: "Would be changed" } },
        {
          type: "element.update",
          slideId: "missing",
          ids: ["missing"],
          patch: { x: 42 },
        },
      ]),
    ).toThrow();
    expect(doc).toEqual(before);
  });
  test("duplicate IDs and unresolved theme references are rejected", () => {
    const doc = fresh();
    doc.slides[0].elements[0].id = doc.slides[1].elements[0].id;
    expect(documentSchema.safeParse(doc).success).toBe(false);
    doc.slides[0].elements[0].id = crypto.randomUUID();
    doc.themeId = "unknown";
    expect(documentSchema.safeParse(doc).success).toBe(false);
  });
  test("at least one slide is retained", () => {
    const doc = makeDocument("o", "w");
    expect(() =>
      applyOperations(doc, [
        { type: "slide.delete", slideId: doc.slides[0].id },
      ]),
    ).toThrow("at least one");
  });
  test("reorder requires every member exactly once", () => {
    const doc = fresh();
    expect(() =>
      applyOperations(doc, [{ type: "slide.order", ids: [doc.slides[0].id] }]),
    ).toThrow();
    expect(() =>
      applyOperations(doc, [
        { type: "element.order", slideId: doc.slides[0].id, ids: [] },
      ]),
    ).toThrow();
    const ids = doc.slides.map((s) => s.id).reverse();
    expect(
      applyOperations(doc, [{ type: "slide.order", ids }]).slides.map(
        (s) => s.id,
      ),
    ).toEqual(ids);
  });
  test("slide duplication remaps element and interaction identities", () => {
    const s = layoutSlide("title");
    s.interactions = [
      {
        id: "interaction",
        trigger: "click",
        target: s.elements[0].id,
        action: "show",
        value: s.elements[1].id,
      },
    ];
    const copy = cloneSlide(s);
    expect(copy.id).not.toBe(s.id);
    expect(
      copy.elements.every((e) => !s.elements.some((old) => old.id === e.id)),
    ).toBe(true);
    expect(copy.interactions[0].target).toBe(copy.elements[0].id);
    expect(copy.interactions[0].value).toBe(copy.elements[1].id);
  });
  test("invalid geometry and unsafe image URLs are rejected", () => {
    const doc = fresh();
    doc.slides[0].elements.push(
      newElement("image", { src: "javascript:alert(1)" }),
    );
    expect(documentSchema.safeParse(doc).success).toBe(false);
    doc.slides[0].elements.pop();
    doc.slides[0].elements[0].width = NaN;
    expect(documentSchema.safeParse(doc).success).toBe(false);
  });
  test("editor interaction state cannot leak into the source of truth", () => {
    const doc = documentSchema.parse({
      ...fresh(),
      selected: ["fake"],
      zoom: 3,
      openPanel: "themes",
    });
    expect("selected" in doc).toBe(false);
    expect("zoom" in doc).toBe(false);
  });
});
test("an object edit keeps unrelated slide and object identities stable for memoized rendering", () => {
  const doc = fresh(),
    slide = doc.slides[0],
    el = slide.elements[1],
    other = slide.elements[0];
  const next = applyOperations(doc, [
    {
      type: "element.update",
      slideId: slide.id,
      ids: [el.id],
      patch: { text: "A focused change" },
    },
  ]);
  expect(next.slides[1]).toBe(doc.slides[1]);
  expect(next.slides[0].elements[0]).toBe(other);
  expect(next.themes).toBe(doc.themes);
  expect(next.slides[0].elements[1]).not.toBe(el);
});
test("partial text and notes edits preserve transforms, locks, visibility and interactions", () => {
  const doc = fresh(),
    slide = doc.slides[0],
    el = slide.elements.find((e) => e.type === "text")!;
  Object.assign(el, { rotation: 37, opacity: 0.4, locked: true, hidden: true });
  slide.interactions = [
    {
      id: "keep-rule",
      trigger: "click",
      target: el.id,
      action: "show",
      value: slide.elements[0].id,
    },
  ];
  const next = applyOperations(doc, [
    {
      type: "element.update",
      slideId: slide.id,
      ids: [el.id],
      patch: { text: "Revised text" },
    },
    {
      type: "slide.update",
      slideId: slide.id,
      patch: { notes: "Revised private notes" },
    },
  ]);
  const edited = next.slides[0].elements.find((e) => e.id === el.id)!;
  expect(edited.rotation).toBe(37);
  expect(edited.opacity).toBe(0.4);
  expect(edited.locked).toBe(true);
  expect(edited.hidden).toBe(true);
  expect(next.slides[0].interactions).toEqual(slide.interactions);
});
test("undefined patch values cannot erase required transform or interaction fields", () => {
  const doc = fresh(),
    s = doc.slides[0],
    el = s.elements[0];
  el.rotation = 25;
  const next = applyOperations(doc, [
    {
      type: "element.update",
      slideId: s.id,
      ids: [el.id],
      patch: { rotation: undefined },
    },
    { type: "slide.update", slideId: s.id, patch: { interactions: undefined } },
  ]);
  expect(next.slides[0].elements[0].rotation).toBe(25);
  expect(next.slides[0].interactions).toEqual(s.interactions);
});
test("interaction references validate and deleting objects/slides removes affected behaviors without touching other slides", () => {
  const doc = fresh(),
    slide = doc.slides[0],
    other = structuredClone(doc.slides[1]),
    first = slide.elements[0],
    second = slide.elements[1];
  slide.interactions = [
    {
      id: "explanation-rule",
      trigger: "click",
      target: first.id,
      action: "show",
      value: second.id,
    },
    {
      id: "navigation-rule",
      trigger: "click",
      target: first.id,
      action: "navigate",
      value: other.id,
    },
  ];
  const removedObject = applyOperations(doc, [
    { type: "element.delete", slideId: slide.id, ids: [second.id] },
  ]);
  expect(removedObject.slides[0].interactions.map((i) => i.id)).toEqual([
    "navigation-rule",
  ]);
  expect(removedObject.slides[1]).toBe(doc.slides[1]);
  const removedSlide = applyOperations(doc, [
    { type: "slide.delete", slideId: other.id },
  ]);
  expect(removedSlide.slides[0].interactions.map((i) => i.id)).toEqual([
    "explanation-rule",
  ]);
  const invalid = structuredClone(doc);
  invalid.slides[0].interactions[0].value = "missing-element";
  expect(documentSchema.safeParse(invalid).success).toBe(false);
});
