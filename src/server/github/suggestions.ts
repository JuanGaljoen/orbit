import type { PrState, StatusCategory } from "@/db/schema";

const RANK: Record<StatusCategory, number> = { backlog: 0, todo: 1, in_progress: 2, in_review: 3, done: 4 };

export type Suggestion = { category: StatusCategory; reason: string };

/**
 * What GitHub evidence *suggests* for a ticket's status. Never applied automatically, and a merged
 * PR only ever suggests Done — it is not proof the ticket's acceptance criteria are met.
 */
export function suggestFromPr(current: StatusCategory, pr: { number: number; state: PrState }): Suggestion | null {
  switch (pr.state) {
    case "merged":
      return current === "done"
        ? null
        : { category: "done", reason: `PR #${pr.number} merged — confirm the acceptance criteria are met before closing` };
    case "open":
      return RANK[current] < RANK.in_review ? { category: "in_review", reason: `PR #${pr.number} is open for review` } : null;
    case "draft":
      return RANK[current] < RANK.in_progress ? { category: "in_progress", reason: `Draft PR #${pr.number} opened` } : null;
    case "closed":
      return current === "in_review"
        ? { category: "in_progress", reason: `PR #${pr.number} was closed without merging` }
        : null;
  }
}

export function suggestFromWorkStarted(current: StatusCategory, what: string): Suggestion | null {
  return RANK[current] < RANK.in_progress ? { category: "in_progress", reason: what } : null;
}
