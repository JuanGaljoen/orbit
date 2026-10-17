import "server-only";
import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, sessionFromCookie, type Session } from "./session";

export async function getSession(): Promise<Session | null> {
  return sessionFromCookie((await cookies()).get(SESSION_COOKIE)?.value);
}

/** Every page and server action calls this — the proxy is only the first gate. */
export async function requireUser(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

/** Bearer-token check for /api/v1 (Claude Code, scripts). Disabled when ORBIT_API_TOKEN is unset. */
export function verifyApiToken(header: string | null): boolean {
  const expected = process.env.ORBIT_API_TOKEN;
  if (!expected || expected.length < 24 || !header?.startsWith("Bearer ")) return false;
  const given = Buffer.from(header.slice("Bearer ".length));
  const want = Buffer.from(expected);
  return given.length === want.length && timingSafeEqual(given, want);
}
