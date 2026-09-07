import { AlertTriangle, BadgeCheck, CalendarClock, CheckCircle2, CircleAlert, FileCheck2, RefreshCw, ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { certifyStatutorySnapshotAction, compileStatutorySnapshotAction } from "@/features/statutory/server/actions";
import { getUserContext } from "@/lib/auth/get-user-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type SearchParams = Promise<{ success?: string; error?: string }>;

type CycleRow = {
  id: string;
  school_id: string;
  academic_year: number;
  cycle_key: string;
  reference_date: string;
  opens_on: string | null;
  due_on: string | null;
  status: string;
  form_version_id: string;
  schools: { name: string } | { name: string }[] | null;
  statutory_form_versions: {
    version_key: string;
    statutory_form_definitions: { display_name: string; authority: string } | { display_name: string; authority: string }[] | null;
  } | { version_key: string; statutory_form_definitions: { display_name: string; authority: string } | { display_name: string; authority: string }[] | null }[] | null;
};

type SnapshotRow = { id: string; reporting_cycle_id: string; snapshot_number: number; status: string; generated_at: string };
type IssueRow = { id: string; reporting_cycle_id: string; severity: "info" | "warning" | "blocking"; message: string; resolved: boolean };
type CertificationRow = { id: string; reporting_cycle_id: string; snapshot_id: string; certification_role: string; certified_at: string };
type MappingRow = { id: string; reporting_cycle_id: string; snapshot_id: string; status: string; blocking_issue_count: number; compiled_at: string };

function one<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function fmtDate(value: string | null) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-NA", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${value}T00:00:00`));
}

