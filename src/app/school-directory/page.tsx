import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { SchoolDirectoryWorkspace } from "@/features/school-directory/school-directory-workspace";
import {
  getDirectoryFilterOptions,
  getDirectoryViewerAuthority,
  searchSchoolDirectory,
} from "@/features/school-directory/server/queries";
import { getUserContext } from "@/lib/auth/get-user-context";

export const dynamic = "force-dynamic";

/**
 * The directory is intentionally available to EVERY authenticated user, including
 * ordinary school roles and platform/network product users: all returned fields
 * are school-published public institutional contact information. Anonymous users
 * are redirected to login.
 */
export default async function SchoolDirectoryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; region?: string; circuit?: string }>;
}) {
  const context = await getUserContext();
  if (!context.user) redirect("/login?next=/school-directory");

  const params = await searchParams;
  const search = (params.q ?? "").trim();

  const [schools, filters, authority] = await Promise.all([
    searchSchoolDirectory({ search, regionId: params.region, circuitId: params.circuit }),
    getDirectoryFilterOptions(),
    getDirectoryViewerAuthority(),
  ]);

  return (
    <AppShell>
      <SchoolDirectoryWorkspace schools={schools} regions={filters.regions} circuits={filters.circuits} authority={authority} initialSearch={search} />
    </AppShell>
  );
}
