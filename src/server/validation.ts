import { z } from "zod";
import { InvalidError } from "./errors";

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");
export const optionalDate = isoDate.nullable().optional();
export const uuid = z.uuid();
export const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Expected #rrggbb");

/** Parse or throw an InvalidError carrying the first readable issue. */
export function parse<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    const issue = result.error.issues[0];
    const where = issue?.path.length ? `${issue.path.join(".")}: ` : "";
    throw new InvalidError(`${where}${issue?.message ?? "Invalid input"}`);
  }
  return result.data;
}
