import { jwtVerify, SignJWT } from "jose";

/**
 * Single-user auth. Edge/Node-agnostic (used by proxy.ts and server code alike).
 *
 *  - "github": GitHub OAuth, only AUTH_GITHUB_ALLOWED_LOGIN may sign in.
 *  - "open":   dev only, when OAuth isn't configured — no login required on your own machine.
 *  - "misconfigured": production without OAuth config → everything is refused (fail closed).
 */
export type AuthMode = "github" | "open" | "misconfigured";

export const SESSION_COOKIE = "orbit_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

export function authMode(env = process.env): AuthMode {
  const configured =
    !!env.AUTH_GITHUB_ID &&
    !!env.AUTH_GITHUB_SECRET &&
    !!env.AUTH_GITHUB_ALLOWED_LOGIN &&
    (env.AUTH_SECRET?.length ?? 0) >= 32;
  if (configured) return "github";
  return env.NODE_ENV === "production" ? "misconfigured" : "open";
}

export type Session = { login: string; avatarUrl: string | null };

const secret = () => new TextEncoder().encode(process.env.AUTH_SECRET);

export async function signSession(session: Session): Promise<string> {
  return new SignJWT({ avatarUrl: session.avatarUrl })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(session.login)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secret());
}

export async function verifySession(token: string | undefined): Promise<Session | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    const allowed = process.env.AUTH_GITHUB_ALLOWED_LOGIN?.toLowerCase();
    if (!payload.sub || payload.sub.toLowerCase() !== allowed) return null;
    return { login: payload.sub, avatarUrl: (payload.avatarUrl as string) ?? null };
  } catch {
    return null;
  }
}

/** Resolves the current session from a cookie value, honouring the auth mode. */
export async function sessionFromCookie(token: string | undefined): Promise<Session | null> {
  const mode = authMode();
  if (mode === "open") return { login: "local", avatarUrl: null };
  if (mode === "misconfigured") return null;
  return verifySession(token);
}
