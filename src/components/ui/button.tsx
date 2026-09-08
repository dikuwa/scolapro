import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

/**
 * Canonical ScolaPro action button.
 *
 * Geometry and tones are derived from the classes already used across
 * production surfaces (attendance, guardians, late arrivals, conduct,
 * reporting): a `min-h-10`/`min-h-9` control with `--radius-sm` corners,
 * brand/soft/success/danger surfaces and an explicit disabled + pending state.
 *
 * Use `loading` for any async mutation so the control disables itself, shows a
 * spinner and announces the busy state. Prefer this component over new inline
 * button class strings on surfaces touched by UI-consistency work.
 */
export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-[var(--radius-sm)] font-semibold transition-colors duration-[var(--motion-fast)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--brand-soft)] disabled:pointer-events-none disabled:opacity-55",
  {
    variants: {
      variant: {
        primary: "bg-brand text-white hover:bg-brand-strong",
        soft: "bg-brand-soft text-brand-strong hover:bg-surface-muted hover:text-brand-strong",
        neutral: "bg-surface-muted text-muted-foreground hover:bg-surface-subtle hover:text-foreground",
        ghost: "bg-transparent text-muted-foreground hover:bg-surface-muted hover:text-foreground",
        success: "bg-success-soft text-[color:var(--success)] hover:bg-[color:var(--success)] hover:text-white",
        danger: "bg-danger-soft text-[color:var(--danger)] hover:bg-[color:var(--danger)] hover:text-white",
      },
      size: {
        md: "min-h-10 px-4 text-sm",
        sm: "min-h-9 px-3 text-xs",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /** Shows a spinner, disables the control and marks it busy. */
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, loading = false, disabled, type = "button", children, ...props },
  ref,
) {
  const busy = loading === true;
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    >
      {busy ? <Spinner className="size-4 shrink-0 text-current" /> : null}
      {children}
    </button>
  );
});
