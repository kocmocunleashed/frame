import type { FrameElement } from "./schema";
export function snapPosition(
  el: FrameElement,
  x: number,
  y: number,
  others: FrameElement[],
  width: number,
  height: number,
  tolerance = 8,
) {
  const xs = [
      0,
      width / 2,
      width,
      ...others.flatMap((e) => [e.x, e.x + e.width / 2, e.x + e.width]),
    ],
    ys = [
      0,
      height / 2,
      height,
      ...others.flatMap((e) => [e.y, e.y + e.height / 2, e.y + e.height]),
    ];
  function axis(position: number, size: number, targets: number[]) {
    let distance = tolerance + 1,
      delta = 0,
      guide: number | undefined;
    for (const anchor of [position, position + size / 2, position + size])
      for (const target of targets) {
        const d = target - anchor;
        if (Math.abs(d) < distance) {
          distance = Math.abs(d);
          delta = d;
          guide = target;
        }
      }
    return distance <= tolerance
      ? { value: position + delta, guide }
      : { value: position, guide: undefined };
  }
  const sx = axis(x, el.width, xs),
    sy = axis(y, el.height, ys);
  return { x: sx.value, y: sy.value, guides: { x: sx.guide, y: sy.guide } };
}
