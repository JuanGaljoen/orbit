import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { settings } from "@/db/schema";
import { parse } from "../validation";

/**
 * Typed key/value settings. Secrets (API keys, tokens) never live here — they're environment
 * variables, so the database never holds a credential.
 */
const SCHEMAS = {
  ai: z.object({
    provider: z.literal("anthropic").default("anthropic"),
    model: z.string().trim().min(1).max(100).default("claude-opus-5-5"),
    effort: z.enum(["low", "medium", "high", "xhigh", "max"]).default("medium"),
  }),
  preferences: z.object({
    defaultProjectKey: z.string().nullable().default(null),
    staleDays: z.number().int().min(1).max(90).default(7),
  }),
};

type Schemas = typeof SCHEMAS;
export type SettingKey = keyof Schemas;
export type Setting<K extends SettingKey> = z.output<Schemas[K]>;

export const AI_MODELS = [
  { id: "claude-opus-5-5", label: "Claude Opus 5.5 (default)" },
  { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5 (faster, cheaper)" },
  { id: "claude-haiku-5-5", label: "Claude Haiku 5.5 (fastest, cheapest)" },
  { id: "claude-fable-5-1", label: "Claude Fable 5.1 (most capable, priciest)" },
] as const;

export async function getSetting<K extends SettingKey>(key: K): Promise<Setting<K>> {
  const db = await getDb();
  const [row] = await db.select().from(settings).where(eq(settings.key, key));
  const parsed = SCHEMAS[key].safeParse(row?.value ?? {});
  // A stored value that no longer validates falls back to defaults rather than breaking the app.
  return (parsed.success ? parsed.data : SCHEMAS[key].parse({})) as Setting<K>;
}

export async function setSetting<K extends SettingKey>(key: K, value: z.input<Schemas[K]>): Promise<Setting<K>> {
  const data = parse(SCHEMAS[key] as z.ZodType, value) as Setting<K>;
  const db = await getDb();
  await db
    .insert(settings)
    .values({ key, value: data })
    .onConflictDoUpdate({ target: settings.key, set: { value: data } });
  return data;
}
