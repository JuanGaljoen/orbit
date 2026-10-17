"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useApp } from "@/components/app/app-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { STATUS_CATEGORIES, TICKET_TYPES } from "@/db/schema";
import { TYPE_META } from "./badges";

const CATEGORY_LABEL: Record<string, string> = {
  backlog: "Backlog",
  todo: "Todo",
  in_progress: "In progress",
  in_review: "In review",
  done: "Done",
};

export function TicketFilters({ showSort = true, showStatus = true }: { showSort?: boolean; showStatus?: boolean }) {
  const app = useApp();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    router.replace(`${pathname}?${next}`);
  };

  useEffect(() => {
    const t = setTimeout(() => {
      if ((params.get("q") ?? "") !== q) setParam("q", q || null);
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const active = [...params.keys()].filter((k) => !["sort", "dir", "view"].includes(k)).length > 0;

  const select = (key: string, label: string, options: { value: string; label: string }[]) => (
    <NativeSelect
      aria-label={label}
      value={params.get(key) ?? ""}
      onChange={(e) => setParam(key, e.target.value || null)}
      className="h-7 w-auto text-xs"
    >
      <option value="">{label}: all</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </NativeSelect>
  );

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Filter by text or key…"
        className="h-7 w-48 text-xs"
        aria-label="Search tickets"
      />
      {select("project", "Project", app.projects.map((p) => ({ value: p.key, label: p.key })))}
      {showStatus &&
        select("status", "Status", STATUS_CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABEL[c] })))}
      {select("priority", "Priority", app.priorities.map((p) => ({ value: p.id, label: p.name })))}
      {select("label", "Label", app.labels.map((l) => ({ value: l.id, label: l.name })))}
      {select("type", "Type", TICKET_TYPES.map((t) => ({ value: t, label: TYPE_META[t].label })))}
      {select("due", "Due", [
        { value: "overdue", label: "Overdue" },
        { value: "today", label: "Today" },
        { value: "week", label: "Next 7 days" },
        { value: "any", label: "Has due date" },
        { value: "none", label: "No due date" },
      ])}
      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={params.get("blocked") === "1"}
          onChange={(e) => setParam("blocked", e.target.checked ? "1" : null)}
        />
        Blocked
      </label>
      {showSort && (
        <>
          <NativeSelect
            aria-label="Sort"
            value={params.get("sort") ?? "priority"}
            onChange={(e) => setParam("sort", e.target.value)}
            className="ml-auto h-7 w-auto text-xs"
          >
            <option value="priority">Sort: priority</option>
            <option value="due">Sort: due date</option>
            <option value="updated">Sort: updated</option>
            <option value="created">Sort: created</option>
            <option value="status">Sort: status</option>
            <option value="key">Sort: key</option>
          </NativeSelect>
          <Button
            size="xs"
            variant="outline"
            onClick={() => setParam("dir", params.get("dir") === "desc" ? "asc" : "desc")}
          >
            {params.get("dir") === "desc" ? "↓ desc" : "↑ asc"}
          </Button>
        </>
      )}
      {active && (
        <Button
          size="xs"
          variant="ghost"
          onClick={() => {
            setQ("");
            router.replace(pathname);
          }}
        >
          <X /> Clear
        </Button>
      )}
    </div>
  );
}
