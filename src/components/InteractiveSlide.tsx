import { useCallback, useMemo, useState } from "react";
import type { FrameDocument, Slide } from "../../shared/schema";
import { SlideRenderer } from "./SlideRenderer";
export default function InteractiveSlide({
  doc,
  slide,
  step,
  scale,
  onNavigate,
  revealedIds,
  onReveal,
  stepStartedAt,
}: {
  doc: Pick<FrameDocument, "width" | "height" | "themes" | "themeId">;
  slide: Pick<
    Slide,
    "id" | "elements" | "background" | "themeId" | "interactions"
  >;
  step: number;
  scale: number;
  onNavigate: (slideId: string) => void;
  revealedIds?: string[];
  onReveal?: (elementId: string) => void;
  stepStartedAt?: number;
}) {
  const [local, setLocal] = useState<string[]>([]),
    revealed = revealedIds || local;
  const activeIds = useMemo(
    () =>
      new Set(
        slide.interactions
          .filter((i) => i.trigger === "click")
          .map((i) => i.target),
      ),
    [slide.interactions],
  );
  const hiddenIds = useMemo(
    () =>
      new Set(
        slide.interactions
          .filter(
            (i) =>
              i.trigger === "click" &&
              i.action === "show" &&
              !revealed.includes(i.value),
          )
          .map((i) => i.value),
      ),
    [slide.interactions, revealed],
  );
  const activate = useCallback(
    (id: string) => {
      for (const action of slide.interactions.filter(
        (i) => i.trigger === "click" && i.target === id,
      )) {
        if (action.action === "navigate") onNavigate(action.value);
        if (action.action === "show") {
          if (onReveal) onReveal(action.value);
          else setLocal((old) => [...new Set([...old, action.value])]);
        }
      }
    },
    [slide.interactions, onNavigate, onReveal],
  );
  return (
    <SlideRenderer
      doc={doc}
      slide={slide}
      step={step}
      scale={scale}
      playing
      stepStartedAt={stepStartedAt}
      hiddenIds={hiddenIds}
      activeIds={activeIds}
      onActivate={activate}
    />
  );
}
