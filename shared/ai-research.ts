import { z } from "zod";

export const webUrlSchema = z
  .string()
  .url()
  .max(2048)
  .refine((value) => {
    try {
      const url = new URL(value);
      return (
        ["https:", "http:"].includes(url.protocol) &&
        !url.username &&
        !url.password
      );
    } catch {
      return false;
    }
  }, "Use a public HTTP or HTTPS link.");

export const webResearchSchema = z.object({
  status: z.enum(["complete", "unavailable", "skipped"]),
  searchedAt: z.string(),
  sources: z
    .array(
      z.object({
        id: z.string().min(1).max(100),
        name: z.string().min(1).max(200),
        url: webUrlSchema,
        text: z.string().min(1).max(5000),
      }),
    )
    .max(6),
  warnings: z.array(z.string().max(1000)).max(10),
});
export type WebResearch = z.infer<typeof webResearchSchema>;
