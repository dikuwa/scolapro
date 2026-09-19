import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { SportsHousesWorkspace } from "@/features/sports-houses/sports-houses-workspace";
import { getSportsHousesWorkspace } from "@/features/sports-houses/server/queries";
import { getUserContext } from "@/lib/auth/get-user-context";
import { getNamibiaDateKey } from "@/lib/namibia-date";

const readerRoles = new Set(["school_admin", "principal", "deputy_principal", "hod", "teacher", "class_teacher"]);
const managerRoles = new Set(["school_admin", "principal", "deputy_principal"]);

export const dynamic = "force-dynamic";

function validUuid(value: string | undefined) {
  return value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? value : null;
}

export default async function SportsHousesPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string | string[]; school?: string | string[] }>;
}) {
  const context = await getUserContext();
  if (!context.user) redirect("/login?next=/school/sports-houses");

  const platformSupport = context.platformMemberships.some((item) => item.roleKey === "platform_support");
  if (platformSupport) redirect("/");

  const platformAdmin = context.platformMemberships.some((item) => item.roleKey === "platform_admin");
  const membership = context.memberships.find((item) => readerRoles.has(item.roleKey));
  const params = await searchParams;
  const requestedSchool = validUuid(Array.isArray(params.school) ? params.school[0] : params.school);
  const schoolId = platformAdmin && requestedSchool ? requestedSchool : membership?.schoolId ?? null;
  if (!schoolId) redirect("/");

  const defaultYear = Number(getNamibiaDateKey().slice(0, 4));
  const requestedYear = Number(Array.isArray(params.year) ? params.year[0] : params.year);
  const academicYear = Number.isInteger(requestedYear) && requestedYear >= 2000 && requestedYear <= 2200 ? requestedYear : defaultYear;
  const canManage = platformAdmin || Boolean(membership && managerRoles.has(membership.roleKey));

  const workspace = await getSportsHousesWorkspace(schoolId, academicYear);

  return (
    <AppShell>
      <div className="space-y-5">
        <div>
          <h1 className="scolapro-page-title">Sports / Houses</h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
            Configure school houses and age groups, then manage year-scoped learner and staff house allocation without changing the canonical Sports & Houses model.
          </p>
        </div>
        <SportsHousesWorkspace {...workspace} canManage={canManage} />
      </div>
    </AppShell>
  );
}
