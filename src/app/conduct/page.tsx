import { redirect } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { CompactActionLink } from "@/components/ui/compact-action";
import { getUserContext } from "@/lib/auth/get-user-context";
import { ConductWorkspace } from "@/features/conduct/conduct-workspace";
import { getConductWorkspace } from "@/features/conduct/server/queries";
import { conductRoles, type ConductDomain } from "@/features/conduct/types";

export default async function ConductPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const context = await getUserContext();
  if (!context.user) redirect("/login?next=/conduct");
  const membership = context.memberships.find((candidate) => conductRoles.includes(candidate.roleKey));
  if (!membership) redirect("/");
  const params = await searchParams;
  const uuid = (value: unknown) => { const parsed = z.string().uuid().safeParse(value); return parsed.success ? parsed.data : ""; };
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Windhoek", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const date = z.string().date().safeParse(params.on);
  const on = date.success && date.data <= today ? date.data : today;
  const domain: ConductDomain = params.tab === "achievement" ? "achievement" : "conduct";
  const page = Math.max(0, Math.min(10000, Math.floor(Number(params.page) || 0)));
  const filters = { domain, learnerId: uuid(params.learner), classId: uuid(params.class), gradeId: uuid(params.grade), on, page };
  const workspace = await getConductWorkspace(membership.schoolId, on, domain, filters.learnerId || null, filters.classId || null, filters.gradeId || null, page);
  const canManage = ["school_admin", "principal"].includes(membership.roleKey);

  return (
    <AppShell>
      <section>
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h1 className="scolapro-page-title text-[clamp(1.25rem,1.08rem+0.45vw,1.65rem)]">Conduct</h1>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">Record incidents and celebrate achievements using your school’s policy.</p>
          </div>
          {canManage ? (
            <CompactActionLink href="/school/setup#conduct-categories" tone="brand" className="self-start sm:self-auto">
              Configure conduct policy
              <ArrowUpRight aria-hidden="true" className="size-3.5" />
            </CompactActionLink>
          ) : null}
        </div>
        <ConductWorkspace {...workspace} schoolId={membership.schoolId} filters={filters} today={today} canRecord={domain === "conduct" || membership.roleKey !== "counsellor"} canManage={canManage} />
      </section>
    </AppShell>
  );
}
