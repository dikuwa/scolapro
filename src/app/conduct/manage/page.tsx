import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { redirect } from "next/navigation";
import { z } from "zod";
import { AppShell } from "@/components/shell/app-shell";
import { ConductManagementDashboard } from "@/features/conduct/conduct-management-dashboard";
import { getConductManagementView } from "@/features/conduct/server/management";
import { getRegistrationOptions } from "@/features/learners/server/registration-options";
import { getGovernedAcademicYear } from "@/features/calendar/server/calendar";
import { getUserContext } from "@/lib/auth/get-user-context";

const managementRoles = new Set(["school_admin","principal","deputy_principal","hod"]);

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ConductManagementPage({
  searchParams,
}: {
  searchParams: Promise<Record<string,string|string[]|undefined>>;
}) {
  const context = await getUserContext();
  if (!context.user) redirect("/login?next=/conduct/manage");

  const currentSchoolId = context.currentSchoolMembership?.schoolId;
  const membership = currentSchoolId
    ? context.memberships.find((candidate) => candidate.schoolId === currentSchoolId && managementRoles.has(candidate.roleKey))
    : null;
  if (!membership) redirect("/conduct");

  const params = await searchParams;
  const uuid = (value: string | undefined) => {
    const parsed = z.string().uuid().safeParse(value);
    return parsed.success ? parsed.data : "";
  };
  const query = (one(params.q) ?? "").trim().slice(0,120);
  const gradeId = uuid(one(params.grade));
  const classId = uuid(one(params.class));
  const attentionOnly = one(params.attention) === "1";
  const repeatedOnly = one(params.repeated) === "1";
  const page = Math.max(0,Math.min(10000,Math.floor(Number(one(params.page)) || 0)));
  const academicYear = await getGovernedAcademicYear(membership.schoolId);

  const [view, registration] = await Promise.all([
    getConductManagementView(membership.schoolId, academicYear, {
      query,
      gradeId: gradeId || null,
      classId: classId || null,
      attentionOnly,
      repeatedOnly,
      page,
    }),
    getRegistrationOptions(membership.schoolId, academicYear),
  ]);

  const gradeOptions = registration.map((grade) => ({ value: grade.id, label: grade.label }));
  const classOptions = registration.flatMap((grade) => grade.classes.map((item) => ({ value: item.id, label: item.label, gradeId: grade.id })));

  return (
    <AppShell>
      <section>
        <Link href="/conduct" className="mb-4 inline-flex items-center gap-2 rounded-[var(--radius-sm)] py-1 text-xs font-medium text-muted-foreground transition hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden="true" /> Conduct
        </Link>
        <div className="mb-6">
          <h1 className="scolapro-page-title">Conduct management</h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">School-wide Recognition and Violation overview for leadership review.</p>
        </div>
        <ConductManagementDashboard
          view={view}
          filters={{ query, gradeId, classId, attentionOnly, repeatedOnly, page }}
          gradeOptions={gradeOptions}
          classOptions={classOptions}
        />
      </section>
    </AppShell>
  );
}
