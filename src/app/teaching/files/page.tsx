import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { TeachingFilesHub } from "@/features/teaching/components/teaching-files";
import { getTeachingFilesHub, OFFICIAL_TEACHER_FILE_TAXONOMY_SOURCED } from "@/features/teaching/server/file-queries";
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

  const membership = context.memberships.find((item) => allowedRoles.has(item.roleKey));
  if (!membership) redirect("/");

  const academicYear = new Date().getFullYear();
  const hub = await getTeachingFilesHub({
    schoolId: membership.schoolId,
    academicYear,
    staffMemberId: membership.staffMemberId,
  });

  return (
    <AppShell>
      <div className="space-y-5">
        <div>
          <h1 className="scolapro-page-title">Teaching files</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Your professional documents and connected teaching records for {academicYear}, aggregated from your own governed teaching
            allocations.
          </p>
        </div>
        <TeachingFilesHub {...hub} taxonomySourced={OFFICIAL_TEACHER_FILE_TAXONOMY_SOURCED} />
      </div>
    </AppShell>
  );
}
