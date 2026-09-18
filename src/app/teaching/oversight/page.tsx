import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { getGovernedAcademicYear } from "@/features/calendar/server/calendar";
import { HodOversightWorkspace } from "@/features/teaching/hod-oversight-workspace";
import { getHodTeachingOversight } from "@/features/teaching/server/hod-oversight";
import { resolveReviewScope } from "@/features/teaching/server/review-queries";

export default async function HodTeachingOversightPage() {
  const scope = await resolveReviewScope();
  if (!scope) redirect("/login?next=/teaching/oversight");
  if (scope.roleKey !== "hod") redirect("/teaching");

  const academicYear = await getGovernedAcademicYear(scope.schoolId);
  const result = await getHodTeachingOversight(academicYear);

  if (result.state === "denied") redirect("/teaching");

  return (
    <AppShell>
      <div className="space-y-5">
        <div>
          <h1 className="scolapro-page-title text-xl">Teaching oversight</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Read-only HOD visibility across connected plans, governed preparation review evidence and actual teaching coverage for your assigned subjects.
          </p>
        </div>

        {result.state === "unavailable" ? (
          <div className="rounded-[var(--radius-md)] border border-border-subtle bg-surface p-5 text-sm text-muted-foreground">
            {result.message}
          </div>
        ) : (
          <HodOversightWorkspace rows={result.rows} />
        )}
      </div>
    </AppShell>
  );
}
