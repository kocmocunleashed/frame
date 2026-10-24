import { useEffect, useRef, useState } from "react";
import type { AIJob } from "../../shared/ai";
import type { FrameDocument, Slide, Theme } from "../../shared/schema";
import { api } from "../lib/api";
import { AutoSlide } from "./SlideRenderer";
type Item = { index: number; slide: Slide; themes: Theme[] };
export default function ProgressivePreviews({
  job,
  base,
}: {
  job: AIJob;
  base: FrameDocument;
}) {
  const [items, setItems] = useState<Item[]>([]),
    [error, setError] = useState("");
  const revision = useRef(0);
  useEffect(() => {
    revision.current = 0;
    setItems([]);
    setError("");
  }, [job.id]);
  useEffect(() => {
    if (!job.previewRevision || job.previewRevision <= revision.current) return;
    let stopped = false;
    api<{ revision: number; slides: Item[] }>(
      `/jobs/${job.id}/preview?since=${revision.current}`,
    )
      .then((value) => {
        if (stopped) return;
        revision.current = value.revision;
        setError("");
        setItems((old) =>
          [
            ...new Map(
              [...old, ...value.slides].map((item) => [item.index, item]),
            ).values(),
          ].sort((a, b) => a.index - b.index),
        );
      })
      .catch(() => {
        if (!stopped)
          setError(
            "Completed previews could not load. They remain saved; reload to try again.",
          );
      });
    return () => {
      stopped = true;
    };
  }, [job.id, job.previewRevision]);
  if (job.totalSlides === undefined) return null;
  return (
    <section
      className="progressive-previews"
      aria-label="Completed slide previews"
    >
      <h3>
        {job.completedSlides || 0} of {job.totalSlides} slides{" "}
        {job.reviewedSlides === undefined ? "ready" : "generated"}
      </h3>
      {job.reviewedSlides !== undefined && (
        <p className="creative-intro" role="status">
          Visual checks finished: {job.reviewedSlides} of {job.totalSlides}
        </p>
      )}
      <p className="creative-intro">
        {job.reviewedSlides === undefined
          ? "Each slide gets its own composition and custom look. Completed work is saved as it arrives."
          : "Generated slides appear first. Muse then inspects their images and makes targeted visual fixes. Updated previews appear as each check finishes."}
      </p>
      {error && <p role="alert">{error}</p>}
      <div className="progressive-preview-grid">
        {items.map((item) => (
          <article key={item.index}>
            <AutoSlide
              doc={{
                ...base,
                themes: item.themes,
                themeId: item.slide.themeId || item.themes[0].id,
              }}
              slide={item.slide}
            />
            <p>
              {item.index + 1} / {job.totalSlides} · {item.slide.title}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
