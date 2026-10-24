import { z } from "zod";
import { themeSchema } from "./schema";
export const aiThemeResponseSchema = themeSchema
  .omit({
    id: true,
    custom: true,
    brandRules: true,
    artDirection: true,
    artVersion: true,
  })
  .extend({ typeScale: themeSchema.shape.typeScale.unwrap() });
export const aiThemeRequestSchema = z.object({
  prompt: z.string().trim().min(5).max(4000),
  baseTheme: themeSchema.nullable(),
  referenceAssetId: z.string().min(1).max(100).nullable(),
  key: z.string().min(8).max(100),
});
