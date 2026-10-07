"use client";

import { forwardRef, type ButtonHTMLAttributes } from "react";
import type { LucideIcon } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface RecordActionButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  label: string;
  icon?: LucideIcon;
  variant?: ButtonProps["variant"];
  compact?: boolean;
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
      icon: Icon,
      variant = "neutral",
      compact = true,
      loading = false,
      expanded,
      className,
      type = "button",
      ...props
    },
    ref,
  ) {
    return (
      <Button
        ref={ref}
        type={type}
        variant={variant}
        size="sm"
        loading={loading}
        aria-expanded={expanded}
        className={cn(
          compact && "min-h-8 rounded-[var(--radius-xs)] px-2.5 text-[0.68rem]",
          className,
        )}
        {...props}
      >
        {Icon ? <Icon className="size-3.5 shrink-0" aria-hidden="true" /> : null}
        <span>{label}</span>
      </Button>
    );
  },
);
