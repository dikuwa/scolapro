import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export function DocumentBackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-sm)] border border-border-subtle bg-surface px-3 text-xs font-semibold text-foreground shadow-[var(--shadow-xs)] transition hover:bg-surface-muted"
    >
      <ArrowLeft aria-hidden="true" className="size-3.5" />
      {label}
    </Link>
  );
}
