import {
  type AnyPgColumn,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

export const STATUS_CATEGORIES = ["backlog", "todo", "in_progress", "in_review", "done"] as const;
export type StatusCategory = (typeof STATUS_CATEGORIES)[number];

export const TICKET_TYPES = [
  "feature",
  "bug",
  "task",
  "improvement",
  "research",
  "documentation",
] as const;
export type TicketType = (typeof TICKET_TYPES)[number];

export const PROJECT_STATUSES = ["planned", "active", "paused", "completed"] as const;
export const OBJECTIVE_STATUSES = ["active", "achieved", "dropped"] as const;

// ── Planning ──────────────────────────────────────────────────────────────────

export const objectives = pgTable("objectives", {
  id: id(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  status: text("status", { enum: OBJECTIVE_STATUSES }).notNull().default("active"),
  targetDate: date("target_date"),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const projects = pgTable(
  "projects",
  {
    id: id(),
    key: text("key").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    status: text("status", { enum: PROJECT_STATUSES }).notNull().default("active"),
    targetDate: date("target_date"),
    objectiveId: uuid("objective_id").references(() => objectives.id, { onDelete: "set null" }),
    ticketSeq: integer("ticket_seq").notNull().default(0),
    // Architecture diagram (Mermaid source) pushed by the user's agents via the API.
    diagram: text("diagram"),
    diagramCommit: text("diagram_commit"),
    diagramUpdatedAt: timestamp("diagram_updated_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("projects_key_uq").on(t.key)],
);

export const milestones = pgTable(
  "milestones",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    startDate: date("start_date"),
    targetDate: date("target_date"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("milestones_project_idx").on(t.projectId)],
);

export const milestoneDeps = pgTable(
  "milestone_deps",
  {
    milestoneId: uuid("milestone_id")
      .notNull()
      .references(() => milestones.id, { onDelete: "cascade" }),
    dependsOnId: uuid("depends_on_id")
      .notNull()
      .references(() => milestones.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.milestoneId, t.dependsOnId] })],
);

// ── Configurable vocabularies ─────────────────────────────────────────────────

export const statuses = pgTable("statuses", {
  id: id(),
  name: text("name").notNull(),
  category: text("category", { enum: STATUS_CATEGORIES }).notNull(),
  position: integer("position").notNull(),
  color: text("color").notNull().default("#71717a"),
});

export const priorities = pgTable("priorities", {
  id: id(),
  name: text("name").notNull(),
  // Lower rank = more urgent. Rank <= 1 counts as "high priority".
  rank: integer("rank").notNull(),
  color: text("color").notNull().default("#71717a"),
});

export const labels = pgTable(
  "labels",
  {
    id: id(),
    name: text("name").notNull(),
    color: text("color").notNull().default("#71717a"),
  },
  (t) => [uniqueIndex("labels_name_uq").on(t.name)],
);

// ── Tickets ───────────────────────────────────────────────────────────────────

export const tickets = pgTable(
  "tickets",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    title: text("title").notNull(),
    type: text("type", { enum: TICKET_TYPES }).notNull().default("task"),
    statusId: uuid("status_id")
      .notNull()
      .references(() => statuses.id),
    priorityId: uuid("priority_id")
      .notNull()
      .references(() => priorities.id),
    description: text("description").notNull().default(""),
    acceptanceCriteria: text("acceptance_criteria").notNull().default(""),
    technicalNotes: text("technical_notes").notNull().default(""),
    dueDate: date("due_date"),
    estimate: real("estimate"),
    parentId: uuid("parent_id").references((): AnyPgColumn => tickets.id, { onDelete: "set null" }),
    milestoneId: uuid("milestone_id").references(() => milestones.id, { onDelete: "set null" }),
    position: real("position").notNull().default(0),
    statusChangedAt: timestamp("status_changed_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("tickets_project_number_uq").on(t.projectId, t.number),
    index("tickets_status_idx").on(t.statusId),
    index("tickets_parent_idx").on(t.parentId),
    index("tickets_milestone_idx").on(t.milestoneId),
  ],
);

export const ticketLabels = pgTable(
  "ticket_labels",
  {
    ticketId: uuid("ticket_id")
      .notNull()
      .references(() => tickets.id, { onDelete: "cascade" }),
    labelId: uuid("label_id")
      .notNull()
      .references(() => labels.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.ticketId, t.labelId] })],
);

/** `ticketId` is blocked by `blockedById`. */
export const ticketDeps = pgTable(
  "ticket_deps",
  {
    ticketId: uuid("ticket_id")
      .notNull()
      .references(() => tickets.id, { onDelete: "cascade" }),
    blockedById: uuid("blocked_by_id")
      .notNull()
      .references(() => tickets.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.ticketId, t.blockedById] })],
);

