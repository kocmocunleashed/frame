import { z } from "zod";

const coordinate = z.number().finite().min(-100).max(200);
export const pathCommandSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("M"), x: coordinate, y: coordinate }),
  z.object({ op: z.literal("L"), x: coordinate, y: coordinate }),
  z.object({
    op: z.literal("Q"),
    x1: coordinate,
    y1: coordinate,
    x: coordinate,
    y: coordinate,
  }),
  z.object({
    op: z.literal("C"),
    x1: coordinate,
    y1: coordinate,
    x2: coordinate,
    y2: coordinate,
    x: coordinate,
    y: coordinate,
  }),
  z.object({ op: z.literal("Z") }),
]);
export const vectorPathSchema = z
  .array(pathCommandSchema)
  .min(2)
  .max(256)
  .refine(
    (commands) => commands[0].op === "M",
    "A vector path must begin with a move command.",
  );
export type PathCommand = z.infer<typeof pathCommandSchema>;
export function vectorPath(commands: PathCommand[]): string {
  return commands
    .map((c) =>
      c.op === "Z"
        ? "Z"
        : c.op === "C"
          ? `C${c.x1} ${c.y1} ${c.x2} ${c.y2} ${c.x} ${c.y}`
          : c.op === "Q"
            ? `Q${c.x1} ${c.y1} ${c.x} ${c.y}`
            : `${c.op}${c.x} ${c.y}`,
    )
    .join(" ");
}
export const timelineSchema = z
  .object({
    arrangement: z.enum(["horizontal", "vertical", "alternating"]),
    items: z
      .array(
        z.object({
          id: z.string().min(1).max(100),
          date: z.string().max(60),
          label: z.string().min(1).max(80),
          description: z.string().max(160),
        }),
      )
      .min(2)
      .max(8),
  })
  .refine(
    (t) => new Set(t.items.map((i) => i.id)).size === t.items.length,
    "Milestone IDs must be unique.",
  );
export const motionTypes = ["none", "fade", "rise", "slide", "scale"] as const;
export const animationSchema = z.object({
  type: z.enum(motionTypes),
  step: z.number().int().min(0).max(100),
  delay: z.number().int().min(0).max(10000).optional(),
  duration: z.number().int().min(50).max(5000).optional(),
});

export function animationState(
  animation: z.infer<typeof animationSchema> | undefined,
  step: number,
  elapsed: number,
  reducedMotion = false,
) {
  if (!animation)
    return { visibility: "visible" as const, opacity: 1, transform: "none" };
  if (animation.step > step)
    return { visibility: "hidden" as const, opacity: 0, transform: "none" };
  if (animation.step < step || reducedMotion || animation.type === "none")
    return { visibility: "visible" as const, opacity: 1, transform: "none" };
  const progress = Math.max(
    0,
    Math.min(
      1,
      (elapsed - (animation.delay || 0)) / (animation.duration || 280),
    ),
  );
  const eased = 1 - Math.pow(1 - progress, 3);
  return {
    visibility: "visible" as const,
    opacity: progress === 0 ? 0 : eased,
    transform:
      animation.type === "rise"
        ? `translateY(${(1 - eased) * 24}px)`
        : animation.type === "slide"
          ? `translateX(${(1 - eased) * -40}px)`
          : animation.type === "scale"
            ? `scale(${0.8 + eased * 0.2})`
            : "none",
  };
}
