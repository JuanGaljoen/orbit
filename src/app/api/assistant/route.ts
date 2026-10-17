import Anthropic from "@anthropic-ai/sdk";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getSession } from "@/server/auth";
import { aiConfigured, anthropic, modelParams } from "@/server/ai/client";
import { buildTools, systemPrompt } from "@/server/ai/tools";
import type { AssistantEvent } from "@/lib/assistant-events";

export const maxDuration = 300;

const body = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(50_000) }))
    .min(1)
    .max(60),
});


/**
 * Streams the assistant's answer as NDJSON events. The conversation is kept client-side as plain
 * text turns; each request re-runs the tool loop against live data.
 */
export async function POST(req: NextRequest) {
  if (!(await getSession())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!aiConfigured()) return NextResponse.json({ error: "AI isn't configured — set ANTHROPIC_API_KEY" }, { status: 503 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success || parsed.data.messages[0].role !== "user")
    return NextResponse.json({ error: "invalid request" }, { status: 400 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: AssistantEvent) => controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      try {
        const runner = anthropic().beta.messages.toolRunner({
          ...(await modelParams()),
          max_tokens: 32_000,
          max_iterations: 15,
          system: await systemPrompt(),
          tools: buildTools({ onProposal: (p) => send({ type: "proposal", ...p }) }),
          messages: parsed.data.messages,
          stream: true,
        });
        for await (const s of runner) {
          s.on("text", (delta) => send({ type: "text", text: delta }));
          const message = await s.finalMessage();
          for (const block of message.content) if (block.type === "tool_use") send({ type: "tool", name: block.name });
          if (message.stop_reason === "refusal") send({ type: "error", message: "The model declined to answer this request." });
          if (message.stop_reason === "max_tokens") send({ type: "error", message: "The answer hit the length limit and was cut off." });
        }
        send({ type: "done" });
      } catch (err) {
        const message =
          err instanceof Anthropic.AuthenticationError
            ? "The Anthropic API key was rejected."
            : err instanceof Anthropic.RateLimitError
              ? "Rate limited by the Anthropic API — try again shortly."
              : err instanceof Anthropic.APIError
                ? `Anthropic API error ${err.status}: ${err.message}`
                : err instanceof Error
                  ? err.message
                  : "Unknown error";
        console.error("assistant failed", err);
        send({ type: "error", message });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
}
