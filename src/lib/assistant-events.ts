/** NDJSON events streamed by /api/assistant. */
export type AssistantEvent =
  | { type: "text"; text: string }
  | { type: "tool"; name: string }
  | { type: "proposal"; id: string; title: string }
  | { type: "error"; message: string }
  | { type: "done" };
