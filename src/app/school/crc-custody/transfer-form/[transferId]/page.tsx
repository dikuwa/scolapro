import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { LearnerTransferFormWorkspace } from "@/features/transfers/learner-transfer-form-workspace";
import { getLearnerTransferFormWorkspace } from "@/features/transfers/server/transfer-form";
import { getUserContext } from "@/lib/auth/get-user-context";

export default async function LearnerTransferFormPage({
  params,
}: {
  params: Promise<{ transferId: string }>;
}) {
  const context = await getUserContext();
  const { transferId } = await params;

  if (!context.user) {
    redirect(`/login?next=/school/crc-custody/transfer-form/${transferId}`);
  }
  if (!context.currentSchoolMembership || context.platformMemberships.length > 0) redirect("/");

  let workspace;
  try {
    workspace = await getLearnerTransferFormWorkspace(transferId);
  } catch {
    redirect("/school/crc-custody");
  }

  return (
    <AppShell>
      <section>
        <div className="mb-6">
          <h1 className="scolapro-page-title text-[clamp(1.25rem,1.08rem+0.45vw,1.65rem)]">
            Learner Transfer Form
          </h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
            Verify the prescribed transfer-form fields from authoritative learner, transfer, conduct and permitted CRC records before principal finalization.
          </p>
        </div>
        <LearnerTransferFormWorkspace
          source={workspace.source}
          draft={workspace.draft}
          finalization={workspace.finalization}
        />
      </section>
    </AppShell>
  );
}
