import Link from "next/link";
import { ArrowLeft, CalendarDays, Camera, FileText, GraduationCap, MapPin, UserRound } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { GuardianPanel } from "@/features/guardians/guardian-panel";
import { getLearnerGuardians, getReusableGuardians, type LearnerGuardian, type ReusableGuardian } from "@/features/guardians/server/queries";
import { LearnerProfileEditor } from "@/features/learners/learner-profile-editor";
import { getLearnerOverview, type LearnerOverview } from "@/features/learners/server/queries";
import { LearnerChangeRequestForm } from "@/features/profile-changes/learner-change-request-form";
import { getUserContext } from "@/lib/auth/get-user-context";
import { isSupabaseConfigured } from "@/lib/config/runtime";

const demoLearners: Record<string, LearnerOverview> = {
  "demo-001": { id: "demo-001", name: "Amara Demo", preferredName: "Amara", firstNames: "Amara N.", surname: "Demo", admissionNumber: "DEMO-001", grade: "Grade 10", registerClass: "Grade 10/A", status: "current", dateOfBirth: "2010-05-14", academicYear: 2026, enrolledFrom: "2026-01-12", schoolName: "ScolaPro Demonstration School", photoPath: null, photoUrl: null },
  "demo-002": { id: "demo-002", name: "Tomas Sample", preferredName: "Tomas", firstNames: "Tomas K.", surname: "Sample", admissionNumber: "DEMO-002", grade: "Grade 10", registerClass: "Grade 10/B", status: "current", dateOfBirth: "2010-02-03", academicYear: 2026, enrolledFrom: "2026-01-12", schoolName: "ScolaPro Demonstration School", photoPath: null, photoUrl: null },
};

const correctionRequestRoles = new Set(["school_admin","principal","deputy_principal","hod","teacher","class_teacher","counsellor"]);

function formatDate(value: string | null) {
  if (!value) return "Not recorded";
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-NA", { day: "numeric", month: "long", year: "numeric" }).format(parsed);
}

