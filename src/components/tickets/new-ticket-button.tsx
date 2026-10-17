"use client";

import { Plus } from "lucide-react";
import { useApp, type QuickCreateDefaults } from "@/components/app/app-context";
import { Button } from "@/components/ui/button";

export function NewTicketButton({
  defaults,
  label = "New ticket",
  variant = "default",
}: {
  defaults?: QuickCreateDefaults;
  label?: string;
  variant?: "default" | "outline" | "ghost";
}) {
  const { openQuickCreate } = useApp();
  return (
    <Button size="sm" variant={variant} onClick={() => openQuickCreate(defaults)}>
      <Plus /> {label}
    </Button>
  );
}
