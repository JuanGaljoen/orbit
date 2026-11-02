import type { CSSProperties } from "react";

const TINTS = [
  "bg-sky-500/70",
  "bg-pink-500/70",
  "bg-emerald-500/70",
  "bg-amber-500/70",
  "bg-violet-500/70",
  "bg-rose-500/70",
  "bg-teal-500/70",
  "bg-indigo-500/70",
];

/** A stable colour per project key, so a board keeps its colour everywhere it appears. */
export function boardTint(key: string) {
  let h = 0;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return TINTS[h % TINTS.length];
}

/**
 * How to paint a project's board colour: the user's chosen colour when set (inline style, at the
 * same 70% strength as the palette), otherwise the key-derived class.
 */
export function boardSwatch(project: { key: string; color: string | null }): { className?: string; style?: CSSProperties } {
  return project.color ? { style: { backgroundColor: `${project.color}b3` } } : { className: boardTint(project.key) };
}
