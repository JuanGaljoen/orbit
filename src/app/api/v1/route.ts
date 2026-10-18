import { apiHandler } from "@/server/api";

export const GET = apiHandler(async () => ({
  name: "Orbit API",
  version: 1,
  auth: "Authorization: Bearer $ORBIT_API_TOKEN",
  docs: "docs/api.md",
  endpoints: [
    "GET  /api/v1/projects",
    "GET  /api/v1/tickets?project=KEY&status=todo,in_progress&q=text&blocked=1&limit=50",
    "GET  /api/v1/tickets/{KEY-12}",
    "GET  /api/v1/tickets/{KEY-12}/brief  (text/markdown implementation brief)",
    "POST /api/v1/tickets  {project, title, type?, status?, priority?, description?, acceptanceCriteria?, labels?, milestone?, parent?, blockedBy?}",
    "PATCH /api/v1/tickets/{KEY-12}  {status?, priority?, title?, …, archived?}",
    "POST|DELETE /api/v1/tickets/{KEY-12}/blockers  {blockedBy: KEY}",
    "POST /api/v1/tickets/{KEY-12}/comments  {body}",
    "GET  /api/v1/milestones?project=KEY",
    "GET  /api/v1/recommendations?project=KEY",
    "POST /api/v1/proposals  {title, summary, items[]}  (queued for human review, never auto-applied)",
  ],
}));
