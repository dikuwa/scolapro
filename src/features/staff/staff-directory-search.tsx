"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";

/**
 * Server-backed incremental staff search. One or two letters are sufficient.
 * Results update in place with the existing paginated directory RPC; no
 * invitation, exact full-name input, or explicit Search button is required.
 */
export function StaffDirectorySearch({ initialQuery }: { initialQuery: string }) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  useEffect(() => {
    const normalized = query.trim().replace(/\\s+/g, " ");
    if (normalized === initialQuery) return;
    const timer = setTimeout(() => {
      startTransition(() => {
        router.replace(normalized ? `/staff?q=${encodeURIComponent(normalized)}` : "/staff", { scroll: false });
      });
    }, 280);
    return () => clearTimeout(timer);
  }, [query, initialQuery, router]);

  return (
    <div role="search" className="flex w-full max-w-md items-center gap-2">
      <label className="scolapro-control-surface flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-[var(--radius-sm)] px-3">
        <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="sr-only">Search school staff</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Type a name, surname or employee number…"
          autoComplete="off"
          aria-label="Search school staff as you type"
          aria-busy={pending}
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/70"
        />
      </label>
      {query ? (
        <button type="button" onClick={() => { setQuery(""); startTransition(() => router.replace("/staff", { scroll: false })); }}
          className="inline-flex min-h-10 items-center gap-1 rounded-[var(--radius-sm)] bg-surface-muted px-3 text-xs font-medium text-muted-foreground hover:text-foreground"
          aria-label="Clear staff search">
          <X className="size-3.5" aria-hidden="true" /> Clear
        </button>
      ) : null}
      <span className="sr-only" role="status" aria-live="polite">{pending ? "Searching staff" : ""}</span>
    </div>
  );
}
