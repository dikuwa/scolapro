import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { CrcNetworkEscalations } from "@/features/crc/crc-network-escalations";
import { getMyCrcRequestEscalations } from "@/features/crc/server/custody";
import { getUserContext } from "@/lib/auth/get-user-context";

export default async function NetworkCrcEscalationsPage() {
  const context = await getUserContext();
  if (!context.user) redirect("/login?next=/network/crc-escalations");

  const networkMembership = context.networkMemberships.find((membership) =>
    ["circuit_officer", "regional_officer"].includes(membership.roleKey),
  );
  if (!networkMembership || context.platformMemberships.length > 0 || context.currentSchoolMembership) {
    redirect("/");
  }

  const escalations = await getMyCrcRequestEscalations();

  return (
    <AppShell>
      <section>
        <div className="mb-6">
          <h1 className="scolapro-page-title text-[clamp(1.25rem,1.08rem+0.45vw,1.65rem)]">
            CRC request referrals
          </h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
            Bounded circuit/regional oversight for overdue CRC requests. This surface contains referral metadata only and does not grant access to learner records or confidential CRC content.
          </p>
        </div>
        <CrcNetworkEscalations escalations={escalations} />
      </section>
    </AppShell>
  );
}
