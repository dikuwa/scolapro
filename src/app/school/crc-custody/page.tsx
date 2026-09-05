import { ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { CrcCustodyWorkspace } from "@/features/crc/crc-custody-workspace";
import { getCrcCustodyDestinations, getMyCrcCustodyRecords } from "@/features/crc/server/custody";
import { getUserContext } from "@/lib/auth/get-user-context";

const supportRoles = new Set(["counsellor", "learner_support", "social_worker"]);
const leadershipRoles = new Set(["school_admin", "principal", "deputy_principal"]);

export default async function CrcCustodyPage() {
  const context = await getUserContext();
  if (!context.user) redirect("/login?next=/school/crc-custody");

  const hasSupport = context.memberships.some((membership) => supportRoles.has(membership.roleKey));
  const hasLeadership = context.memberships.some((membership) => leadershipRoles.has(membership.roleKey));
  if (!hasSupport && !hasLeadership) redirect("/");

  const [records, destinations] = await Promise.all([
    getMyCrcCustodyRecords(),
    hasSupport ? getCrcCustodyDestinations() : Promise.resolve([]),
  ]);

  return (
    <AppShell>
      <section>
        <div className="mb-6">
          <h1 className="scolapro-page-title text-[clamp(1.25rem,1.08rem+0.45vw,1.65rem)]">CRC custody</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">Governed confidential cumulative-record custody. School-to-school transfers are dispatched to an explicitly authorized receiving custodian and closed only after acknowledgement — never shared as an open file.</p>
        </div>
        <div className="grid overflow-hidden rounded-[var(--radius-md)] border border-border-subtle bg-surface shadow-[var(--shadow-xs)] sm:grid-cols-2">
          <div className="flex items-center justify-between gap-4 px-4 py-4 sm:px-5"><div><p className="text-xs font-medium text-muted-foreground">Records in scope</p><p className="mt-1.5 text-2xl font-semibold tracking-[-0.04em] text-[color:var(--accent-indigo)]">{records.length}</p></div><span className="scolapro-tone-brand grid size-9 place-items-center rounded-[var(--radius-sm)]"><ShieldCheck className="size-4" aria-hidden="true" /></span></div>
          <div className="flex items-center justify-between gap-4 border-t border-border-subtle px-4 py-4 sm:border-l sm:border-t-0 sm:px-5"><div><p className="text-xs font-medium text-muted-foreground">Access model</p><p className="mt-1.5 text-sm font-semibold text-[color:var(--accent-mint)]">Need-to-know only</p></div><span className="scolapro-tone-mint grid size-9 place-items-center rounded-[var(--radius-sm)]"><ShieldCheck className="size-4" aria-hidden="true" /></span></div>
        </div>
        <CrcCustodyWorkspace records={records} destinations={destinations} canPrepare={hasSupport} leadership={hasLeadership} />
      </section>
    </AppShell>
  );
}