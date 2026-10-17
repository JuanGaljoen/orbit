import { createHmac, timingSafeEqual } from "node:crypto";

const KEY_RE = /(?<![A-Za-z0-9])([A-Za-z][A-Za-z0-9]{1,9})-(\d{1,6})(?![A-Za-z0-9])/g;

/**
 * Ticket keys mentioned in free text (branch names, PR titles/bodies, commit messages).
 * Case-insensitive so `feature/orb-12-login` works, but only keys of projects that exist count,
 * which keeps `utf-8` or `sha-256` from ever linking anything.
 */
export function extractTicketKeys(text: string | null | undefined, projectKeys: Iterable<string>): string[] {
  if (!text) return [];
  const known = new Set([...projectKeys].map((k) => k.toUpperCase()));
  const found = new Set<string>();
  for (const m of text.matchAll(KEY_RE)) {
    const prefix = m[1].toUpperCase();
    if (known.has(prefix)) found.add(`${prefix}-${Number(m[2])}`);
  }
  return [...found];
}

/** GitHub's `X-Hub-Signature-256` check: HMAC-SHA256 of the raw body, compared in constant time. */
export function verifyWebhookSignature(rawBody: string, signatureHeader: string | null, secret: string | undefined) {
  if (!secret || !signatureHeader?.startsWith("sha256=")) return false;
  const expected = Buffer.from(`sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`);
  const given = Buffer.from(signatureHeader);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