export const comments = pgTable(
  "comments",
  {
    id: id(),
    ticketId: uuid("ticket_id")
      .notNull()
      .references(() => tickets.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    author: text("author", { enum: ["user", "ai", "system"] }).notNull().default("user"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("comments_ticket_idx").on(t.ticketId)],
);

/**
 * Append-only event log. Drives ticket history, the activity feed and progress-over-time.
 * Not FK-bound so history survives deletes.
 */
export const activity = pgTable(
  "activity",
  {
    id: id(),
    kind: text("kind").notNull(),
    projectId: uuid("project_id"),
    ticketId: uuid("ticket_id"),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id"),
    summary: text("summary").notNull(),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
    actor: text("actor", { enum: ["user", "ai", "github", "system", "api"] })
      .notNull()
      .default("user"),
    createdAt: createdAt(),
  },
  (t) => [
    index("activity_project_idx").on(t.projectId, t.createdAt),
    index("activity_ticket_idx").on(t.ticketId, t.createdAt),
    index("activity_created_idx").on(t.createdAt),
  ],
);

// ── GitHub ────────────────────────────────────────────────────────────────────

export const repositories = pgTable(
  "repositories",
  {
    id: id(),
    githubId: integer("github_id").notNull(),
    owner: text("owner").notNull(),
    name: text("name").notNull(),
    fullName: text("full_name").notNull(),
    description: text("description").notNull().default(""),
    defaultBranch: text("default_branch").notNull().default("main"),
    private: boolean("private").notNull().default(true),
    htmlUrl: text("html_url").notNull(),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    lastWebhookAt: timestamp("last_webhook_at", { withTimezone: true }),
    syncStatus: text("sync_status", { enum: ["never", "syncing", "ok", "error"] })
      .notNull()
      .default("never"),
    syncError: text("sync_error"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("repositories_full_name_uq").on(t.fullName)],
);

export const projectRepos = pgTable(
  "project_repos",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    repositoryId: uuid("repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.repositoryId] })],
);

export const ghBranches = pgTable(
  "gh_branches",
  {
    id: id(),
    repositoryId: uuid("repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    headSha: text("head_sha").notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("gh_branches_repo_name_uq").on(t.repositoryId, t.name)],
);

export const ghCommits = pgTable(
  "gh_commits",
  {
    id: id(),
    repositoryId: uuid("repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    sha: text("sha").notNull(),
    message: text("message").notNull(),
    authorLogin: text("author_login"),
    authorName: text("author_name"),
    htmlUrl: text("html_url").notNull(),
    committedAt: timestamp("committed_at", { withTimezone: true }).notNull(),
    branch: text("branch"),
    checksState: text("checks_state"),
  },
  (t) => [
    uniqueIndex("gh_commits_repo_sha_uq").on(t.repositoryId, t.sha),
    index("gh_commits_committed_idx").on(t.committedAt),
  ],
);

export const PR_STATES = ["open", "draft", "merged", "closed"] as const;
export type PrState = (typeof PR_STATES)[number];
export const CHECK_STATES = ["pending", "success", "failure", "neutral"] as const;
export type ChecksState = (typeof CHECK_STATES)[number];

export const ghPullRequests = pgTable(
  "gh_pull_requests",
  {
    id: id(),
    repositoryId: uuid("repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    state: text("state", { enum: PR_STATES }).notNull(),
    headRef: text("head_ref").notNull(),
    headSha: text("head_sha").notNull(),
    baseRef: text("base_ref").notNull(),
    authorLogin: text("author_login"),
    htmlUrl: text("html_url").notNull(),
    checksState: text("checks_state", { enum: CHECK_STATES }),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull(),
    mergedAt: timestamp("merged_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    ghUpdatedAt: timestamp("gh_updated_at", { withTimezone: true }).notNull(),
  },
  (t) => [uniqueIndex("gh_prs_repo_number_uq").on(t.repositoryId, t.number)],
);

export const LINK_KINDS = ["branch", "commit", "pr", "file"] as const;
export type LinkKind = (typeof LINK_KINDS)[number];

/** A ticket ↔ code artefact link. `ref` is the branch name, commit sha, PR number or file path. */
export const ticketLinks = pgTable(
  "ticket_links",
  {
    id: id(),
    ticketId: uuid("ticket_id")
      .notNull()
      .references(() => tickets.id, { onDelete: "cascade" }),
    repositoryId: uuid("repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: LINK_KINDS }).notNull(),
    ref: text("ref").notNull(),
    title: text("title").notNull().default(""),
    url: text("url").notNull(),
    source: text("source", { enum: ["auto", "manual"] }).notNull().default("auto"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("ticket_links_uq").on(t.ticketId, t.repositoryId, t.kind, t.ref),
    index("ticket_links_ticket_idx").on(t.ticketId),
  ],
);

export const webhookDeliveries = pgTable("webhook_deliveries", {
  deliveryId: text("delivery_id").primaryKey(),
  event: text("event").notNull(),
  repositoryFullName: text("repository_full_name"),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  error: text("error"),
});

/** Status changes GitHub evidence suggests. Never applied without the user. */
export const statusSuggestions = pgTable(
  "status_suggestions",
  {
    id: id(),
    ticketId: uuid("ticket_id")
      .notNull()
      .references(() => tickets.id, { onDelete: "cascade" }),
    suggestedCategory: text("suggested_category", { enum: STATUS_CATEGORIES }).notNull(),
    reason: text("reason").notNull(),
    evidenceUrl: text("evidence_url"),
    state: text("state", { enum: ["pending", "accepted", "dismissed"] })
      .notNull()
      .default("pending"),
    createdAt: createdAt(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [index("status_suggestions_ticket_idx").on(t.ticketId)],
);

// ── AI + settings ─────────────────────────────────────────────────────────────

export const aiProposals = pgTable("ai_proposals", {
  id: id(),
  title: text("title").notNull(),
  prompt: text("prompt").notNull().default(""),
  // A ProposalPayload (see services/proposals.ts) — editable until applied.
  payload: jsonb("payload").$type<unknown>().notNull(),
  state: text("state", { enum: ["pending", "applied", "discarded"] })
    .notNull()
    .default("pending"),
  result: jsonb("result").$type<unknown>(),
  createdAt: createdAt(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
});

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<unknown>().notNull(),
  updatedAt: updatedAt(),
});

