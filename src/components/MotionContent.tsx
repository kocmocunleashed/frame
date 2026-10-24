import { useEffect, useRef, type ReactNode } from "react";
import type { FrameElement } from "../../shared/schema";
import { animationState } from "../../shared/creative";

export default function MotionContent({
  el,
  step,
  playing,
  elapsed,
  startedAt,
  children,
}: {
  el: FrameElement;
  step: number;
  playing: boolean;
  elapsed?: number;
  startedAt?: number;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = ref.current,
      a = el.animation;
    if (
      !node ||
      !playing ||
      !a ||
      a.step !== step ||
      elapsed !== undefined ||
      startedAt === 0
    )
      return;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    let animation: Animation | undefined;
    const start = () => {
      animation?.cancel();
      if (preference.matches || a.type === "none") return;
      const from = animationState({ ...a, delay: 0 }, step, 0);
      animation = node.animate(
        [
          { opacity: from.opacity, transform: from.transform },
          { opacity: 1, transform: "none" },
        ],
        {
          duration: a.duration || 280,
          delay: a.delay || 0,
          easing: "cubic-bezier(.22,1,.36,1)",
          fill: "backwards",
        },
      );
      if (startedAt)
        animation.currentTime = Math.max(0, Date.now() - startedAt);
    };
    start();
    preference.addEventListener("change", start);
    return () => {
      animation?.cancel();
      preference.removeEventListener("change", start);
    };
  }, [
    el.animation?.type,
    el.animation?.step,
    el.animation?.delay,
    el.animation?.duration,
    step,
    playing,
    elapsed,
    startedAt,
  ]);
  const sampled =
    elapsed !== undefined
      ? animationState(
          el.animation,
          step,
          elapsed,
          typeof window !== "undefined" &&
            window.matchMedia("(prefers-reduced-motion: reduce)").matches,
        )
      : undefined;
  return (
    <div
      ref={ref}
      className="motion-content"
      style={{ width: "100%", height: "100%", ...sampled }}
    >
      {children}
    </div>
  );
}
