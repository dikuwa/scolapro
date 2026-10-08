"use client";

import { Pencil, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";

export function CardActionToggle({
  open,
  onClick,
  controls,
  action = "edit",
  disabled = false,
}: {
  open: boolean;
  onClick: () => void;
  controls: string;
  action?: "edit" | "add";
  disabled?: boolean;
}) {
  const Icon = open ? X : action === "add" ? Plus : Pencil;
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-controls={controls}
      aria-label={open ? "Close editor" : action === "add" ? "Add record" : "Edit configuration"}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-[var(--radius-sm)] px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft disabled:cursor-not-allowed disabled:opacity-50",
        open
          ? "text-[color:var(--danger)] hover:bg-danger-soft/60"
          : "bg-brand-soft text-brand-strong hover:bg-brand-soft/70",
      )}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {open ? "Close" : action === "add" ? "Add" : "Edit"}
    </button>
  );
}
