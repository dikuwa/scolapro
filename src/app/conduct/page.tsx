import { redirect } from "next/navigation";
import { z } from "zod";
import { AppShell } from "@/components/shell/app-shell";
import { getUserContext } from "@/lib/auth/get-user-context";
import { ConductWorkspace } from "@/features/conduct/conduct-workspace";
import { getConductWorkspace } from "@/features/conduct/server/queries";
import { conductRoles, type ConductDomain } from "@/features/conduct/types";

export default async function ConductPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const context = await getUserContext();
  if (!context.user) redirect("/login?next=/conduct");
  const membership = context.memberships[0];
  if (!membership || !conductRoles.includes(membership.roleKey)) redirect("/");
  const params = await searchParams;
  const uuid = (value: unknown) => { const parsed = z.string().uuid().safeParse(value); return parsed.success ? parsed.data : ""; };
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Windhoek", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const date = z.string().date().safeParse(params.on);
  const on = date.success && date.data <= today ? date.data : today;
  const domain: ConductDomain = params.tab === "achievement" ? "achievement" : "conduct";
  const page = Math.max(0, Math.min(10000, Math.floor(Number(params.page) || 0)));
  const filters = { domain, learnerId: uuid(params.learner), classId: uuid(params.class), gradeId: uuid(params.grade), on, page };
  const workspace = await getConductWorkspace(membership.schoolId, on, domain, filters.learnerId || null, filters.classId || null, filters.gradeId || null, page);
  return <AppShell><div className="space-y-5"><header><h1 className="scolapro-page-title">Conduct</h1><p className="mt-1 text-sm text-muted-foreground">Record incidents and celebrate achievements using your school’s policy.</p></header><ConductWorkspace {...workspace} schoolId={membership.schoolId} filters={filters} today={today} canRecord={domain === "conduct" || membership.roleKey !== "counsellor"} canManage={["school_admin", "principal"].includes(membership.roleKey)} /></div></AppShell>;
}
