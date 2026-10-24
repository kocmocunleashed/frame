import {
  documentSchema,
  operationSchema,
  uid,
  type FrameDocument,
  type FrameElement,
  type Operation,
  type Slide,
} from "./schema";

export function applyOperations(
  input: FrameDocument,
  operations: Operation[],
): FrameDocument {
  const doc: FrameDocument = {
    ...input,
    version: 2,
    slides: [...input.slides],
    themes: input.themes,
  };
  const copiedSlides = new Set<string>();
  for (const raw of operations) {
    const op = operationSchema.parse(raw);
    const getSlide = (id: string, mutable = true) => {
      const index = doc.slides.findIndex((s) => s.id === id);
      if (index < 0) throw new Error("The selected slide no longer exists.");
      if (mutable && !copiedSlides.has(id)) {
        doc.slides[index] = {
          ...doc.slides[index],
          elements: [...doc.slides[index].elements],
        };
        copiedSlides.add(id);
      }
      return doc.slides[index];
    };
    switch (op.type) {
      case "text.set": {
        const s = getSlide(op.slideId),
          index = s.elements.findIndex(
            (el) => el.id === op.id && el.type === "text",
          );
        if (index < 0)
          throw new Error("The selected text object no longer exists.");
        s.elements[index] = {
          ...s.elements[index],
          text: op.text,
          richText: op.richText || undefined,
        };
        if (s.sourceSupport)
          s.sourceSupport = { ...s.sourceSupport, reviewRequired: true };
        break;
      }
      case "element.update": {
        const s = getSlide(op.slideId);
        for (const id of op.ids) {
          const index = s.elements.findIndex((e) => e.id === id);
          if (index < 0)
            throw new Error("The selected object no longer exists.");
          const previous = s.elements[index],
            patch = { ...op.patch };
          for (const key of [
            "rotation",
            "opacity",
            "locked",
            "hidden",
          ] as const)
            if (patch[key] === undefined) delete patch[key];
          s.elements[index] = { ...previous, ...patch };
          if (
            (patch.text !== undefined || patch.richText !== undefined) &&
            s.sourceSupport
          )
            s.sourceSupport = { ...s.sourceSupport, reviewRequired: true };
        }
        break;
      }
      case "element.insert":
        getSlide(op.slideId).elements.push(...op.elements);
        break;
      case "element.reset": {
        const s = getSlide(op.slideId);
        if (op.ids.some((id) => !s.elements.some((el) => el.id === id)))
          throw new Error("The selected object no longer exists.");
        s.elements = s.elements.map((el) =>
          op.ids.includes(el.id) ? { ...el, ...resetStyle() } : el,
        );
        break;
      }
      case "element.delete": {
        const s = getSlide(op.slideId);
        s.elements = s.elements.filter((e) => !op.ids.includes(e.id));
        s.interactions = s.interactions.filter(
          (i) =>
            !op.ids.includes(i.target) &&
            !(i.action === "show" && op.ids.includes(i.value)),
        );
        break;
      }
      case "element.order": {
        const s = getSlide(op.slideId);
        if (
          new Set(op.ids).size !== s.elements.length ||
          op.ids.length !== s.elements.length ||
          op.ids.some((id) => !s.elements.some((e) => e.id === id))
        )
          throw new Error(
            "Layer order must contain every object exactly once.",
          );
        s.elements = op.ids.map((id) => s.elements.find((e) => e.id === id)!);
        break;
      }
      case "slide.insert":
        doc.slides.splice(Math.min(op.index, doc.slides.length), 0, op.slide);
        break;
      case "slide.delete":
        if (doc.slides.length === 1)
          throw new Error("Keep at least one slide in your presentation.");
        doc.slides = doc.slides.filter((s) => s.id !== op.slideId);
        for (const slide of doc.slides)
          if (
            slide.interactions.some(
              (i) => i.action === "navigate" && i.value === op.slideId,
            )
          )
            getSlide(slide.id).interactions = slide.interactions.filter(
              (i) => !(i.action === "navigate" && i.value === op.slideId),
            );
        break;
      case "slide.update": {
        const patch = { ...op.patch };
        if (patch.interactions === undefined) delete patch.interactions;
        Object.assign(getSlide(op.slideId), patch);
        break;
      }
      case "slide.order":
        if (
          new Set(op.ids).size !== doc.slides.length ||
          op.ids.length !== doc.slides.length ||
          op.ids.some((id) => !doc.slides.some((s) => s.id === id))
        )
          throw new Error("Slide order must contain every slide exactly once.");
        doc.slides = op.ids.map((id) => getSlide(id, false));
        break;
      case "theme.apply": {
        const index = doc.themes.findIndex((t) => t.id === op.theme.id);
        if (
          index >= 0 &&
          JSON.stringify(doc.themes[index]) !== JSON.stringify(op.theme)
        )
          throw new Error(
            "Theme snapshots are immutable. Save a new theme version before applying changes.",
          );
        doc.themes = [...doc.themes];
        if (index < 0 && doc.themes.length >= 100) {
          const used = new Set([
            doc.themeId,
            ...doc.slides.map((s) => s.themeId),
          ]);
          doc.themes = doc.themes.filter((t) => used.has(t.id));
        }
        if (index < 0) doc.themes.push(op.theme);
        else doc.themes[index] = op.theme;
        if (op.slideIds) {
          op.slideIds.forEach((id) => (getSlide(id).themeId = op.theme.id));
        } else {
          doc.themeId = op.theme.id;
          doc.slides = doc.slides.map((s) => {
            if (!s.themeId) return s;
            const copy = { ...s };
            delete copy.themeId;
            return copy;
          });
        }
        break;
      }
      case "document.update":
        Object.assign(doc, op.patch);
        break;
    }
  }
  documentSchema.parse(doc);
  return doc;
}
export function cloneSlides(slides: Slide[]): Slide[] {
  const result = structuredClone(slides),
    ids = new Map<string, string>();
  for (const slide of result) {
    ids.set(slide.id, uid());
    for (const el of slide.elements) {
      ids.set(el.id, uid());
      if (el.groupId && !ids.has(el.groupId)) ids.set(el.groupId, uid());
    }
  }
  for (const slide of result) {
    slide.id = ids.get(slide.id)!;
    for (const el of slide.elements) {
      el.id = ids.get(el.id)!;
      if (el.groupId) el.groupId = ids.get(el.groupId);
    }
    slide.interactions = slide.interactions.map((i) => ({
      ...i,
      id: uid(),
      target: ids.get(i.target) || i.target,
      value:
        i.action === "show" || i.action === "navigate"
          ? ids.get(i.value) || i.value
          : i.value,
    }));
  }
  return result;
}
export function cloneSlide(slide: Slide): Slide {
  const result = cloneSlides([slide])[0];
  result.title = `${slide.title} copy`;
  return result;
}
export function newElement(
  type: FrameElement["type"],
  patch: Partial<FrameElement> = {},
): FrameElement {
  return {
    id: uid(),
    type,
    name: type[0].toUpperCase() + type.slice(1),
    x: 120,
    y: 180,
    ...{
      width: type === "text" ? 580 : 260,
      height: type === "text" ? 100 : 260,
    },
    rotation: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    ...(type === "timeline"
      ? {
          width: 1040,
          height: 380,
          baseFontSize: 24,
          timeline: {
            arrangement: "horizontal" as const,
            items: ["Discover", "Build", "Launch"].map((label, i) => ({
              id: uid(),
              date: `0${i + 1}`,
              label,
              description: "Describe this milestone.",
            })),
          },
        }
      : type === "text"
        ? { text: "Make your point.", role: "body" as const, baseFontSize: 36 }
        : type === "shape"
          ? { shape: "rectangle" as const, fill: "accent" }
          : type === "image"
            ? { fit: "cover" as const, alt: "" }
            : type === "icon"
              ? {
                  icon: "sparkles" as const,
                  width: 140,
                  height: 140,
                  color: "accent",
                }
              : type === "table"
                ? {
                    width: 800,
                    height: 320,
                    baseFontSize: 26,
                    table: {
                      rows: [
                        ["Category", "Today", "Tomorrow"],
                        ["First idea", "Describe it", "Improve it"],
                        ["Next idea", "Explore it", "Build it"],
                      ],
                      header: true,
                    },
                  }
                : type === "chart"
                  ? {
                      width: 780,
                      height: 400,
                      baseFontSize: 22,
                      chart: {
                        kind: "bar" as const,
                        data: [
                          { label: "Explore", value: 30 },
                          { label: "Shape", value: 65 },
                          { label: "Share", value: 90 },
                        ],
                        showValues: true,
                      },
                    }
                  : type === "diagram"
                    ? {
                        width: 960,
                        height: 300,
                        baseFontSize: 24,
                        diagram: {
                          layout: "process" as const,
                          nodes: [
                            { id: uid(), label: "Explore" },
                            { id: uid(), label: "Shape" },
                            { id: uid(), label: "Share" },
                          ],
                        },
                      }
                    : type === "question"
                      ? {
                          width: 940,
                          height: 440,
                          baseFontSize: 30,
                          question: {
                            kind: "multiple-choice" as const,
                            prompt: "What will you take away?",
                            options: [
                              "A fresh perspective",
                              "A useful action",
                              "A new question",
                            ],
                          },
                        }
                      : {
                          width: 640,
                          height: 360,
                          media: { autoplay: false, loop: false, muted: true },
                        }),
    ...patch,
  };
}
export function resetStyle(): Partial<FrameElement> {
  return {
    color: undefined,
    fill: undefined,
    fontFamily: undefined,
    fontSize: undefined,
    fontWeight: undefined,
    italic: undefined,
    underline: undefined,
    lineHeight: undefined,
    letterSpacing: undefined,
    radius: undefined,
    stroke: undefined,
    strokeWidth: undefined,
    shadow: undefined,
    material: undefined,
    gradient: undefined,
  };
}
