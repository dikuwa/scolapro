"use client";

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { CardActionToggle } from "@/components/ui/card-action-toggle";
import { cn } from "@/lib/utils";

/**
 * ScolaPro summary-first configuration surface.
 * Existing state is always visible; its editor stays inside this card.
 * Use on configuration/management pages, not continuous data-entry grids.
 */
export function ConfigurationCard({
  icon: Icon,
  tone = "scolapro-tone-brand",
  title,
  description,
  open,
  onToggle,
  panelId,
  summary,
  editor,
  action = "edit",
  disabled = false,
  className,
}: {
  icon: LucideIcon;
  tone?: string;
  title: string;
  description?: string;
  open: boolean;
  onToggle: () => void;
  panelId: string;
  summary: ReactNode;
  editor: ReactNode;
  action?: "edit" | "add";
  disabled?: boolean;
  className?: string;
}) {
  return (
    <article className={cn(
      "rounded-[var(--radius-md)] border bg-surface-elevated p-4 shadow-[var(--shadow-xs)] transition",
      open ? "border-[color:var(--brand)]/45 ring-4 ring-[color:var(--brand-soft)]/70" : "border-border-subtle",
      className,
    )}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className={cn(tone, "grid size-9 shrink-0 place-items-center rounded-[var(--radius-sm)]")}>
            <Icon className="size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground">{title}</h3>
            {description ? <p className="scolapro-section-description !mt-1">{description}</p> : null}
          </div>
        </div>
        <CardActionToggle open={open} controls={panelId} action={action} disabled={disabled} onClick={onToggle} />
      </div>
      <div className="mt-4 border-t border-border-subtle pt-3">{summary}</div>
      {open ? (
        <div
          id={panelId}
          className="mt-4 border-t border-border-subtle pt-4 [&>section]:mt-0 [&>section]:border-0 [&>section]:bg-transparent [&>section]:p-0 [&>section]:shadow-none"
          data-configuration-editor={panelId}
        >
          {editor}
        </div>
      ) : null}
    </article>
  );
}
