"use client";

import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Pencil, Settings2, type LucideIcon } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface RecordActionButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  label: string;
  icon?: LucideIcon;
  actionKind?: "edit" | "manage";
  variant?: ButtonProps["variant"];
  compact?: boolean;
  iconOnly?: boolean;
  loading?: boolean;
  expanded?: boolean;
}

/**
 * Canonical inline record-management action.
 *
 * Use this for edit/correct/manage affordances attached to an existing record.
 * The control intentionally composes the shared Button so geometry, focus,
 * disabled and tone behavior stay aligned with the application design system.
 */
export const RecordActionButton = forwardRef<HTMLButtonElement, RecordActionButtonProps>(
  function RecordActionButton(
    {
      label,
      icon,
      actionKind,
      variant = "neutral",
      compact = true,
      iconOnly = false,
      loading = false,
      expanded,
      className,
      type = "button",
      "aria-label": ariaLabel,
      ...props
    },
    ref,
  ) {
    const ResolvedIcon = icon ?? (actionKind === "edit" ? Pencil : actionKind === "manage" ? Settings2 : undefined);
    return (
      <Button
        ref={ref}
        type={type}
        variant={variant}
        size="sm"
        loading={loading}
        aria-expanded={expanded}
        aria-label={ariaLabel ?? (iconOnly ? label : undefined)}
        title={iconOnly ? label : undefined}
        className={cn(
          compact && "min-h-8 rounded-[var(--radius-xs)] px-2.5 text-[0.68rem]",
          iconOnly && "size-8 min-h-8 shrink-0 p-0",
          className,
        )}
        {...props}
      >
        {ResolvedIcon ? <ResolvedIcon className="size-3.5 shrink-0" aria-hidden="true" /> : null}
        <span className={iconOnly ? "sr-only" : undefined}>{label}</span>
      </Button>
    );
  },
);
