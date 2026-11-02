import { NextResponse } from "next/server";
import { renderFloorplanPage } from "@/server/floorplan/page";
import { requireUser } from "@/server/auth";
import { NotFoundError } from "@/server/errors";
import { getProjectByKey, getProjectFloorplan } from "@/server/services/projects";

/** The Architecture tab's iframe: Floorplan's viewer with this project's graph injected. Same-origin framing only. */
export async function GET(_req: Request, ctx: RouteContext<"/projects/[key]/floorplan.html">) {
  await requireUser();
  const { key } = await ctx.params;
  try {
    const { graph } = await getProjectFloorplan(key);
    if (!graph) return new NextResponse("No floorplan has been pushed for this project", { status: 404 });
    const project = await getProjectByKey(key);
    return new NextResponse(renderFloorplanPage(graph, `${project.name} map`), {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "private, no-store",
        "x-frame-options": "SAMEORIGIN",
        "content-security-policy": "frame-ancestors 'self'",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (e) {
    if (e instanceof NotFoundError) return new NextResponse(e.message, { status: 404 });
    throw e;
  }
}
