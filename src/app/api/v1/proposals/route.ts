import { z } from "zod";
import { apiHandler, jsonBody } from "@/server/api";
import { createProposal } from "@/server/services/proposals";
import { parse } from "@/server/validation";

/**
 * Propose ticket changes (same item format as the in-app assistant). Proposals are queued for
 * review in Orbit → Assistant and are never applied by the API.
 */
export const POST = apiHandler(async (req) => {
  const input = parse(
    z.object({ title: z.string().min(1).max(200), summary: z.string().max(5000).default(""), items: z.array(z.unknown()).min(1) }),
    await jsonBody(req),
  );
  const p = await createProposal({ title: input.title, prompt: "via API", payload: { summary: input.summary, items: input.items } });
  return { id: p.id, state: p.state, reviewUrl: `/assistant?proposal=${p.id}` };
});
