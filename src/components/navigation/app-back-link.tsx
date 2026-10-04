import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

type AppBackLinkProps = {
  href: string;
  label: string;
  className?: string;
};

/** The single back-navigation treatment for app and standalone document pages. */
export function AppBackLink({ href, label, className }: AppBackLinkProps) {
  return (
    <Link
      href={href}
      className={cn(
        "scolapro-cta inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-sm)] border border-border-subtle bg-surface px-3 text-xs font-semibold text-foreground shadow-[var(--shadow-xs)] transition-colors hover:bg-surface-muted",
        className,
      )}
    >
      <ArrowLeft aria-hidden="true" className="scolapro-cta-icon size-3.5" />
      {label}
    </Link>
  );
}
