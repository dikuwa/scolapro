"use client";

import type { InputHTMLAttributes } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

type CheckboxFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label: string;
  labelClassName?: string;
};

export function CheckboxField({ label, className, labelClassName, disabled, style, ...props }: CheckboxFieldProps) {
  return (
    <label className={cn("group inline-flex min-h-8 cursor-pointer items-center gap-2 rounded-[var(--radius-xs)] px-1.5 text-[0.7rem] text-foreground transition hover:bg-surface-muted/70", disabled && "cursor-not-allowed opacity-55", labelClassName)}>
      <span className="relative grid size-4 shrink-0 place-items-center">
        <input
          {...props}
          type="checkbox"
          disabled={disabled}
          className={cn(
            "peer size-4 cursor-pointer appearance-none rounded-[0.3rem] border border-border bg-surface-elevated shadow-[var(--shadow-xs)] transition",
            "hover:border-[color:var(--brand)]/45",
            "checked:border-brand checked:bg-brand",
            "focus-visible:ring-4 focus-visible:ring-[color:var(--brand-soft)]",
            "disabled:cursor-not-allowed",
            className,
          )}
          style={{ ...style, outline: "none" }}
        />
        <Check aria-hidden="true" strokeWidth={3} className="pointer-events-none absolute size-2.5 text-white opacity-0 transition-opacity peer-checked:opacity-100" />
      </span>
      <span>{label}</span>
    </label>
  );
}
