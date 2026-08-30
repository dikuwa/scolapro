import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { LateArrivalWorkspace } from "@/features/late-arrivals/late-arrival-workspace";
import { getLateArrivalWorkspace } from "@/features/late-arrivals/server/queries";
import { getUserContext } from "@/lib/auth/get-user-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function LateArrivalsPage() {
  const context = await getUserContext();
  if (!context.user) redirect("/login");
  const membership = context.memberships[0];
  if (!membership) redirect("/");

  const leadership = ["school_admin", "principal", "deputy_principal"].includes(membership.roleKey);
  let delegated = false;
  if (!leadership) {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.from("school_duty_assignments").select("id").eq("school_id", membership.schoolId).eq("duty_key", "late_arrival_recorder").lte("active_from", new Date().toISOString().slice(0, 10)).or(`active_to.is.null,active_to.gte.${new Date().toISOString().slice(0, 10)}`).limit(1);
    delegated = Boolean(data?.length);
  }
  if (!leadership && !delegated) redirect("/");

  const year = new Date().getFullYear();
  const workspace = await getLateArrivalWorkspace(membership.schoolId, year);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Windhoek", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

  return (
    <AppShell>
      <div className="space-y-5">
        <div><h1 className="scolapro-page-title text-xl">Late arrivals</h1><p className="mt-1 text-sm text-muted-foreground">School morning late-coming and Friday detention follow-up. These records do not change Ministry attendance statistics.</p></div>
        <LateArrivalWorkspace learners={workspace.learners} detention={workspace.detention} staffOptions={workspace.staffOptions} schoolId={membership.schoolId} canManage={leadership} today={today} />
      </div>
    </AppShell>
  );
}
