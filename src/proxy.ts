import { NextResponse, type NextRequest } from "next/server";
import { authMode, SESSION_COOKIE, sessionFromCookie } from "@/server/auth/session";

// Routes that authenticate themselves: login flow, signed GitHub webhooks, bearer-token API.
const SELF_AUTHENTICATED = ["/login", "/api/auth/", "/api/github/webhook", "/api/v1/"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (SELF_AUTHENTICATED.some((p) => pathname === p || pathname.startsWith(p))) return NextResponse.next();

  const session = await sessionFromCookie(request.cookies.get(SESSION_COOKIE)?.value);
  if (session) return NextResponse.next();

  if (pathname.startsWith("/api/"))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = authMode() === "misconfigured" ? "?error=misconfigured" : "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
