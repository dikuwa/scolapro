import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { LibraryWorkspace } from "@/features/library/library-workspace";
import { getLibraryWorkspace } from "@/features/library/server/queries";
import { getUserContext } from "@/lib/auth/get-user-context";

const ltsmRoles = new Set(["school_admin", "principal", "deputy_principal", "librarian", "ltsm"]);

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  const context = await getUserContext();
  if (!context.user) redirect("/login");

  const membership = context.memberships.find((candidate) => ltsmRoles.has(candidate.roleKey));
  if (!membership) redirect("/");

  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Windhoek",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  const workspace = await getLibraryWorkspace(membership.schoolId, today);

  return (
    <AppShell>
      <div className="space-y-5">
        <div>
          <h1 className="scolapro-page-title">Library / Textbooks</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Catalog, physical-copy availability and governed school circulation from the existing LTSM inventory foundation.</p>
        </div>
        <LibraryWorkspace {...workspace} today={today} />
      </div>
    </AppShell>
  );
}
