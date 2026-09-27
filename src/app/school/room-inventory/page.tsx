import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { RoomInventoryWorkspace } from "@/features/room-inventory/room-inventory-workspace";
import { getRoomInventoryWorkspace } from "@/features/room-inventory/server/queries";
import { getUserContext } from "@/lib/auth/get-user-context";
import { getNamibiaDateKey } from "@/lib/namibia-date";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const managerRoles = new Set(["school_admin", "principal", "deputy_principal"]);

export const dynamic = "force-dynamic";

export default async function RoomInventoryPage() {
  const context = await getUserContext();
  if (!context.user) redirect("/login?next=/school/room-inventory");

  const currentSchoolId = context.currentSchoolMembership?.schoolId ?? null;
  if (!currentSchoolId) redirect("/");

  const managerMembership = context.memberships.find((membership) => membership.schoolId === currentSchoolId && managerRoles.has(membership.roleKey));
  let canAccess = Boolean(managerMembership);

  if (!canAccess) {
    const staffMemberIds = [...new Set(context.memberships.map((membership) => membership.staffMemberId).filter((staffMemberId): staffMemberId is string => Boolean(staffMemberId)))];
    if (staffMemberIds.length) {
      const today = getNamibiaDateKey();
      const supabase = await createSupabaseServerClient();
      const { data } = await supabase
        .from("room_inventory_custodians")
        .select("id")
        .eq("school_id", currentSchoolId)
        .in("staff_member_id", staffMemberIds)
        .lte("effective_from", today)
        .or(`effective_to.is.null,effective_to.gte.${today}`)
        .limit(1);
      canAccess = Boolean(data?.length);
    }
  }

  if (!canAccess) redirect("/");

  const workspace = await getRoomInventoryWorkspace(currentSchoolId);
  const viewerStaffMemberIds = [...new Set(
    context.memberships
      .filter((membership) => membership.schoolId === currentSchoolId)
      .map((membership) => membership.staffMemberId)
      .filter((staffMemberId): staffMemberId is string => Boolean(staffMemberId)),
  )];
  const isManager = Boolean(managerMembership);

  return (
    <AppShell>
      <div className="space-y-5">
        <div>
          <h1 className="scolapro-page-title">{isManager ? "Room Inventory" : "My Room Inventory"}</h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
            {isManager
              ? "Scan rooms first, open one when you need detail, and keep assignments or changes out of the way until they are needed."
              : "Review the room inventory you are responsible for, record changes when needed, and confirm the room after checking it."}
          </p>
        </div>
        <RoomInventoryWorkspace
          {...workspace}
          today={getNamibiaDateKey()}
          canAssign={isManager}
          viewerStaffMemberIds={viewerStaffMemberIds}
        />
      </div>
    </AppShell>
  );
}
