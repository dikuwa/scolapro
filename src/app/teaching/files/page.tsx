import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { OperationalFileControlSheetView } from "@/features/teaching/components/operational-file-control-sheet";
import { OperationalTeachingFiles } from "@/features/teaching/components/operational-teaching-files";
import { TeachingFilesHub } from "@/features/teaching/components/teaching-files";
import { getTeachingFilesHub, OFFICIAL_TEACHER_FILE_TAXONOMY_SOURCED } from "@/features/teaching/server/file-queries";
import { getOperationalFileControlSheet } from "@/features/teaching/server/operational-file-control-sheet";
import { getOperationalTeachingFilesWorkspace } from "@/features/teaching/server/operational-files-workspace";
import { getGovernedAcademicYear } from "@/features/calendar/server/calendar";
import { getUserContext } from "@/lib/auth/get-user-context";

// Same current-school teaching authority boundary as /teaching. This hub adds no
// new authority: it narrows further, resolving only the signed-in member's own
// governed allocations. HOD preparation review stays in /teaching/reviews.
const allowedRoles = new Set(["school_admin", "principal", "deputy_principal", "hod", "teacher", "class_teacher"]);

export const dynamic = "force-dynamic";

export default async function TeachingFilesPage() {
  const context = await getUserContext();
  if (!context.user) redirect("/login?next=/teaching/files");
  if (context.platformMemberships.length) redirect("/");

  const membership = context.currentSchoolMembership;
  if (!membership || !allowedRoles.has(membership.roleKey)) redirect("/");

  const ownerMembership = context.memberships.find(
    (item) =>
      item.schoolId === membership.schoolId &&
      item.staffMemberId &&
      ["teacher", "class_teacher", "hod"].includes(item.roleKey),
  );

  const academicYear = await getGovernedAcademicYear(membership.schoolId);
  const hub = await getTeachingFilesHub({
    schoolId: membership.schoolId,
    academicYear,
    staffMemberId: ownerMembership?.staffMemberId ?? null,
    canOpenLessonPreparations: context.memberships.some(
      (item) => item.schoolId === membership.schoolId && ["teacher", "class_teacher"].includes(item.roleKey),
    ),
  });
  const operationalWorkspace = await getOperationalTeachingFilesWorkspace({
    academicYear,
    effectiveOn: hub.today,
    allocations: hub.allocations,
  });
  const controlSheet = await getOperationalFileControlSheet(academicYear);

  return (
    <AppShell>
      <div className="space-y-5">
        <Link
          href="/teaching"
          className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Teaching
        </Link>
        <div>
          <h1 className="scolapro-page-title">Teaching files</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Your professional documents and connected teaching records for {academicYear}, aggregated from your own governed teaching
            allocations.
          </p>
        </div>
        <OperationalTeachingFiles workspace={operationalWorkspace} />
        <OperationalFileControlSheetView workspace={operationalWorkspace} controlSheet={controlSheet} />
        <TeachingFilesHub
          {...hub}
          taxonomySourced={OFFICIAL_TEACHER_FILE_TAXONOMY_SOURCED}
          ownerSchoolId={ownerMembership?.schoolId ?? null}
          ownerStaffMemberId={ownerMembership?.staffMemberId ?? null}
          canUploadProfessionalDocuments={Boolean(ownerMembership)}
        />
      </div>
    </AppShell>
  );
}
