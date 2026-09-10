import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { LibraryWorkspace } from "@/features/library/library-workspace";
import { getLibraryWorkspace } from "@/features/library/server/queries";
import { getUserContext } from "@/lib/auth/get-user-context";
import { getNamibiaDateKey } from "@/lib/namibia-date";

const ltsmRoles = new Set(["school_admin", "principal", "deputy_principal", "librarian", "ltsm"]);

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  const context = await getUserContext();
  if (!context.user) redirect("/login?next=/library");

  const membership = context.memberships.find((candidate) => ltsmRoles.has(candidate.roleKey));
  if (!membership) redirect("/");

  const today = getNamibiaDateKey();
  const workspace = await getLibraryWorkspace(membership.schoolId, today);

  return (
    <AppShell>
      <div className="space-y-5">
        <div>
          <h1 className="scolapro-page-title">Library / Textbooks</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Manage the canonical resource catalog, physical stock, individual circulation and class-scale textbook allocation.</p>
        </div>
        <LibraryWorkspace {...workspace} today={today} />
      </div>
    </AppShell>
  );
}
