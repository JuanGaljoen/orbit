import { STATUS_CATEGORIES, TICKET_TYPES } from "@/db/schema";
import type { TicketFilter } from "@/server/services/tickets";

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;
const many = (v: string | string[] | undefined) => one(v)?.split(",").filter(Boolean);

/** URL search params ↔ ticket filter. Shared by the list and the board. */
export function filterFromParams(
  params: Params,
  lookup: { projects: { id: string; key: string }[] },
): TicketFilter {
  const projectKeys = many(params.project);
  const categories = many(params.status)?.filter((s): s is (typeof STATUS_CATEGORIES)[number] =>
    (STATUS_CATEGORIES as readonly string[]).includes(s),
  );
  const types = many(params.type)?.filter((s): s is (typeof TICKET_TYPES)[number] =>
    (TICKET_TYPES as readonly string[]).includes(s),
  );
  const due = one(params.due);
  const sort = one(params.sort);
  const archived = one(params.archived);
  return {
    projectIds: projectKeys
      ?.map((k) => lookup.projects.find((p) => p.key === k.toUpperCase())?.id)
      .filter((x): x is string => !!x),
    categories: categories?.length ? categories : undefined,
    types: types?.length ? types : undefined,
    priorityIds: many(params.priority),
    labelIds: many(params.label),
    milestoneId: one(params.milestone),
    due: ["overdue", "today", "week", "none", "any"].includes(due ?? "") ? (due as TicketFilter["due"]) : undefined,
    blocked: one(params.blocked) === "1" ? true : undefined,
    q: one(params.q),
    sort: ["priority", "due", "updated", "created", "key", "status"].includes(sort ?? "")
      ? (sort as TicketFilter["sort"])
      : undefined,
    dir: one(params.dir) === "desc" ? "desc" : one(params.dir) === "asc" ? "asc" : undefined,
    archivedOnly: archived === "1" ? true : undefined,
  };
}
