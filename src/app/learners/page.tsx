import Link from "next/link";
import { Plus } from "lucide-react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { LearnerDirectory } from "@/features/learners/learner-directory";
import { listLearnerDirectoryPage, type LearnerDirectoryPage } from "@/features/learners/server/queries";
import { getRegistrationOptions, type GradeOption } from "@/features/learners/server/registration-options";
import { getUserContext } from "@/lib/auth/get-user-context";
import { isSupabaseConfigured } from "@/lib/config/runtime";
import { getNamibiaCalendarYear } from "@/lib/namibia-date";

const learnerDirectoryRoles = new Set(["school_admin", "principal", "deputy_principal", "hod", "teacher", "class_teacher", "counsellor", "learner_support", "social_worker", "librarian"]);

const demoDirectory: LearnerDirectoryPage = {
  learners: [
    { id: "demo-001", name: "Amara Demo", preferredName: "Amara", admissionNumber: "DEMO-001", grade: "Grade 10", registerClass: "Grade 10/A", status: "current" },
    { id: "demo-002", name: "Tomas Sample", preferredName: "Tomas", admissionNumber: "DEMO-002", grade: "Grade 10", registerClass: "Grade 10/B", status: "current" },
  ],
  total: 2,
  page: 1,
  pageSize: 50,
  pageCount: 1,
};

type LearnerSearchParams = {
  q?: string | string[];
  status?: string | string[];
  grade?: string | string[];
  class?: string | string[];
  sex?: string | string[];
  sort?: string | string[];
  page?: string | string[];
};

function single(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function LearnersPage({ searchParams }: { searchParams: Promise<LearnerSearchParams> }) {
  const params = await searchParams;
  const query = single(params.q) ?? "";
  const status = single(params.status) ?? "current";
  const grade = single(params.grade) ?? "all";
  const registerClass = single(params.class) ?? "all";
  const sex = single(params.sex) ?? "all";
  const sortOrder = single(params.sort) === "desc" ? "desc" : "asc";
  const requestedPage = Math.max(Number(single(params.page) ?? "1") || 1, 1);

  let directory = demoDirectory;
  let academicOptions: GradeOption[] = [];
  let schoolName = "ScolaPro Demonstration School";
  let canRegisterLearner = true;
  const academicYear = getNamibiaCalendarYear();

  if (isSupabaseConfigured()) {
    const context = await getUserContext();
    if (!context.user) redirect("/login");
    const membership = context.currentSchoolMembership && learnerDirectoryRoles.has(context.currentSchoolMembership.roleKey)
      ? context.currentSchoolMembership
      : null;
    if (!membership) redirect("/");
    schoolName = membership.schoolName;
    canRegisterLearner = membership.roleKey === "school_admin";
    const [directoryResult, academicOptionsResult] = await Promise.allSettled([
      listLearnerDirectoryPage(membership.schoolId, academicYear, {
        query,
        status,
        grade,
        registerClass,
        sex,
        sortOrder,
        page: requestedPage,
        pageSize: 50,
      }),
      getRegistrationOptions(membership.schoolId, academicYear),
    ]);
    if (directoryResult.status === "rejected") throw directoryResult.reason;
    directory = directoryResult.value;
    // Grade/class options only enhance the server-paged directory filters. Do not
    // make the canonical learner read unavailable when this auxiliary schema/read
    // path is unavailable during a deployment or for an empty school.
    academicOptions = academicOptionsResult.status === "fulfilled" ? academicOptionsResult.value : [];
  }

  return (
    <AppShell>
      <section>
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="scolapro-page-title text-[clamp(1.25rem,1.08rem+0.45vw,1.65rem)]">Learners</h1>
            <p className="mt-1 text-sm text-muted-foreground">{schoolName} · Current learner identities and enrolments.</p>
          </div>
          {canRegisterLearner ? <Link href="/learners/register" className="scolapro-cta inline-flex min-h-10 items-center justify-center gap-2 self-start bg-brand px-4 text-sm font-medium text-white shadow-[var(--shadow-xs)] hover:bg-brand-strong sm:self-auto">
            <Plus aria-hidden="true" className="size-4" /> Register learner
          </Link> : null}
        </div>

        <LearnerDirectory
          learners={directory.learners}
          academicOptions={academicOptions}
          total={directory.total}
          page={directory.page}
          pageSize={directory.pageSize}
          pageCount={directory.pageCount}
          initialFilters={{ query, status, grade, registerClass, sex, sortOrder }}
        />
      </section>
    </AppShell>
  );
}
