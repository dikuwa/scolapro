import Link from "next/link";
import { BadgeCheck, ChevronLeft, ChevronRight, Search, UserRoundCheck, UsersRound } from "lucide-react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { SingleStaffForm } from "@/features/staff/single-staff-form";
import { getSchoolStaffDirectory } from "@/features/staff/server/directory";
import { getUserContext } from "@/lib/auth/get-user-context";

function humanRole(value: string) { return value.replaceAll("_", " "); }

function roleStyle(value: string) {
  const role = value.toLocaleLowerCase();
  if (["school_admin", "principal", "deputy_principal", "hod", "management"].some((token) => role.includes(token))) return "bg-[color:var(--accent-indigo-soft)] text-[color:var(--accent-indigo)]";
  if (role.includes("teacher")) return "bg-[color:var(--accent-mint-soft)] text-[color:var(--accent-mint)]";
  if (["support", "library", "admin", "technical"].some((token) => role.includes(token))) return "bg-[color:var(--accent-sky-soft)] text-[color:var(--accent-sky)]";
  return "bg-surface-muted text-muted-foreground";
}

function pageHref(query: string, page: number) {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (page > 1) params.set("page", String(page));
  const value = params.toString();
  return value ? `/staff?${value}` : "/staff";
}

export default async function StaffPage({ searchParams }: { searchParams: Promise<{ q?: string | string[]; page?: string | string[] }> }) {
  const context = await getUserContext();
  if (!context.user) redirect("/login?next=/staff");
  const membership = context.memberships[0];
  if (!membership) redirect("/");

  const params = await searchParams;
  const query = (Array.isArray(params.q) ? params.q[0] : params.q)?.trim() ?? "";
  const requestedPage = Math.max(Number(Array.isArray(params.page) ? params.page[0] : params.page) || 1, 1);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Windhoek", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const directory = await getSchoolStaffDirectory(membership.schoolId, { query, page: requestedPage, pageSize: 50, onDate: today });
  const canAddStaff = membership.roleKey === "school_admin";
  const firstShown = directory.filteredCount ? (directory.page - 1) * directory.pageSize + 1 : 0;
  const lastShown = Math.min(directory.page * directory.pageSize, directory.filteredCount);

  return (
    <AppShell>
      <section>
        <div className="mb-6"><h1 className="scolapro-page-title text-[clamp(1.25rem,1.08rem+0.45vw,1.65rem)]">Staff directory</h1><p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">School staff placements are independent of login accounts, so staff can be timetabled before they ever need a ScolaPro invitation.</p></div>
        <div className="grid overflow-hidden rounded-[var(--radius-md)] border border-border-subtle bg-surface shadow-[var(--shadow-xs)] sm:grid-cols-3">
          <div className="flex items-center justify-between gap-4 px-4 py-4 sm:px-5"><div><p className="text-xs font-medium text-muted-foreground">Staff people</p><p className="mt-1.5 text-2xl font-semibold tracking-[-0.04em] text-[color:var(--accent-indigo)]">{directory.totalStaff}</p></div><span className="scolapro-tone-brand grid size-9 place-items-center rounded-[var(--radius-sm)]"><UsersRound className="size-4" aria-hidden="true" /></span></div>
          <div className="flex items-center justify-between gap-4 border-t border-border-subtle px-4 py-4 sm:border-l sm:border-t-0 sm:px-5"><div><p className="text-xs font-medium text-muted-foreground">Active placements</p><p className="mt-1.5 text-2xl font-semibold tracking-[-0.04em] text-[color:var(--accent-mint)]">{directory.activeStaff}</p></div><span className="scolapro-tone-mint grid size-9 place-items-center rounded-[var(--radius-sm)]"><UserRoundCheck className="size-4" aria-hidden="true" /></span></div>
          <div className="flex items-center justify-between gap-4 border-t border-border-subtle px-4 py-4 sm:border-l sm:border-t-0 sm:px-5"><div><p className="text-xs font-medium text-muted-foreground">Login accounts</p><p className="mt-1.5 text-2xl font-semibold tracking-[-0.04em] text-[color:var(--accent-sky)]">{directory.accountCount}</p></div><span className="scolapro-tone-sky grid size-9 place-items-center rounded-[var(--radius-sm)]"><BadgeCheck className="size-4" aria-hidden="true" /></span></div>
        </div>

        {canAddStaff ? <div className="mt-5"><SingleStaffForm schoolId={membership.schoolId} today={today} suggestedEmployeeNumber={directory.suggestedEmployeeNumber} /></div> : null}

        <section className="mt-5 overflow-hidden rounded-[var(--radius-md)] bg-surface shadow-[var(--shadow-xs)]">
          <div className="flex flex-col gap-3 border-b border-border-subtle p-4 sm:p-5 lg:flex-row lg:items-end lg:justify-between">
            <div><h2 className="scolapro-section-title">School staff</h2><p className="scolapro-section-description">Placement describes who works at the school; account roles describe what an invited user may do in ScolaPro.</p></div>
            <form action="/staff" method="get" className="flex w-full max-w-md gap-2">
              <label className="scolapro-control-surface flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-[var(--radius-sm)] px-3"><Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" /><input name="q" defaultValue={query} placeholder="Search name, employee no. or role…" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/70" /></label>
              <button className="min-h-10 rounded-[var(--radius-sm)] bg-brand px-3 text-xs font-semibold text-white" type="submit">Search</button>
              {query ? <Link href="/staff" className="inline-flex min-h-10 items-center rounded-[var(--radius-sm)] bg-surface-muted px-3 text-xs font-medium text-muted-foreground hover:text-foreground">Clear</Link> : null}
            </form>
          </div>

          {directory.rows.length ? (
            <div className="max-h-[70vh] overflow-auto">
              <div className="sticky top-0 z-10 hidden grid-cols-[2rem_minmax(15rem,1fr)_minmax(12rem,0.7fr)_auto] gap-3 border-b border-border-subtle bg-surface-muted px-5 py-2.5 text-[0.7rem] font-medium uppercase tracking-[0.06em] text-muted-foreground shadow-[0_1px_0_var(--border-subtle)] sm:grid">
                <span className="text-center">No.</span><span>Staff member</span><span>Placement</span><span>Starts</span>
              </div>
              <div className="divide-y divide-border-subtle px-4 sm:px-5">{directory.rows.map((row, index) => { const rowNumber=(directory.page-1)*directory.pageSize+index+1; return <article key={row.id} className="grid gap-3 py-3 sm:grid-cols-[2rem_minmax(0,1fr)_minmax(12rem,0.7fr)_auto] sm:items-center"><span className="hidden text-center text-xs tabular-nums text-muted-foreground sm:block">{rowNumber}</span><div className="min-w-0"><div className="flex items-baseline gap-2"><span className="text-xs tabular-nums text-muted-foreground sm:hidden">{rowNumber}.</span><p className="scolapro-record-title truncate">{row.name}</p></div><p className="mt-0.5 text-xs text-muted-foreground">{row.employeeNumber ? `Employee ${row.employeeNumber}` : "Employee number not set"} · {row.hasAccount ? "Account linked" : "No login account yet"}</p></div><div className="flex flex-wrap gap-1.5">{row.labels.map((label)=><span key={label} className={`inline-flex items-center gap-1.5 rounded-[var(--radius-xs)] px-2.5 py-1.5 text-xs font-medium capitalize ${roleStyle(label)}`}><BadgeCheck className="size-3.5" aria-hidden="true" />{humanRole(label)}</span>)}</div><p className="text-xs tabular-nums text-muted-foreground">From {new Intl.DateTimeFormat("en-NA", { dateStyle: "medium" }).format(new Date(`${row.activeFrom}T12:00:00`))}</p></article>; })}</div>
            </div>
          ) : <div className="m-4 rounded-[var(--radius-sm)] bg-surface-muted px-4 py-8 text-center sm:m-5"><p className="text-sm font-medium">{query ? "No staff match this search" : "No school staff linked yet"}</p><p className="mt-1 text-xs text-muted-foreground">{query ? "Try a shorter name, employee number, or role." : canAddStaff ? "Add one staff member above or use bulk import for a larger roster." : "The School Admin can add or import staff members."}</p></div>}

          {directory.filteredCount ? <div className="flex flex-col gap-2 border-t border-border-subtle px-4 py-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-5"><span>{firstShown}–{lastShown} of {directory.filteredCount}{query ? " matching staff" : " staff"}</span><div className="flex gap-2"><Link aria-disabled={directory.page<=1} href={directory.page<=1?pageHref(query,1):pageHref(query,directory.page-1)} className={`inline-flex min-h-9 items-center gap-1 rounded-[var(--radius-sm)] bg-surface-muted px-3 font-medium text-foreground ${directory.page<=1?"pointer-events-none opacity-40":""}`}><ChevronLeft className="size-3.5" />Previous</Link><Link aria-disabled={directory.page>=directory.pageCount} href={directory.page>=directory.pageCount?pageHref(query,directory.page):pageHref(query,directory.page+1)} className={`inline-flex min-h-9 items-center gap-1 rounded-[var(--radius-sm)] bg-surface-muted px-3 font-medium text-foreground ${directory.page>=directory.pageCount?"pointer-events-none opacity-40":""}`}>Next<ChevronRight className="size-3.5" /></Link></div></div> : null}
        </section>
      </section>
    </AppShell>
  );
}
