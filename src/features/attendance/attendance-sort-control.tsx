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
    <button
      type="button"
      disabled={pending}
      aria-label={`Learner name order: ${sort === "asc" ? "A to Z" : "Z to A"}. Activate to reverse.`}
      onClick={() => setSort(sort === "asc" ? "desc" : "asc")}
      className="inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 rounded-[var(--radius-xs)] bg-surface px-2.5 text-[0.7rem] font-medium text-brand-strong shadow-[var(--shadow-xs)] outline-none transition hover:bg-brand-soft focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]/35 disabled:opacity-55"
    >
      {pending ? <Spinner className="size-3.5 text-brand" /> : sort === "asc" ? <ArrowDownAZ className="size-3.5" aria-hidden="true" /> : <ArrowUpAZ className="size-3.5" aria-hidden="true" />}
      {sort === "asc" ? "A–Z" : "Z–A"}
    </button>
  );
}
