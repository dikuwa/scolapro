import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { GuardianDirectory } from "@/features/guardians/guardian-directory";
import { getGuardianDirectory } from "@/features/guardians/server/directory";
import { getUserContext } from "@/lib/auth/get-user-context";

const allowedRoles = new Set(["school_admin", "principal", "deputy_principal", "class_teacher", "hod", "counsellor"]);

export default async function GuardianDirectoryPage() {
  const context = await getUserContext();
  if (!context.user) redirect("/login");
  const membership = context.memberships[0];
  if (!membership || !allowedRoles.has(membership.roleKey)) redirect("/");

  const guardians = await getGuardianDirectory(membership.schoolId);

  return (
    <AppShell>
      <div className="space-y-5">
        <div>
          <h1 className="scolapro-page-title text-xl">Guardian directory</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Search and contact parents/guardians linked to current learners. Guardian identities are shared across siblings.
          </p>
        </div>
        <GuardianDirectory guardians={guardians} />
      </div>
    </AppShell>
  );
}
