import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { LibraryWorkspace } from "@/features/library/library-workspace";
import { getLibraryWorkspace } from "@/features/library/server/queries";
import { getUserContext } from "@/lib/auth/get-user-context";
import { getNamibiaDateKey } from "@/lib/namibia-date";

const ltsmRoles = new Set(["school_admin", "principal", "deputy_principal", "librarian", "ltsm"]);

export const dynamic = "force-dynamic";

export default async function LibraryPage({ searchParams }: { searchParams: Promise<{ view?: string | string[] }> }) {
  const context = await getUserContext();
  if (!context.user) redirect("/login?next=/library");

  const membership = context.memberships.find((candidate) => ltsmRoles.has(candidate.roleKey));
  if (!membership) redirect("/");

  const params = await searchParams;
  const requestedView = Array.isArray(params.view) ? params.view[0] : params.view;
  const view = ["catalog", "manage", "class", "circulation", "import"].includes(requestedView ?? "")
    ? requestedView as "catalog" | "manage" | "class" | "circulation" | "import"
    : "catalog";
  const today = getNamibiaDateKey();

  return (
    <AppShell>
      <div className="space-y-5">
        <div>
          <h1 className="scolapro-page-title">Library / Textbooks</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Manage the canonical resource catalog, physical stock, individual circulation and class-scale textbook allocation.</p>
        </div>
        <Suspense fallback={<WorkspaceLoading label="Loading library workspace…" />}>
          <LibraryWorkspaceData
            schoolId={membership.schoolId}
            today={today}
            view={view}
            offlineScope={{
              userId: context.user.id,
              tenantId: membership.tenantId,
              schoolId: membership.schoolId,
            }}
          />
        </Suspense>
      </div>
    </AppShell>
  );
}


async function LibraryWorkspaceData({
  schoolId,
  today,
  view,
  offlineScope,
}: {
  schoolId: string;
  today: string;
  view: "catalog" | "manage" | "class" | "circulation" | "import";
  offlineScope: { userId: string; tenantId: string; schoolId: string };
}) {
  const workspace = await getLibraryWorkspace(schoolId, today, view);
  return <LibraryWorkspace {...workspace} view={view} today={today} offlineScope={offlineScope} />;
}

function WorkspaceLoading({ label }: { label: string }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-border-subtle bg-surface p-5 shadow-[var(--shadow-xs)]" aria-busy="true">
      <div className="h-5 w-44 animate-pulse rounded-[var(--radius-xs)] bg-surface-subtle" />
      <div className="mt-3 h-10 w-full animate-pulse rounded-[var(--radius-sm)] bg-surface-muted" />
      <p className="mt-3 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
