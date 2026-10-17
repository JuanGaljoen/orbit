/**
 * Calendar dates are plain `YYYY-MM-DD` strings (Postgres `date`). "Today" is evaluated in
 * ORBIT_TIMEZONE (default UTC) so due/overdue logic doesn't shift with the server's zone.
 */
export function today(now = new Date()): string {
  return toIsoDate(now);
}

export function toIsoDate(d: Date): string {
  const tz = process.env.ORBIT_TIMEZONE || "UTC";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round(
    (Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86_400_000,
  );
}
