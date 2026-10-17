"use client";

import { useState } from "react";
import { saveAiSettingsAction, savePreferencesAction } from "@/actions/settings";
import { useApp } from "@/components/app/app-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { call } from "@/lib/action-client";

type Ai = { provider: "anthropic"; model: string; effort: "low" | "medium" | "high" | "xhigh" | "max" };

export function AiSettingsForm({ initial, models }: { initial: Ai; models: readonly { id: string; label: string }[] }) {
  const [v, setV] = useState(initial);
  const custom = !models.some((m) => m.id === v.model);
  return (
    <form
      className="grid max-w-xl gap-3 sm:grid-cols-3"
      onSubmit={(e) => {
        e.preventDefault();
        call(saveAiSettingsAction(v), "AI settings saved");
      }}
    >
      <div className="space-y-1.5">
        <Label>Provider</Label>
        <NativeSelect value="anthropic" disabled>
          <option value="anthropic">Anthropic</option>
        </NativeSelect>
      </div>
      <div className="space-y-1.5">
        <Label>Model</Label>
        <NativeSelect value={custom ? "__custom" : v.model} onChange={(e) => setV({ ...v, model: e.target.value === "__custom" ? "" : e.target.value })}>
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
          <option value="__custom">Other model ID…</option>
        </NativeSelect>
        {custom && <Input placeholder="model id" value={v.model} onChange={(e) => setV({ ...v, model: e.target.value })} />}
      </div>
      <div className="space-y-1.5">
        <Label>Effort</Label>
        <NativeSelect value={v.effort} onChange={(e) => setV({ ...v, effort: e.target.value as Ai["effort"] })}>
          {["low", "medium", "high", "xhigh", "max"].map((x) => (
            <option key={x} value={x}>
              {x}
            </option>
          ))}
        </NativeSelect>
      </div>
      <p className="text-xs text-muted-foreground sm:col-span-3">
        Higher effort reasons more thoroughly and costs more. Medium suits status questions; raise it for planning large objectives.
      </p>
      <div>
        <Button size="sm" type="submit" disabled={!v.model.trim()}>
          Save
        </Button>
      </div>
    </form>
  );
}

export function PreferencesForm({ initial }: { initial: { defaultProjectKey: string | null; staleDays: number } }) {
  const { projects } = useApp();
  const [v, setV] = useState(initial);
  return (
    <form
      className="grid max-w-xl gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        call(savePreferencesAction(v), "Preferences saved");
      }}
    >
      <div className="space-y-1.5">
        <Label>Default project for new tickets</Label>
        <NativeSelect value={v.defaultProjectKey ?? ""} onChange={(e) => setV({ ...v, defaultProjectKey: e.target.value || null })}>
          <option value="">First project</option>
          {projects.map((p) => (
            <option key={p.id} value={p.key}>
              {p.key} — {p.name}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="space-y-1.5">
        <Label>Stale after (days without movement)</Label>
        <Input type="number" min={1} max={90} value={v.staleDays} onChange={(e) => setV({ ...v, staleDays: Number(e.target.value) })} />
      </div>
      <div>
        <Button size="sm" type="submit">
          Save
        </Button>
      </div>
    </form>
  );
}
