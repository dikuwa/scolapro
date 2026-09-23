import Link from "next/link";
import { Suspense } from "react";
import { Plus, UsersRound } from "lucide-react";
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

  let schoolName = "ScolaPro Demonstration School";
  let canRegisterLearner = true;
  let schoolId: string | null = null;
  const academicYear = getNamibiaCalendarYear();

  if (isSupabaseConfigured()) {
    const context = await getUserContext();
    if (!context.user) redirect("/login");
    const currentSchoolId = context.currentSchoolMembership?.schoolId;
    const membership = currentSchoolId
      ? context.memberships.find((candidate) =>
          candidate.schoolId === currentSchoolId && candidate.roleKey === "school_admin",
        ) ??
        context.memberships.find((candidate) =>
          candidate.schoolId === currentSchoolId && learnerDirectoryRoles.has(candidate.roleKey),
        )
      : null;
    if (!membership) redirect("/");
    schoolName = membership.schoolName;
    canRegisterLearner = membership.roleKey === "school_admin";
    schoolId = membership.schoolId;
  }

  return (
    <AppShell>
      <section>
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="scolapro-page-title text-[clamp(1.25rem,1.08rem+0.45vw,1.65rem)]">Learners</h1>
            <p className="mt-1 text-sm text-muted-foreground">{schoolName} · Current learner identities and enrolments.</p>
          </div>
          <div className="flex flex-wrap gap-2 self-start sm:self-auto">
            <Link href="/class-lists" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[var(--radius-sm)] bg-surface px-4 text-sm font-medium shadow-[var(--shadow-xs)] hover:bg-surface-muted"><UsersRound aria-hidden="true" className="size-4" />Class Lists</Link>
            {canRegisterLearner ? <Link href="/learners/register" className="scolapro-cta inline-flex min-h-10 items-center justify-center gap-2 bg-brand px-4 text-sm font-medium text-white shadow-[var(--shadow-xs)] hover:bg-brand-strong">
              <Plus aria-hidden="true" className="size-4" /> Register learner
            </Link> : null}
          </div>
        </div>

        <Suspense fallback={<LearnerDirectoryLoading />}>
          <LearnerDirectoryData
            schoolId={schoolId}
            academicYear={academicYear}
            query={query}
            status={status}
            grade={grade}
            registerClass={registerClass}
            sex={sex}
            sortOrder={sortOrder}
            requestedPage={requestedPage}
          />
        </Suspense>
      </section>
    </AppShell>
  );
}

async function LearnerDirectoryData({
  schoolId,
  academicYear,
  query,
  status,
  grade,
  registerClass,
  sex,
  sortOrder,
  requestedPage,
}: {
  schoolId: string | null;
  academicYear: number;
  query: string;
  status: string;
  grade: string;
  registerClass: string;
  sex: string;
  sortOrder: "asc" | "desc";
  requestedPage: number;
}) {
  let directory = demoDirectory;
  let academicOptions: GradeOption[] = [];

  if (schoolId) {
    const [directoryResult, academicOptionsResult] = await Promise.allSettled([
      listLearnerDirectoryPage(schoolId, academicYear, {
        query,
        status,
        grade,
        registerClass,
        sex,
        sortOrder,
        page: requestedPage,
        pageSize: 50,
      }),
      getRegistrationOptions(schoolId, academicYear),
    ]);
    if (directoryResult.status === "rejected") throw directoryResult.reason;
    directory = directoryResult.value;
    academicOptions = academicOptionsResult.status === "fulfilled" ? academicOptionsResult.value : [];
  }

  return (
    <LearnerDirectory
      learners={directory.learners}
      academicOptions={academicOptions}
      total={directory.total}
      page={directory.page}
      pageSize={directory.pageSize}
      pageCount={directory.pageCount}
      initialFilters={{ query, status, grade, registerClass, sex, sortOrder }}
    />
  );
}

function LearnerDirectoryLoading() {
  return (
    <div className="rounded-[var(--radius-md)] border border-border-subtle bg-surface p-5 shadow-[var(--shadow-xs)]" aria-busy="true">
      <div className="h-10 w-full animate-pulse rounded-[var(--radius-sm)] bg-surface-muted" />
      <div className="mt-3 h-72 w-full animate-pulse rounded-[var(--radius-sm)] bg-surface-muted" />
    </div>
  );
}
