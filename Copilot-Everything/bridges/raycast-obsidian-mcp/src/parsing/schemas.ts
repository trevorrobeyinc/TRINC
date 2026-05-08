import { z } from "zod";

export const searchResultSchema = z.array(
  z.object({
    path: z.string(),
    line: z.number().int().optional(),
    text: z.string().optional(),
  })
);

export const commandListSchema = z.array(
  z.object({
    id: z.string(),
    name: z.string().optional(),
  })
);

export const healthSchema = z.object({
  status: z.string().optional(),
});

export function validateSchema<T>(schema: z.ZodType<T>, value: unknown): T {
  return schema.parse(value);
}