function fmtDateTime(value: string) {
  return new Intl.DateTimeFormat("en-NA", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export default async function StatutoryPage({ searchParams }: { searchParams: SearchParams }) {
  const context = await getUserContext();
  if (!context.user) redirect("/login?next=/statutory");

  const supabase = await createSupabaseServerClient();
  const { data: cycleData, error: cycleError } = await supabase
    .from("statutory_reporting_cycles")
    .select("id,school_id,academic_year,cycle_key,reference_date,opens_on,due_on,status,form_version_id,schools(name),statutory_form_versions(version_key,statutory_form_definitions(display_name,authority))")
    .order("reference_date", { ascending: false });

  if (cycleError) throw new Error("Unable to load the statutory reporting lifecycle.");
  const cycles = (cycleData ?? []) as unknown as CycleRow[];
  const cycleIds = cycles.map((cycle) => cycle.id);

  const [snapshotResult, issueResult, certificationResult, mappingResult] = cycleIds.length
    ? await Promise.all([
        supabase.from("statutory_snapshots").select("id,reporting_cycle_id,snapshot_number,status,generated_at").in("reporting_cycle_id", cycleIds).order("snapshot_number", { ascending: false }),
        supabase.from("statutory_readiness_issues").select("id,reporting_cycle_id,severity,message,resolved").in("reporting_cycle_id", cycleIds).order("created_at", { ascending: false }),
        supabase.from("statutory_certifications").select("id,reporting_cycle_id,snapshot_id,certification_role,certified_at").in("reporting_cycle_id", cycleIds).order("certified_at", { ascending: false }),
        supabase.from("statutory_mapping_runs").select("id,reporting_cycle_id,snapshot_id,status,blocking_issue_count,compiled_at").in("reporting_cycle_id", cycleIds).order("compiled_at", { ascending: false }),
      ])
    : [{ data: [], error: null }, { data: [], error: null }, { data: [], error: null }, { data: [], error: null }];

  if (snapshotResult.error || issueResult.error || certificationResult.error || mappingResult.error) {
    throw new Error("Unable to load statutory readiness details.");
  }

  const snapshots = (snapshotResult.data ?? []) as SnapshotRow[];
  const issues = (issueResult.data ?? []) as IssueRow[];
  const certifications = (certificationResult.data ?? []) as CertificationRow[];
  const mappings = (mappingResult.data ?? []) as MappingRow[];
  const params = await searchParams;

  const platformCanManage = context.platformMemberships.some((m) => ["platform_admin", "platform_support"].includes(m.roleKey));
  const metrics = {
    cycles: cycles.length,
    blockers: issues.filter((issue) => !issue.resolved && issue.severity === "blocking").length,
    warnings: issues.filter((issue) => !issue.resolved && issue.severity === "warning").length,
    certified: cycles.filter((cycle) => ["certified", "locked", "submitted", "archived"].includes(cycle.status)).length,
  };

  return (
    <AppShell>
      <section className="space-y-5">
        <div>
          <h1 className="scolapro-page-title text-[clamp(1.25rem,1.08rem+0.45vw,1.65rem)]">Statutory reporting</h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">Operational lifecycle for authoritative reporting cycles, generated snapshots, readiness exceptions and governed certification. This workspace does not define Ministry forms or mappings.</p>
        </div>

        {params.success ? <div className="rounded-[var(--radius-sm)] border border-success/30 bg-success/10 px-4 py-3 text-sm text-foreground" role="status">{params.success}</div> : null}
        {params.error ? <div className="rounded-[var(--radius-sm)] border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-foreground" role="alert">{params.error}</div> : null}

        <div className="grid overflow-hidden rounded-[var(--radius-md)] border border-border-subtle bg-surface shadow-[var(--shadow-xs)] sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["Visible cycles", metrics.cycles, CalendarClock],
            ["Blocking issues", metrics.blockers, CircleAlert],
            ["Warnings", metrics.warnings, AlertTriangle],
            ["Certified/history", metrics.certified, ShieldCheck],
          ].map(([label, value, Icon], index) => {
            const MetricIcon = Icon as typeof CalendarClock;
            return <article key={String(label)} className={["flex items-center justify-between gap-4 px-4 py-4", index ? "border-t border-border-subtle sm:border-l sm:border-t-0" : ""].join(" ")}><div><p className="text-xs font-medium text-muted-foreground">{String(label)}</p><p className="mt-1.5 text-xl font-semibold text-foreground">{String(value)}</p></div><span className="scolapro-tone-mint grid size-9 place-items-center rounded-[var(--radius-sm)]"><MetricIcon className="size-4" /></span></article>;
          })}
        </div>

        {!cycles.length ? (
          <div className="rounded-[var(--radius-md)] border border-dashed border-border-subtle bg-surface-muted px-5 py-10 text-center">
            <FileCheck2 className="mx-auto size-7 text-muted-foreground" />
            <h2 className="mt-3 text-sm font-semibold text-foreground">No reporting cycles in your scope</h2>
            <p className="mx-auto mt-1 max-w-xl text-sm text-muted-foreground">Cycles appear here only after an authoritative form version and reporting window already exist. Circuit and regional reviewers see only schools in their effective network scope.</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {cycles.map((cycle) => {
              const school = one(cycle.schools);
              const version = one(cycle.statutory_form_versions);
              const definition = one(version?.statutory_form_definitions);
              const cycleSnapshots = snapshots.filter((item) => item.reporting_cycle_id === cycle.id);
              const snapshot = cycleSnapshots[0] ?? null;
              const cycleIssues = issues.filter((item) => item.reporting_cycle_id === cycle.id && !item.resolved);
              const blockers = cycleIssues.filter((item) => item.severity === "blocking");
              const warnings = cycleIssues.filter((item) => item.severity === "warning");
              const infos = cycleIssues.filter((item) => item.severity === "info");
              const mapping = mappings.find((item) => item.reporting_cycle_id === cycle.id && (!snapshot || item.snapshot_id === snapshot.id)) ?? null;
              const certification = certifications.find((item) => item.reporting_cycle_id === cycle.id) ?? null;
              const membership = context.memberships.find((item) => item.schoolId === cycle.school_id);
              const canManage = platformCanManage || !!membership && ["school_admin", "principal", "deputy_principal", "emis_officer"].includes(membership.roleKey);
              const canCertify = !!membership && ["school_admin", "principal"].includes(membership.roleKey);
              const historical = ["certified", "locked", "submitted", "archived"].includes(cycle.status) || snapshot?.status === "certified" || snapshot?.status === "locked";

              return (
                <article key={cycle.id} className="overflow-hidden rounded-[var(--radius-md)] border border-border-subtle bg-surface shadow-[var(--shadow-xs)]">
                  <div className="flex flex-col gap-4 border-b border-border-subtle px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
                    <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold text-foreground">{definition?.display_name ?? "Statutory form"}</h2><span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{cycle.status}</span>{historical ? <span className="inline-flex items-center gap-1 rounded-full bg-surface-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"><BadgeCheck className="size-3" />Historical state protected</span> : null}</div><p className="mt-1 text-sm text-muted-foreground">{school?.name ?? "School"} · {cycle.academic_year} · {cycle.cycle_key} · {definition?.authority ?? "Authority not displayed"}{version ? ` · v${version.version_key}` : ""}</p></div>
                    <div className="text-left text-xs text-muted-foreground sm:text-right"><p>Reference {fmtDate(cycle.reference_date)}</p><p>Due {fmtDate(cycle.due_on)}</p></div>
                  </div>

                  <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[1fr_1fr_auto]">
                    <div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Snapshot</p>{snapshot ? <><p className="mt-2 text-sm font-medium text-foreground">Snapshot #{snapshot.snapshot_number} · {snapshot.status}</p><p className="mt-1 text-xs text-muted-foreground">Generated {fmtDateTime(snapshot.generated_at)}</p><p className="mt-1 text-xs text-muted-foreground">Mapping: {mapping ? `${mapping.status} · ${mapping.blocking_issue_count} compiler blocker${mapping.blocking_issue_count === 1 ? "" : "s"}` : "not compiled"}</p></> : <p className="mt-2 text-sm text-muted-foreground">No generated snapshot exists yet.</p>}</div>
                    <div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Readiness</p><div className="mt-2 flex flex-wrap gap-2"><span className="rounded-full bg-destructive/10 px-2 py-1 text-xs font-medium text-destructive">{blockers.length} blocking</span><span className="rounded-full bg-warning/10 px-2 py-1 text-xs font-medium text-foreground">{warnings.length} warning</span><span className="rounded-full bg-surface-muted px-2 py-1 text-xs font-medium text-muted-foreground">{infos.length} info</span></div>{cycleIssues.slice(0, 3).map((issue) => <p key={issue.id} className="mt-2 text-xs leading-5 text-muted-foreground"><span className="font-semibold text-foreground">{issue.severity}:</span> {issue.message}</p>)}</div>
                    <div className="flex min-w-48 flex-col gap-2 lg:items-stretch">
                      {snapshot && canManage && !historical ? <form action={compileStatutorySnapshotAction}><input type="hidden" name="snapshotId" value={snapshot.id} /><button className="scolapro-cta inline-flex min-h-10 w-full items-center justify-center gap-2 border border-border-subtle bg-surface px-3 text-sm font-medium text-foreground hover:bg-surface-muted" type="submit"><RefreshCw className="size-4" />Refresh readiness</button></form> : null}
                      {snapshot && canCertify && !historical ? <form action={certifyStatutorySnapshotAction} className="grid gap-2"><input type="hidden" name="snapshotId" value={snapshot.id} /><input name="statement" maxLength={500} placeholder="Optional certification statement" className="min-h-10 rounded-[var(--radius-sm)] border border-border-subtle bg-surface px-3 text-sm text-foreground outline-none focus:border-brand" /><button disabled={blockers.length > 0} className="scolapro-cta inline-flex min-h-10 items-center justify-center gap-2 bg-brand px-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50" type="submit"><CheckCircle2 className="size-4" />Certify snapshot</button>{blockers.length ? <p className="text-xs text-destructive">Resolve all blocking issues at source before certification.</p> : null}</form> : null}
                      {certification ? <p className="text-xs leading-5 text-muted-foreground">Certified as <span className="font-medium text-foreground">{certification.certification_role}</span> on {fmtDateTime(certification.certified_at)}.</p> : null}
                      {!canManage ? <p className="text-xs leading-5 text-muted-foreground">Read-only network review. Underlying learner/staff facts and lifecycle mutations remain outside this scope.</p> : null}
                      {canManage && !snapshot ? <p className="text-xs leading-5 text-muted-foreground">Snapshot generation is not exposed here because N05 only operates on snapshots produced by the existing governed backend.</p> : null}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </AppShell>
  );
}