export default async function LearnerOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let learner: LearnerOverview | null = demoLearners[id] ?? null;
  let guardians: LearnerGuardian[] = [];
  let reusableGuardians: ReusableGuardian[] = [];
  let canRequestCorrection = false;
  let canManageLearner = false;
  let canViewConduct = false;
  let managementSchoolId: string | null = null;

  if (isSupabaseConfigured()) {
    const context = await getUserContext();
    if (!context.user) redirect("/login");
    const membership = context.memberships[0];
    learner = membership ? await getLearnerOverview(id, membership.schoolId) : null;
    canViewConduct = Boolean(membership && correctionRequestRoles.has(membership.roleKey));
    canRequestCorrection = Boolean(learner && membership && correctionRequestRoles.has(membership.roleKey));
    canManageLearner = Boolean(learner && membership?.roleKey === "school_admin");
    managementSchoolId = canManageLearner && membership ? membership.schoolId : null;
    if (learner && membership) {
      [guardians, reusableGuardians] = await Promise.all([getLearnerGuardians(id), getReusableGuardians(id, membership.schoolId)]);
    }
  }

  if (!learner) notFound();
  const avatarInitials = learner.name.split(" ").map((part) => part[0]).join("").slice(0, 2);

  return (
    <AppShell>
      <section>
        <Link href="/learners" className="mb-4 inline-flex items-center gap-2 rounded-[var(--radius-sm)] py-1 text-xs font-medium text-muted-foreground transition duration-[var(--motion-fast)] hover:text-foreground"><ArrowLeft aria-hidden="true" className="size-4" /> Learners</Link>

        <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="relative shrink-0">
              <span className="grid size-16 place-items-center overflow-hidden rounded-[var(--radius-md)] bg-brand-soft bg-cover bg-center text-sm font-semibold text-brand-strong shadow-[var(--shadow-xs)]" style={learner.photoUrl ? { backgroundImage: `url(${learner.photoUrl})` } : undefined}>{learner.photoUrl ? <span className="sr-only">Photo of {learner.name}</span> : avatarInitials}</span>
              {!learner.photoUrl ? <span className="absolute -bottom-1 -right-1 grid size-6 place-items-center rounded-full border-2 border-background bg-surface-elevated text-muted-foreground shadow-[var(--shadow-xs)]" title="No learner photo yet"><Camera className="size-3" aria-hidden="true" /><span className="sr-only">No learner photo yet</span></span> : null}
            </div>
            <div className="min-w-0"><h1 className="scolapro-page-title truncate text-[clamp(1.25rem,1.08rem+0.45vw,1.65rem)]">{learner.name}</h1><p className="mt-1 text-sm text-muted-foreground">{learner.admissionNumber ?? "No admission number"} · {learner.grade} · {learner.registerClass}</p>{!learner.photoUrl && canManageLearner ? <p className="mt-1 text-[0.66rem] text-muted-foreground">No profile photo · use Edit learner to add one</p> : null}</div>
          </div>
          <div className="flex w-full flex-col items-start gap-2 sm:w-auto sm:items-end">
            <span className="inline-flex w-fit rounded-[var(--radius-xs)] bg-success-soft px-2.5 py-1.5 text-xs font-medium capitalize text-[color:var(--success)]">{learner.status} learner</span>
            {canManageLearner && managementSchoolId ? <LearnerProfileEditor learnerId={learner.id} schoolId={managementSchoolId} preferredName={learner.preferredName} hasPhoto={Boolean(learner.photoPath)} /> : null}
          </div>
        </div>

        <div className="mb-5 border-b border-border-subtle"><span className="inline-flex border-b-2 border-brand px-3 py-2.5 text-xs font-medium text-brand-strong">Overview</span></div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)]">
          <section className="bg-surface shadow-[var(--shadow-xs)]">
            <div className="border-b border-border-subtle px-4 py-3.5 sm:px-5"><h2 className="scolapro-section-title">Learner overview</h2><p className="scolapro-section-description">Core identity and current enrolment information.</p></div>
            <dl className="grid gap-x-6 gap-y-5 p-4 sm:grid-cols-2 sm:p-5">
              <div><dt className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><UserRound aria-hidden="true" className="size-4" /> Full name</dt><dd className="mt-1.5 text-sm font-medium">{learner.firstNames} {learner.surname}</dd></div>
              <div><dt className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><UserRound aria-hidden="true" className="size-4" /> Preferred name</dt><dd className="mt-1.5 text-sm font-medium">{learner.preferredName ?? "Not recorded"}</dd></div>
              <div><dt className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><CalendarDays aria-hidden="true" className="size-4" /> Date of birth</dt><dd className="mt-1.5 text-sm font-medium">{formatDate(learner.dateOfBirth)}</dd></div>
              <div><dt className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><GraduationCap aria-hidden="true" className="size-4" /> Current placement</dt><dd className="mt-1.5 text-sm font-medium">{learner.grade} · {learner.registerClass}</dd></div>
              <div><dt className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><MapPin aria-hidden="true" className="size-4" /> School</dt><dd className="mt-1.5 text-sm font-medium">{learner.schoolName}</dd></div>
              <div><dt className="text-xs font-medium text-muted-foreground">Admission number</dt><dd className="mt-1.5 text-sm font-medium">{learner.admissionNumber ?? "Not recorded"}</dd></div>
            </dl>
            {canRequestCorrection ? <div className="border-t border-border-subtle px-4 py-4 sm:px-5"><p className="mb-2 text-xs text-muted-foreground">Notice incorrect official identity information? Submit a correction for review. Preferred name and profile photo can be maintained directly by the School Admin through Edit learner.</p><LearnerChangeRequestForm learnerId={learner.id} /></div> : null}
          </section>

          <aside className="space-y-3">
            <section className="bg-surface-muted p-4 sm:p-5"><h2 className="scolapro-section-title">Current enrolment</h2><div className="mt-4 space-y-3 text-xs"><div className="flex items-center justify-between gap-4"><span className="text-muted-foreground">Admission date</span><span className="font-medium">{formatDate(learner.enrolledFrom)}</span></div><div className="flex items-center justify-between gap-4"><span className="text-muted-foreground">Academic year</span><span className="font-medium">{learner.academicYear}</span></div><div className="flex items-center justify-between gap-4"><span className="text-muted-foreground">Status</span><span className="font-medium capitalize">{learner.status}</span></div></div></section>
            {canViewConduct ? <section className="bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5"><h2 className="scolapro-section-title">Conduct history</h2><p className="scolapro-section-description">Incidents and achievements remain linked across class changes, subject to your access.</p><Link href={`/conduct?learner=${learner.id}`} className="mt-3 inline-flex min-h-10 items-center rounded-[var(--radius-sm)] bg-brand-soft px-3 text-sm font-semibold text-brand-strong">Open conduct history</Link></section> : null}
            <section className="bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5"><div className="flex items-start gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-[var(--radius-sm)] bg-surface-muted text-muted-foreground"><FileText aria-hidden="true" className="size-4" /></span><div className="min-w-0"><h2 className="scolapro-section-title">Cumulative record</h2><p className="scolapro-section-description">Academic, attendance, support and transfer history stays linked without rewriting records created by an earlier school.</p><Link href={`/learners/${learner.id}/cumulative-record`} className="mt-3 inline-flex min-h-8 items-center rounded-[var(--radius-xs)] bg-brand-soft px-2.5 text-[0.68rem] font-semibold text-brand-strong transition hover:bg-brand hover:text-white">Open cumulative record</Link></div></div></section>
          </aside>
        </div>

        <div className="mt-5"><GuardianPanel learnerId={learner.id} guardians={guardians} reusableGuardians={reusableGuardians} /></div>
      </section>
    </AppShell>
  );
}
