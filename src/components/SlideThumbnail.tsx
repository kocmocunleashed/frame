import { useEffect, useRef, useState } from "react";
import type { FrameDocument, Slide } from "../../shared/schema";
import { resolveTheme } from "../../shared/themes";
import { SlideRenderer } from "./SlideRenderer";

// Keep every slide's navigation button available to keyboards and assistive
// technology while mounting expensive previews only near the scroll viewport.
export default function SlideThumbnail({
  doc,
  slide,
  active,
  eager,
}: {
  doc: FrameDocument;
  slide: Slide;
  active: boolean;
  eager: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null),
    [visible, setVisible] = useState(eager);
  useEffect(() => {
    if (!ref.current || !("IntersectionObserver" in window)) {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      {
        root: ref.current.closest(".slide-rail-list"),
        rootMargin: "400px 0px",
      },
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      aria-hidden="true"
      style={{
        width: 160,
        height: (160 * doc.height) / doc.width,
        overflow: "hidden",
        background: resolveTheme(doc, slide).colors.background,
      }}
    >
      {(visible || active) && (
        <SlideRenderer
          doc={doc}
          slide={slide}
          scale={160 / doc.width}
          staticMedia
        />
      )}
    </div>
  );
}
