import { activity } from "@/db/schema";
import type { DbOrTx } from "@/db";

export type Actor = "user" | "ai" | "github" | "system" | "api";

export type ActivityInput = {
  kind: string;
  entityType: "project" | "objective" | "milestone" | "ticket" | "repository" | "proposal";
  entityId?: string | null;
  projectId?: string | null;
  ticketId?: string | null;
  summary: string;
  data?: Record<string, unknown>;
  actor?: Actor;
};

export async function logActivity(db: DbOrTx, input: ActivityInput) {
  await db.insert(activity).values({
    kind: input.kind,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    projectId: input.projectId ?? null,
    ticketId: input.ticketId ?? null,
    summary: input.summary,
    data: input.data ?? {},
    actor: input.actor ?? "user",
  });
}
