import { ContactRound } from "lucide-react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { GuardianDirectory } from "@/features/guardians/guardian-directory";
import { getGuardianDirectory } from "@/features/guardians/server/directory";
import { getUserContext } from "@/lib/auth/get-user-context";

const allowedRoles = new Set(["school_admin", "principal", "deputy_principal", "hod", "counsellor", "class_teacher"]);

export default async function GuardiansPage() {
  const context = await getUserContext();
  if (!context.user) redirect("/login?next=/guardians");
  const membership = context.memberships[0];
  if (!membership || !allowedRoles.has(membership.roleKey)) redirect("/");
  const guardians = await getGuardianDirectory(membership.schoolId);

  return <AppShell><section>
    <div className="mb-5 flex items-start gap-3"><span className="scolapro-tone-brand grid size-10 shrink-0 place-items-center rounded-[var(--radius-sm)]"><ContactRound aria-hidden="true" className="size-4" /></span><div><h1 className="scolapro-page-title text-[clamp(1.25rem,1.08rem+0.45vw,1.65rem)]">Guardian directory</h1><p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">Find current learner contacts and linked siblings. Contact details remain governed by school-role and guardian-relationship permissions.</p></div></div>
    <GuardianDirectory guardians={guardians} />
  </section></AppShell>;
}
