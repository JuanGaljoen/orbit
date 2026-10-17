"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import type { StatusCategory, TicketType } from "@/db/schema";

export type Vocab = {
  projects: { id: string; key: string; name: string }[];
  milestones: { id: string; projectId: string; name: string; completedAt: Date | null }[];
  statuses: { id: string; name: string; category: StatusCategory; color: string; position: number }[];
  priorities: { id: string; name: string; rank: number; color: string }[];
  labels: { id: string; name: string; color: string }[];
  /** Settings → Preferences: quick-create's project when none is implied by the page. */
  defaultProjectId: string | null;
};

export type QuickCreateDefaults = {
  projectId?: string;
  statusId?: string;
  parentId?: string;
  milestoneId?: string;
  type?: TicketType;
};

type Ctx = Vocab & {
  quickCreate: QuickCreateDefaults | null;
  openQuickCreate: (defaults?: QuickCreateDefaults) => void;
  closeQuickCreate: () => void;
  paletteOpen: boolean;
  setPaletteOpen: (open: boolean) => void;
};

const AppContext = createContext<Ctx | null>(null);

export function AppProvider({ vocab, children }: { vocab: Vocab; children: ReactNode }) {
  const [quickCreate, setQuickCreate] = useState<QuickCreateDefaults | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  return (
    <AppContext.Provider
      value={{
        ...vocab,
        quickCreate,
        openQuickCreate: (d) => setQuickCreate(d ?? {}),
        closeQuickCreate: () => setQuickCreate(null),
        paletteOpen,
        setPaletteOpen,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside <AppProvider>");
  return ctx;
}
