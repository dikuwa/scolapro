import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-background px-4 py-10">
      <section className="w-full max-w-lg rounded-2xl border border-border bg-surface p-6 text-left shadow-[var(--shadow-sm)]">
        <p className="text-xs font-medium text-muted-foreground">404</p>
        <h1 className="mt-2 text-xl font-semibold tracking-[-0.03em]">This page is not available</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          The link may be outdated, or your role may not have access to this area.
        </p>
        <Link
          href="/"
          className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-xl bg-surface-muted px-4 text-sm font-medium text-foreground transition duration-200 hover:bg-surface-subtle"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Return to dashboard
        </Link>
      </section>
    </main>
  );
}
