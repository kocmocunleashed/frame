import { useEffect, useState } from "react";
import { Play } from "lucide-react";
import type { FrameElement } from "../../shared/schema";
export default function VideoElement({
  el,
  playing = false,
  staticPreview = false,
}: {
  el: FrameElement;
  playing?: boolean;
  staticPreview?: boolean;
}) {
  const [failed, setFailed] = useState(false),
    [reduced, setReduced] = useState(
      () =>
        typeof matchMedia === "function" &&
        matchMedia("(prefers-reduced-motion: reduce)").matches,
    );
  useEffect(() => setFailed(false), [el.src]);
  useEffect(() => {
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => setReduced(preference.matches);
    change();
    preference.addEventListener("change", change);
    return () => preference.removeEventListener("change", change);
  }, []);
  if (staticPreview)
    return el.media?.poster ? (
      <img
        src={el.media.poster}
        alt={el.accessibility?.label || el.name}
        style={{
          width: "100%",
          height: "100%",
          objectFit: el.fit || "contain",
        }}
      />
    ) : (
      <div className="media-static" role="img" aria-label={`Video: ${el.name}`}>
        <Play size={42} />
        <span>{el.name || "Video"}</span>
      </div>
    );
  return failed ? (
    <div className="media-error">
      This video could not play. Use an MP4 or WebM file supported by this
      browser.
    </div>
  ) : el.src ? (
    <video
      key={el.src}
      src={el.src}
      poster={el.media?.poster}
      controls={playing}
      autoPlay={playing && !reduced && el.media?.autoplay}
      loop={el.media?.loop}
      muted={!playing || el.media?.muted}
      playsInline
      preload="metadata"
      onError={() => setFailed(true)}
      style={{
        width: "100%",
        height: "100%",
        objectFit: el.fit || "contain",
        borderRadius: el.radius || 0,
      }}
    />
  ) : (
    <div className="image-placeholder">Add an MP4 or WebM video</div>
  );
}
