import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { CandidateWorkspace } from "@/features/examinations/candidate-workspace";
import { getExaminationCandidateWorkspace } from "@/features/examinations/server/candidates";
import { getUserContext } from "@/lib/auth/get-user-context";

export default async function ExaminationCandidatesPage({ searchParams }: { searchParams: Promise<{ cycle?: string | string[] }> }) {
  const context = await getUserContext();
  if (!context.user) redirect("/login?next=/statutory/examinations");
  const allowedRoles = new Set(["school_admin", "principal", "deputy_principal", "exam_officer"]);
  const membership = context.memberships.find((item) => allowedRoles.has(item.roleKey));
  if (!membership) redirect("/");
  const params = await searchParams;
  const cycle = Array.isArray(params.cycle) ? params.cycle[0] : params.cycle;
  const workspace = await getExaminationCandidateWorkspace(membership.schoolId, cycle);

  return <AppShell><section><div className="mb-6"><h1 className="scolapro-page-title text-[clamp(1.25rem,1.08rem+0.45vw,1.65rem)]">Examination Candidate Numbers</h1><p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">Assign and correct authority-issued Candidate Numbers while preserving source, history and audit provenance.</p></div><CandidateWorkspace {...workspace} /></section></AppShell>;
}

