import { z } from "zod";
export const safeLink = z
  .string()
  .max(2000)
  .refine(
    (v) => /^(https?:\/\/|mailto:|tel:|#)/i.test(v),
    "Use an https, http, email, phone, or anchor link.",
  );
export const markSchema = z
  .object({
    type: z.enum(["bold", "italic", "underline", "strike", "link"]),
    attrs: z
      .object({
        href: safeLink,
        target: z.enum(["_blank", "_self"]).optional(),
        rel: z.string().max(80).optional(),
        class: z.null().optional(),
      })
      .optional(),
  })
  .superRefine((m, ctx) => {
    if (m.type === "link" && !m.attrs?.href)
      ctx.addIssue({
        code: "custom",
        message: "Links need a safe destination.",
      });
  });
export type RichNode = {
  type:
    | "doc"
    | "paragraph"
    | "text"
    | "bulletList"
    | "orderedList"
    | "listItem"
    | "hardBreak";
  text?: string;
  marks?: z.infer<typeof markSchema>[];
  content?: RichNode[];
  attrs?: { start?: number; type?: string | null };
};
export const richNodeSchema: z.ZodType<RichNode> = z.lazy(() =>
  z.object({
    type: z.enum([
      "doc",
      "paragraph",
      "text",
      "bulletList",
      "orderedList",
      "listItem",
      "hardBreak",
    ]),
    text: z.string().max(30000).optional(),
    marks: z.array(markSchema).max(8).optional(),
    content: z.array(richNodeSchema).max(200).optional(),
    attrs: z
      .object({
        start: z.number().int().min(1).max(9999).optional(),
        type: z.string().max(40).nullable().optional(),
      })
      .optional(),
  }),
);
export const richTextSchema: z.ZodType<RichNode> = z
  .preprocess((input, ctx) => {
    let count = 0,
      length = 0;
    const queue: { node: unknown; depth: number }[] = [
      { node: input, depth: 0 },
    ];
    while (queue.length) {
      const { node, depth } = queue.pop()!;
      if (!node || typeof node !== "object") continue;
      const n = node as RichNode;
      count++;
      length += typeof n.text === "string" ? n.text.length : 0;
      if (depth > 12 || count > 2000 || length > 30000) {
        ctx.addIssue({
          code: "custom",
          message:
            "Rich text is limited to 30,000 characters and 12 nesting levels.",
        });
        return z.NEVER;
      }
      if (Array.isArray(n.content))
        n.content.forEach((child) =>
          queue.push({ node: child, depth: depth + 1 }),
        );
    }
    return input;
  }, richNodeSchema)
  .superRefine((root, ctx) => {
    const fail = () =>
      ctx.addIssue({
        code: "custom",
        message: "Rich text contains an unsupported block structure.",
      });
    if (root.type !== "doc") fail();
    const visit = (n: RichNode) => {
      const allowed =
        n.type === "doc"
          ? ["paragraph", "bulletList", "orderedList"]
          : n.type === "paragraph"
            ? ["text", "hardBreak"]
            : n.type === "bulletList" || n.type === "orderedList"
              ? ["listItem"]
              : n.type === "listItem"
                ? ["paragraph", "bulletList", "orderedList"]
                : [];
      if (
        (n.type === "text" && (!n.text || n.content?.length)) ||
        (n.type !== "text" && n.text !== undefined) ||
        n.content?.some((c) => !allowed.includes(c.type))
      )
        fail();
      n.content?.forEach(visit);
    };
    visit(root);
  });
export function plainRichText(text: string): RichNode {
  return {
    type: "doc",
    content: text.split("\n").map((line) => ({
      type: "paragraph",
      content: line ? [{ type: "text", text: line }] : [],
    })),
  };
}
export function richTextPlain(node: RichNode): string {
  if (node.type === "text") return node.text || "";
  if (node.type === "hardBreak") return "\n";
  return (node.content || [])
    .map(richTextPlain)
    .join(
      ["doc", "bulletList", "orderedList", "listItem"].includes(node.type)
        ? "\n"
        : "",
    );
}
export const ICON_NAMES = [
  "sparkles",
  "lightbulb",
  "target",
  "heart",
  "star",
  "check",
  "arrow-right",
  "globe",
  "users",
  "rocket",
  "leaf",
  "book",
  "shield",
  "chart",
  "message",
  "flag",
] as const;
export const tableSchema = z
  .object({
    rows: z
      .array(z.array(z.string().max(1000)).min(1).max(12))
      .min(1)
      .max(30),
    header: z.boolean().default(true),
  })
  .superRefine((v, ctx) => {
    if (v.rows.some((r) => r.length !== v.rows[0].length))
      ctx.addIssue({
        code: "custom",
        message: "Every table row must have the same number of columns.",
      });
  });
export const chartSchema = z
  .object({
    kind: z.enum(["bar", "line", "donut"]),
    data: z
      .array(
        z.object({
          label: z.string().min(1).max(80),
          value: z.number().finite().min(-1e9).max(1e9),
        }),
      )
      .min(1)
      .max(12),
    showValues: z.boolean().default(true),
  })
  .superRefine((v, ctx) => {
    if (v.kind === "donut" && v.data.some((d) => d.value < 0))
      ctx.addIssue({
        code: "custom",
        message: "Donut charts require non-negative values.",
      });
  });
export const diagramSchema = z
  .object({
    layout: z.enum(["process", "cycle", "hierarchy"]),
    nodes: z
      .array(
        z.object({
          id: z.string().min(1).max(100),
          label: z.string().max(200),
        }),
      )
      .min(2)
      .max(8),
  })
  .superRefine((v, ctx) => {
    if (new Set(v.nodes.map((n) => n.id)).size !== v.nodes.length)
      ctx.addIssue({
        code: "custom",
        message: "Diagram node IDs must be unique.",
      });
  });
export const questionSchema = z
  .object({
    kind: z.enum(["multiple-choice", "poll", "true-false"]),
    prompt: z.string().min(1).max(2000),
    options: z.array(z.string().min(1).max(500)).min(2).max(8),
    correctIndex: z.number().int().min(0).max(7).optional(),
    explanation: z.string().max(3000).optional(),
  })
  .superRefine((q, ctx) => {
    if (q.correctIndex !== undefined && q.correctIndex >= q.options.length)
      ctx.addIssue({
        code: "custom",
        message: "The correct answer must be one of the options.",
      });
    if (q.kind === "true-false" && q.options.length !== 2)
      ctx.addIssue({
        code: "custom",
        message: "True/false questions need exactly two options.",
      });
    if (q.kind === "poll" && q.correctIndex !== undefined)
      ctx.addIssue({
        code: "custom",
        message: "Polls do not have a correct answer.",
      });
  });
