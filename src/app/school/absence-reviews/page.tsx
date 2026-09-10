import { redirect } from "next/navigation";
import { z } from "zod";
import { AppShell } from "@/components/shell/app-shell";
import { AbsenceReviewWorkspace } from "@/features/attendance/absence-review-workspace";
import { getAbsenceReviewWorkspace } from "@/features/attendance/server/absence-review-workspace";
import { getSchoolAbsenceNotices } from "@/features/parents/server/absence-queries";
import { getUserContext } from "@/lib/auth/get-user-context";
import { getNamibiaDateKey } from "@/lib/namibia-date";

const allowedRoles = new Set(["school_admin", "principal", "deputy_principal", "hod", "teacher", "class_teacher", "counsellor"]);
const preferredRoleOrder = ["school_admin", "principal", "deputy_principal", "hod", "class_teacher", "teacher", "counsellor"];

function scalar(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function dateValue(value: string | string[] | undefined, fallback: string) {
  const parsed = z.string().date().safeParse(scalar(value));
  return parsed.success ? parsed.data : fallback;
}

function uuidValue(value: string | string[] | undefined) {
  const parsed = z.string().uuid().safeParse(scalar(value));
  return parsed.success ? parsed.data : undefined;
}

export default async function AbsenceReviewsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const context = await getUserContext();
  if (!context.user) redirect("/login?next=/school/absence-reviews");

  const membership = preferredRoleOrder
    .map((roleKey) => context.memberships.find((candidate) => candidate.roleKey === roleKey && allowedRoles.has(candidate.roleKey)))
    .find(Boolean);
  if (!membership) redirect("/");

  const params = await searchParams;
  const today = getNamibiaDateKey();
  const requestedTo = dateValue(params.to, today);
  const requestedFrom = dateValue(params.from, requestedTo);
  const to = requestedTo > today ? today : requestedTo;
  const from = requestedFrom > to ? to : requestedFrom;
  const view = scalar(params.view) === "subject" ? "subject" : "daily";
  const reviewState = scalar(params.review);
  const filters = {
    from,
    to,
    learnerId: uuidValue(params.learner),
    gradeId: uuidValue(params.grade),
    classId: uuidValue(params.class),
    subjectOfferingId: uuidValue(params.subject),
    reviewState: reviewState && ["all", "unexplained", "submitted", "under_review", "accepted", "returned", "closed"].includes(reviewState) ? reviewState : "all",
  };

  const workspace = await getAbsenceReviewWorkspace(
    membership.schoolId,
    { roleKey: membership.roleKey, staffMemberId: membership.staffMemberId },
    filters,
  );
  const allNotices = workspace.canReviewNotices ? await getSchoolAbsenceNotices(membership.schoolId) : [];
  const notices = allNotices.filter((notice) => notice.absenceFrom <= to && notice.absenceTo >= from);

  return (
    <AppShell>
      <section>
        <div className="mb-6">
          <h1 className="scolapro-page-title text-[clamp(1.25rem,1.08rem+0.45vw,1.65rem)]">Absence reviews</h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
            Review official daily absences and subject-period absenteeism as separate records. Parent explanations provide context and review evidence but never rewrite the official register automatically.
          </p>
        </div>
        <AbsenceReviewWorkspace workspace={workspace} filters={filters} view={view} notices={notices} />
      </section>
    </AppShell>
  );
}
