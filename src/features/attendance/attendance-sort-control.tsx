"use client";

import { ArrowDownAZ, ArrowUpAZ } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Spinner } from "@/components/ui/spinner";

export type AttendanceSortDirection = "asc" | "desc";

export function AttendanceSortControl({ sort }: { sort: AttendanceSortDirection }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  function setSort(nextSort: AttendanceSortDirection) {
    if (nextSort === sort || pending) return;
    const params = new URLSearchParams(searchParams.toString());
    if (nextSort === "asc") params.delete("sort");
    else params.set("sort", "desc");
    const query = params.toString();
    startTransition(() => router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false }));
  }

  return (
    <div className="inline-flex min-h-10 w-fit items-center gap-1 rounded-[var(--radius-sm)] bg-surface-muted p-1" aria-label="Learner name order">
      <button
        type="button"
        disabled={pending}
        aria-pressed={sort === "asc"}
        onClick={() => setSort("asc")}
        className={`inline-flex min-h-8 items-center justify-center gap-1.5 rounded-[var(--radius-xs)] px-2.5 text-xs font-medium transition ${sort === "asc" ? "bg-surface text-foreground shadow-[var(--shadow-xs)]" : "text-muted-foreground hover:text-foreground"}`}
      >
        {pending && sort !== "asc" ? <Spinner className="size-3.5 text-brand" /> : <ArrowDownAZ className="size-3.5" aria-hidden="true" />}
        A–Z
      </button>
      <button
        type="button"
        disabled={pending}
        aria-pressed={sort === "desc"}
        onClick={() => setSort("desc")}
        className={`inline-flex min-h-8 items-center justify-center gap-1.5 rounded-[var(--radius-xs)] px-2.5 text-xs font-medium transition ${sort === "desc" ? "bg-surface text-foreground shadow-[var(--shadow-xs)]" : "text-muted-foreground hover:text-foreground"}`}
      >
        {pending && sort !== "desc" ? <Spinner className="size-3.5 text-brand" /> : <ArrowUpAZ className="size-3.5" aria-hidden="true" />}
        Z–A
      </button>
    </div>
  );
}
