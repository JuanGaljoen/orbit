import { getMilestone } from "./milestones";
import { getProject, listProjectRepos } from "./projects";
import { getTicketByKey, type TicketSummary } from "./tickets";

export function branchName(key: string, title: string) {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40)
    .replace(/-$/, "");
  return `${key.toLowerCase()}-${slug}`;
}

const line = (t: TicketSummary) => `- ${t.key} — ${t.title} (${t.status.name})`;

/**
 * A self-contained markdown brief for Claude Code (or any implementer): what to build, how we'll
 * know it's done, what it depends on and where the code lives. Only real ticket data — sections
 * with nothing in them are omitted rather than padded.
 */
export async function implementationBrief(key: string): Promise<string> {
  const t = await getTicketByKey(key);
  const [project, repos, milestone] = await Promise.all([
    getProject(t.projectId),
    listProjectRepos(t.projectId),
    t.milestoneId ? getMilestone(t.milestoneId) : null,
  ]);

  const out: string[] = [];
  out.push(`# ${t.key}: ${t.title}`, "");
  out.push(
    `- **Type:** ${t.type} · **Status:** ${t.status.name} · **Priority:** ${t.priority.name}` +
      (t.estimate != null ? ` · **Estimate:** ${t.estimate}` : "") +
      (t.dueDate ? ` · **Due:** ${t.dueDate}` : ""),
    `- **Project:** ${project.key} — ${project.name}` + (milestone ? ` · **Milestone:** ${milestone.name}${milestone.targetDate ? ` (target ${milestone.targetDate})` : ""}` : ""),
  );
  if (t.labels.length) out.push(`- **Labels:** ${t.labels.map((l) => l.name).join(", ")}`);
  if (t.parent) out.push(`- **Parent:** ${t.parent.key} — ${t.parent.title}`);
  out.push("");

  const section = (title: string, body: string) => {
    if (body.trim()) out.push(`## ${title}`, "", body.trim(), "");
  };
  section("Description", t.description);
  section("Acceptance criteria", t.acceptanceCriteria || "_None written yet — agree them before building._");
  section("Technical notes", t.technicalNotes);
  section(
    "Dependencies",
    [
      ...t.blockers.map((b) => `${line(b)}${b.status.category === "done" ? "" : " **← still open, blocks this ticket**"}`),
      ...t.blocking.map((b) => `${line(b)} _(waits on this ticket)_`),
    ].join("\n"),
  );
  section("Subtasks", t.subtasks.map(line).join("\n"));

  section(
    "Repository context",
    [
      ...repos.map((r) => `- ${r.fullName} (default branch \`${r.defaultBranch}\`) — ${r.htmlUrl}`),
      repos.length ? `- Suggested branch: \`${branchName(t.key, t.title)}\` (keep \`${t.key}\` in the branch and PR title so Orbit links them)` : "",
    ]
      .filter(Boolean)
      .join("\n"),
  );
  section(
    "Linked code",
    t.links.map((l) => `- ${l.kind}: [${l.kind === "commit" ? l.ref.slice(0, 7) : l.kind === "pr" ? `#${l.ref}` : l.ref}${l.title && l.kind !== "branch" && l.kind !== "file" ? ` ${l.title}` : ""}](${l.url})`).join("\n"),
  );
  section(
    "Recent discussion",
    t.comments
      .slice(-5)
      .map((c) => `> **${c.author}** (${c.createdAt.toISOString().slice(0, 10)}): ${c.body.replace(/\n/g, "\n> ")}`)
      .join("\n\n"),
  );
  out.push(
    "## Working agreement",
    "",
    "- Build exactly what the acceptance criteria require; raise anything ambiguous before coding.",
    `- Reference \`${t.key}\` in the branch name, commits and PR title.`,
    "- Report back what was done and how each acceptance criterion was verified.",
  );
  return out.join("\n");
}
