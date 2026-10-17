import Anthropic from "@anthropic-ai/sdk";
import { InvalidError } from "../errors";
import { getSetting } from "../services/settings";

export function aiConfigured() {
  return !!process.env.ANTHROPIC_API_KEY;
}

let client: Anthropic | null = null;

export function anthropic(): Anthropic {
  if (!aiConfigured()) throw new InvalidError("AI isn't configured — set ANTHROPIC_API_KEY");
  client ??= new Anthropic();
  return client;
}

// Models that accept server-side refusal fallbacks in the "default" form.
const FALLBACK_MODELS = new Set(["claude-opus-5-5", "claude-sonnet-5-5", "claude-fable-5-1"]);

/** Request params shared by every assistant call, from Settings → AI. */
export async function modelParams() {
  const ai = await getSetting("ai");
  return {
    model: ai.model,
    output_config: { effort: ai.effort },
    ...(FALLBACK_MODELS.has(ai.model) && {
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default" as const,
    }),
  };
}
