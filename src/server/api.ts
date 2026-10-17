import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { verifyApiToken } from "./auth";
import { ConflictError, InvalidError, NotFoundError } from "./errors";

/**
 * Wraps a /api/v1 handler: bearer-token auth (ORBIT_API_TOKEN) and domain-error → HTTP mapping.
 * This is the seam an MCP server would call; it reuses the same services as the UI.
 */
export function apiHandler<C>(fn: (req: NextRequest, ctx: C) => Promise<unknown>) {
  return async (req: NextRequest, ctx: C) => {
    if (!process.env.ORBIT_API_TOKEN) return NextResponse.json({ error: "API disabled: ORBIT_API_TOKEN is not set" }, { status: 503 });
    if (!verifyApiToken(req.headers.get("authorization")))
      return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: { "www-authenticate": "Bearer" } });
    try {
      const result = await fn(req, ctx);
      return result instanceof Response ? result : NextResponse.json(result);
    } catch (err) {
      if (err instanceof NotFoundError) return NextResponse.json({ error: err.message }, { status: 404 });
      if (err instanceof InvalidError) return NextResponse.json({ error: err.message }, { status: 400 });
      if (err instanceof ConflictError) return NextResponse.json({ error: err.message }, { status: 409 });
      console.error("api error", err);
      return NextResponse.json({ error: "internal error" }, { status: 500 });
    }
  };
}

export async function jsonBody(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new InvalidError("Body must be JSON");
  }
}
