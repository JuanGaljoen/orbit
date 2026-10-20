import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { authMode, SESSION_COOKIE, SESSION_TTL_SECONDS, signSession } from "@/server/auth/session";

const STATE_COOKIE = "orbit_oauth_state";

function origin(req: NextRequest) {
  return process.env.APP_URL?.replace(/\/$/, "") ?? req.nextUrl.origin;
}

function fail(req: NextRequest, error: string) {
  return NextResponse.redirect(`${origin(req)}/login?error=${encodeURIComponent(error)}`);
}

export async function GET(req: NextRequest, ctx: RouteContext<"/api/auth/[action]">) {
  const { action } = await ctx.params;
  const jar = await cookies();
  const secure = req.nextUrl.protocol === "https:";

  if (action === "logout") {
    jar.delete(SESSION_COOKIE);
    return NextResponse.redirect(`${origin(req)}/login`);
  }

  if (authMode() !== "github") return fail(req, "oauth_not_configured");

  if (action === "login") {
    const state = randomBytes(24).toString("hex");
    jar.set(STATE_COOKIE, state, { httpOnly: true, secure, sameSite: "lax", maxAge: 600, path: "/" });
    const url = new URL("https://github.com/login/oauth/authorize");
    url.searchParams.set("client_id", process.env.AUTH_GITHUB_ID!);
    url.searchParams.set("redirect_uri", `${origin(req)}/api/auth/callback`);
    url.searchParams.set("scope", "read:user");
    url.searchParams.set("state", state);
    url.searchParams.set("allow_signup", "false");
    // Signing out only clears our cookie; without this GitHub silently re-authorizes the live session.
    url.searchParams.set("prompt", "select_account");
    return NextResponse.redirect(url);
  }

  if (action === "callback") {
    const code = req.nextUrl.searchParams.get("code");
    const state = req.nextUrl.searchParams.get("state");
    const expected = jar.get(STATE_COOKIE)?.value;
    jar.delete(STATE_COOKIE);
    if (!code || !state || state !== expected) return fail(req, "state_mismatch");

    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({
        client_id: process.env.AUTH_GITHUB_ID,
        client_secret: process.env.AUTH_GITHUB_SECRET,
        code,
        redirect_uri: `${origin(req)}/api/auth/callback`,
      }),
    });
    const token = (await tokenRes.json()) as { access_token?: string };
    if (!token.access_token) return fail(req, "token_exchange_failed");

    const userRes = await fetch("https://api.github.com/user", {
      headers: { authorization: `Bearer ${token.access_token}`, accept: "application/vnd.github+json" },
    });
    const user = (await userRes.json()) as { login?: string; avatar_url?: string };
    if (!user.login || user.login.toLowerCase() !== process.env.AUTH_GITHUB_ALLOWED_LOGIN!.toLowerCase())
      return fail(req, "not_allowed");

    jar.set(SESSION_COOKIE, await signSession({ login: user.login, avatarUrl: user.avatar_url ?? null }), {
      httpOnly: true,
      secure,
      sameSite: "lax",
      maxAge: SESSION_TTL_SECONDS,
      path: "/",
    });
    return NextResponse.redirect(`${origin(req)}/`);
  }

  return NextResponse.json({ error: "not_found" }, { status: 404 });
}
