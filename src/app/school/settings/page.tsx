import { Building2, FileText, MapPin } from "lucide-react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { ReportCardSettingsPanel } from "@/features/reporting/report-card-settings-panel";
import { getReportCardSchoolSettings } from "@/features/reporting/server/settings";
import { getUserContext } from "@/lib/auth/get-user-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const settingsRoles = new Set(["school_admin", "principal", "deputy_principal"]);

export default async function SchoolSettingsPage() {
  const context = await getUserContext();
  if (!context.user) redirect("/login?next=/school/settings");

  const membership = context.memberships.find((item) => settingsRoles.has(item.roleKey));
  if (!membership) redirect("/");

  const [reportCardSettings, schoolRow] = await Promise.all([
    getReportCardSchoolSettings(membership.schoolId),
    (async () => {
      const supabase = await createSupabaseServerClient();
      const { data } = await supabase
        .from("schools")
        .select("id, name, emis_number, region, town, status")
        .eq("id", membership.schoolId)
        .maybeSingle();
      return data;
    })(),
  ]);

  const emis = schoolRow?.emis_number ?? null;
  const location = [schoolRow?.town, schoolRow?.region].filter(Boolean).join(", ");

  return (
    <AppShell>
      <section>
        <div className="mb-6">
          <h1 className="scolapro-page-title text-[clamp(1.25rem,1.08rem+0.45vw,1.65rem)]">School settings</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">The school identity, official document details and report-card presentation rules used by documents and school-facing pages for {membership.schoolName}.</p>
        </div>

        <div className="grid overflow-hidden rounded-[var(--radius-md)] border border-border-subtle bg-surface shadow-[var(--shadow-xs)] sm:grid-cols-3">
          <div className="flex items-center justify-between gap-4 px-4 py-4 sm:px-5"><div><p className="text-xs font-medium text-muted-foreground">Official school name</p><p className="mt-1.5 text-sm font-semibold text-[color:var(--accent-indigo)]">{schoolRow?.name ?? membership.schoolName}</p></div><span className="scolapro-tone-brand grid size-9 place-items-center rounded-[var(--radius-sm)]"><Building2 className="size-4" aria-hidden="true" /></span></div>
          <div className="flex items-center justify-between gap-4 border-t border-border-subtle px-4 py-4 sm:border-l sm:border-t-0 sm:px-5"><div><p className="text-xs font-medium text-muted-foreground">Location</p><p className="mt-1.5 text-sm font-semibold text-[color:var(--accent-mint)]">{location || "Not set"}</p></div><span className="scolapro-tone-mint grid size-9 place-items-center rounded-[var(--radius-sm)]"><MapPin className="size-4" aria-hidden="true" /></span></div>
          <div className="flex items-center justify-between gap-4 border-t border-border-subtle px-4 py-4 sm:border-l sm:border-t-0 sm:px-5"><div><p className="text-xs font-medium text-muted-foreground">EMIS number</p><p className="mt-1.5 text-sm font-semibold text-[color:var(--accent-amber)]">{emis || "Not set"}</p></div><span className="scolapro-tone-amber grid size-9 place-items-center rounded-[var(--radius-sm)]"><FileText className="size-4" aria-hidden="true" /></span></div>
        </div>

        <ReportCardSettingsPanel schoolId={membership.schoolId} schoolName={membership.schoolName} settings={reportCardSettings} />
      </section>
    </AppShell>
  );
}