import { FileSearch2, FileText, ScanLine, ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { ImportDropField, ImportStageButton } from "@/features/imports/import-drop-field";
import { AdmissionCandidateForm } from "@/features/admissions/admission-candidate-form";
import {
  commitAdmissionIntake,
  decideAdmissionApplication,
  reviewAdmissionIntakeCandidate,
  stageScannedAdmissionApplication,
  startOnlineAdmissionApplication,
} from "@/features/admissions/server/actions";
import { getAdmissionsIntakeWorkspace } from "@/features/admissions/server/queries";
import { getUserContext } from "@/lib/auth/get-user-context";
import { getNamibiaCalendarYear } from "@/lib/namibia-date";

const managerRoles = new Set(["school_admin", "principal", "deputy_principal"]);

export default async function AdmissionsPage({
  searchParams,
}: {
  searchParams: Promise<{ job?: string; error?: string; success?: string }>;
}) {
  const context = await getUserContext();
  if (!context.user) redirect("/login");
  const membership = context.memberships.find((item) => managerRoles.has(item.roleKey));
  if (!membership) redirect("/");

  const search = await searchParams;
  const year = getNamibiaCalendarYear();
  const workspace = await getAdmissionsIntakeWorkspace(membership.schoolId, year, search.job);
  const job = workspace.selectedJob;
  const candidate = job?.candidate_payload ?? {};
  const learners = job?.match_candidates?.learners ?? [];
  const guardians = job?.match_candidates?.guardians ?? [];

  return (
    <AppShell>
      <div className="space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="scolapro-page-title text-xl">Admissions & document intake</h1>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Stage scanned or online applications, review extracted/corrected fields and possible matches, then commit only into the governed admissions workflow.</p>
          </div>
          <a href="/school/admissions/application-form" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-2 self-start rounded-[var(--radius-sm)] bg-surface-muted px-3 text-sm font-semibold text-foreground">
            <FileText className="size-4" /> Blank application form
          </a>
        </div>

        {search.error ? <div className="rounded-[var(--radius-sm)] bg-danger-soft p-3 text-xs font-medium text-[color:var(--danger)]">{search.error}</div> : null}
        {search.success ? <div className="rounded-[var(--radius-sm)] bg-success-soft p-3 text-xs font-medium text-[color:var(--success)]">{search.success}</div> : null}

        <section className="grid gap-4 lg:grid-cols-2">
          <form action={stageScannedAdmissionApplication} className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)]">
            <div className="mb-3 flex items-center gap-2"><ScanLine className="size-4 text-brand" /><h2 className="scolapro-section-title">Scan / upload paper application</h2></div>
            <input type="hidden" name="academicYear" value={year} />
            <ImportDropField inputId="admission-source" label="Drop application PDF or image" helper="PDF, JPEG, PNG or WebP · private admissions storage · 10MB maximum" accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp" />
            <div className="mt-3"><ImportStageButton /></div>
          </form>

          <div className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)]">
            <div className="flex items-center gap-2"><FileSearch2 className="size-4 text-brand" /><h2 className="scolapro-section-title">Online equivalent</h2></div>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">Start the same staged application without a source scan. It still requires review before it becomes an admission application.</p>
            <form action={startOnlineAdmissionApplication} className="mt-4">
              <input type="hidden" name="academicYear" value={year} />
              <button type="submit" className="min-h-10 rounded-[var(--radius-sm)] bg-brand-soft px-4 text-sm font-semibold text-brand-strong">Start online application</button>
            </form>
          </div>
        </section>

        <section className="rounded-[var(--radius-md)] bg-surface shadow-[var(--shadow-xs)]">
          <div className="border-b border-border-subtle px-4 py-4 sm:px-5">
            <h2 className="scolapro-section-title">Intake queue</h2>
            <p className="scolapro-section-description">Source artifacts and extraction candidates remain staged until a human accepts the match decision.</p>
          </div>
          {workspace.jobs.length ? <div className="divide-y divide-border-subtle">{workspace.jobs.map((item) => (
            <a key={item.id} href={`/school/admissions?job=${item.id}`} className={`grid gap-2 px-4 py-3 text-sm transition hover:bg-surface-muted sm:grid-cols-[1.4fr_1fr_1fr_auto] sm:items-center sm:px-5 ${item.id===job?.id ? "bg-brand-soft/40" : ""}`}>
              <span className="font-semibold capitalize">{item.source_kind.replaceAll("_"," ")} application</span>
              <span className="text-xs capitalize text-muted-foreground">{item.extraction_status.replaceAll("_"," ")}</span>
              <span className="text-xs capitalize text-muted-foreground">{item.status.replaceAll("_"," ")} · {item.match_status.replaceAll("_"," ")}</span>
              <span className="text-xs text-muted-foreground">{new Intl.DateTimeFormat("en-GB",{timeZone:"Africa/Windhoek",dateStyle:"medium"}).format(new Date(item.created_at))}</span>
            </a>
          ))}</div> : <p className="px-5 py-8 text-center text-xs text-muted-foreground">No admissions intake jobs yet.</p>}
        </section>

        {job ? <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div><h2 className="scolapro-section-title">Review staged application</h2><p className="scolapro-section-description">Job {job.id.slice(0,8)} · {job.status.replaceAll("_"," ")} · {job.source_kind.replaceAll("_"," ")}</p></div>
            <span className="rounded-[var(--radius-xs)] bg-surface-muted px-2.5 py-1 text-xs font-semibold capitalize">{job.review_decision.replaceAll("_"," ")}</span>
          </div>

          <div className="grid gap-5 xl:grid-cols-2">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Source / provenance</p>
              {workspace.signedSourceUrl ? <iframe title="Staged admission source" src={workspace.signedSourceUrl} className="h-[36rem] w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-muted" /> : <div className="grid min-h-48 place-items-center rounded-[var(--radius-sm)] bg-surface-muted p-5 text-center text-xs text-muted-foreground">{job.source_kind === "online_form" ? "Online application · no source scan required." : "Source preview unavailable. The staged artifact metadata remains retained."}</div>}
              {workspace.artifacts.length ? <div className="mt-2 space-y-1">{workspace.artifacts.map((artifact) => <p key={artifact.id} className="truncate text-[0.68rem] text-muted-foreground">{artifact.artifact_kind.replaceAll("_"," ")} · {artifact.file_name}</p>)}</div> : null}
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Extracted / corrected candidate</p>
              {job.status !== "committed" && job.status !== "cancelled" ? <AdmissionCandidateForm jobId={job.id} candidate={candidate} grades={workspace.grades} /> : <CandidateSummary candidate={candidate} />}
            </div>
          </div>

          {job.status === "review" ? <div className="mt-5 border-t border-border-subtle pt-4">
            <div className="flex items-center gap-2"><ShieldCheck className="size-4 text-brand" /><h3 className="text-sm font-semibold">Identity match review</h3></div>
            <p className="mt-1 text-xs text-muted-foreground">Possible matches are advisory. Never merge automatically.</p>
            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              <div className="rounded-[var(--radius-sm)] bg-surface-muted p-3">
                <p className="text-xs font-semibold">Possible learners · {learners.length}</p>
                <div className="mt-2 space-y-2">{learners.length ? learners.map((match) => (
                  <form action={reviewAdmissionIntakeCandidate} key={match.learner_id} className="flex items-center justify-between gap-3 rounded-[var(--radius-xs)] bg-surface px-3 py-2">
                    <input type="hidden" name="jobId" value={job.id} /><input type="hidden" name="decision" value="use_existing_learner" /><input type="hidden" name="selectedLearnerId" value={match.learner_id} />
                    <span className="min-w-0"><span className="block truncate text-xs font-semibold">{match.display_name}</span><span className="text-[0.65rem] text-muted-foreground">{match.date_of_birth ?? "DOB unknown"} · {match.admission_number ?? "No admission number"}</span></span>
                    <button className="shrink-0 rounded-[var(--radius-xs)] bg-brand-soft px-2.5 py-1.5 text-[0.68rem] font-semibold text-brand-strong">Use existing</button>
                  </form>
                )) : <p className="text-xs text-muted-foreground">No same-school learner match found.</p>}</div>
                <form action={reviewAdmissionIntakeCandidate} className="mt-3"><input type="hidden" name="jobId" value={job.id} /><input type="hidden" name="decision" value="create_new" /><button className="min-h-9 rounded-[var(--radius-sm)] bg-surface px-3 text-xs font-semibold shadow-[var(--shadow-xs)]">Confirm new learner candidate</button></form>
              </div>
              <div className="rounded-[var(--radius-sm)] bg-surface-muted p-3">
                <p className="text-xs font-semibold">Possible guardians · {guardians.length}</p>
                <div className="mt-2 space-y-1">{guardians.length ? guardians.map((match) => <p key={match.guardian_id} className="rounded-[var(--radius-xs)] bg-surface px-3 py-2 text-xs"><span className="font-semibold">{match.guardian_name}</span><span className="ml-2 text-muted-foreground">{match.contact_value}</span></p>) : <p className="text-xs text-muted-foreground">No same-school guardian contact match found.</p>}</div>
                <p className="mt-3 text-[0.68rem] leading-5 text-muted-foreground">Guardian matches are review evidence only; this intake does not create or relink guardian records.</p>
              </div>
            </div>
          </div> : null}

          {job.status === "ready" ? <form action={commitAdmissionIntake} className="mt-5 border-t border-border-subtle pt-4"><input type="hidden" name="jobId" value={job.id} /><button className="min-h-10 rounded-[var(--radius-sm)] bg-brand px-4 text-sm font-semibold text-white">Commit to admissions queue</button><p className="mt-2 text-xs text-muted-foreground">This creates a received admission application only. It does not enrol the learner.</p></form> : null}
        </section> : null}

        <section className="rounded-[var(--radius-md)] bg-surface shadow-[var(--shadow-xs)]">
          <div className="border-b border-border-subtle px-4 py-4 sm:px-5"><h2 className="scolapro-section-title">Admission applications</h2><p className="scolapro-section-description">Admission decision remains separate from enrolment.</p></div>
          {workspace.applications.length ? <div className="divide-y divide-border-subtle">{workspace.applications.map((application) => (
            <div key={application.id} className="grid gap-3 px-4 py-3 sm:px-5 lg:grid-cols-[1.4fr_1fr_1fr_auto] lg:items-center">
              <div><p className="text-sm font-semibold">{application.applicant_surname}, {application.applicant_first_names}</p><p className="text-[0.68rem] text-muted-foreground">{application.previous_school || "Previous school not captured"} · {application.date_of_birth || "DOB not captured"}</p></div>
              <p className="text-xs capitalize">{application.status.replaceAll("_"," ")}</p>
              <p className="text-xs text-muted-foreground">{application.guardian_name || "Guardian pending"}{application.guardian_contact ? ` · ${application.guardian_contact}` : ""}</p>
              {!["enrolled","withdrawn"].includes(application.status) ? <div className="flex flex-wrap gap-1.5">{["accepted","waitlisted","declined"].map((status) => <form key={status} action={decideAdmissionApplication}><input type="hidden" name="applicationId" value={application.id} /><input type="hidden" name="status" value={status} /><button className="rounded-[var(--radius-xs)] bg-surface-muted px-2.5 py-1.5 text-[0.68rem] font-semibold capitalize">{status}</button></form>)}</div> : <span className="text-xs text-muted-foreground">Final</span>}
            </div>
          ))}</div> : <p className="px-5 py-8 text-center text-xs text-muted-foreground">No admission applications yet.</p>}
        </section>
      </div>
    </AppShell>
  );
}

function CandidateSummary({ candidate }: { candidate: Record<string,string> }) {
  return <div className="rounded-[var(--radius-sm)] bg-surface-muted p-4 text-xs leading-6">{Object.entries(candidate).filter(([,value]) => value).map(([key,value]) => <p key={key}><span className="font-semibold capitalize">{key.replaceAll("_"," ")}:</span> {value}</p>)}</div>;
}
