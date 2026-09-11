import {redirect} from "next/navigation";
import {AppShell} from "@/components/shell/app-shell";
import {RoomInventoryWorkspace} from "@/features/room-inventory/room-inventory-workspace";
import {getRoomInventoryWorkspace} from "@/features/room-inventory/server/queries";
import {getUserContext} from "@/lib/auth/get-user-context";
import {getNamibiaDateKey} from "@/lib/namibia-date";
const allowed=new Set(["school_admin","principal","deputy_principal","hod","teacher","class_teacher","librarian"]); const managers=new Set(["school_admin","principal","deputy_principal"]);
export const dynamic="force-dynamic";
export default async function RoomInventoryPage(){const c=await getUserContext();if(!c.user)redirect("/login?next=/school/room-inventory");const m=c.memberships.find(x=>allowed.has(x.roleKey));if(!m)redirect("/");const workspace=await getRoomInventoryWorkspace(m.schoolId);return <AppShell><div className="space-y-5"><div><h1 className="scolapro-page-title">Room Inventory</h1><p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">Persistent room asset register with GRN, school and personal ownership, responsible staff and no-change verification. Official census mappings remain source-gated.</p></div><RoomInventoryWorkspace {...workspace} today={getNamibiaDateKey()} canAssign={managers.has(m.roleKey)}/></div></AppShell>}
