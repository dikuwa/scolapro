"use client";

import Link from "next/link";
import { LoaderCircle } from "lucide-react";
import { useFormStatus } from "react-dom";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type CompactActionTone = "neutral" | "brand" | "success" | "warning" | "danger";

const toneClasses: Record<CompactActionTone, string> = {
  neutral: "bg-surface-muted text-muted-foreground hover:bg-surface-elevated hover:text-foreground",
  brand: "bg-brand-soft text-brand-strong hover:bg-brand hover:text-white",
  success: "bg-success-soft text-[color:var(--success)] hover:bg-[color:var(--success)] hover:text-white",
  warning: "bg-warning-soft text-[color:var(--warning)] hover:bg-[color:var(--warning)] hover:text-white",
  danger: "bg-danger-soft text-[color:var(--danger)] hover:bg-[color:var(--danger)] hover:text-white",
};

export const compactActionBase = "inline-flex min-h-8 items-center justify-center gap-1.5 rounded-[var(--radius-xs)] px-2.5 text-[0.68rem] font-semibold transition-colors duration-[var(--motion-fast)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft active:translate-y-px disabled:pointer-events-none disabled:opacity-55";

function classes(tone: CompactActionTone, className?: string) {
  return `${compactActionBase} ${toneClasses[tone]} ${className ?? ""}`.trim();
}

export function CompactActionLink({
  href,
  children,
  tone = "neutral",
  className,
  ariaLabel,
}: {
  href: string;
  children: ReactNode;
  tone?: CompactActionTone;
  className?: string;
  ariaLabel?: string;
}) {
  return <Link href={href} aria-label={ariaLabel} className={classes(tone, className)}>{children}</Link>;
}

export function CompactActionButton({
  children,
  tone = "neutral",
  className,
  disabled,
  type,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  tone?: CompactActionTone;
}) {
  const { pending } = useFormStatus();
  const isSubmit = type === "submit";
  const waiting = isSubmit && pending;

  return (
    <button {...props} type={type} disabled={disabled || waiting} aria-busy={waiting || undefined} className={classes(tone, className)}>
      {waiting ? <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin" /> : null}
      {children}
    </button>
  );
}
