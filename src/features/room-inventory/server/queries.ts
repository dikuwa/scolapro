import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getNamibiaDateKey } from "@/lib/namibia-date";

// #702: effective custodian is resolved as manual override first, then the
// derived Register Class -> Home Room -> Register Teacher default. A room whose
// home-room classes declare different register teachers is reported as
// "ambiguous" so the workspace never silently picks one.
export type RoomCustodianSource = "manual" | "inherited" | "ambiguous" | "none";
export type RoomHomeRoomClass = {
  id: string;
  code: string;
  name: string;
  teacherId: string | null;
  teacherName: string | null;
};
export type RoomInventoryRoom = {
  id: string;
  code: string;
  name: string;
  block: string | null;
  status: string;
  custodianId: string | null;
  custodianName: string | null;
  custodianSource: RoomCustodianSource;
  custodianReason: string;
  inheritedCustodianId: string | null;
  inheritedCustodianName: string | null;
  manualEffectiveFrom: string | null;
  homeRoomClasses: RoomHomeRoomClass[];
  lastVerified: string | null;
  itemCount: number;
};
export type RoomInventoryItem = {
  id: string;
  roomId: string;
  name: string;
  ownership: string;
  quantity: number;
  condition: string;
  assetNumber: string | null;
  notes: string | null;
  status: string;
  version: number;
};
export type RoomInventoryVerification = {
  id: string;
  roomId: string;
  verifiedOn: string;
  status: string;
  itemCount: number;
  notes: string | null;
};
export type RoomInventoryStaff = { id: string; name: string };
type CustodianResolution = {
  room_id: string;
  source: RoomCustodianSource;
  staff_member_id: string | null;
  manual_staff_member_id: string | null;
  manual_effective_from: string | null;
  inherited_staff_member_id: string | null;
  home_room_class_count: number;
  home_room_teacher_count: number;
  home_room_class_ids: string[];
  reason: string;
};

export async function getRoomInventoryWorkspace(schoolId: string) {
  const supabase = await createSupabaseServerClient();
  const today = getNamibiaDateKey();
  const [
    roomsResult,
    itemsResult,
    custodiansResult,
    verificationsResult,
    assignmentsResult,
    homeRoomClassesResult,
    resolutionResult,
  ] = await Promise.all([
    supabase.from("school_rooms").select("id,room_code,display_name,block_name,status").eq("school_id", schoolId).order("block_name").order("display_name"),
    supabase.from("room_inventory_items").select("id,room_id,item_name,ownership,quantity,condition,asset_number,notes,status,version").eq("school_id", schoolId).order("item_name"),
    supabase.from("room_inventory_custodians").select("room_id,staff_member_id,effective_from,effective_to").eq("school_id", schoolId).lte("effective_from", today),
    supabase.from("room_inventory_verifications").select("id,room_id,verified_on,verification_status,verified_item_count,notes,created_at").eq("school_id", schoolId).order("created_at", { ascending: false }),
    supabase.from("staff_school_assignments").select("staff_member_id,effective_from,effective_to").eq("school_id", schoolId),
    supabase.from("register_classes").select("id,home_room_id,class_code,display_name,register_teacher_staff_id").eq("school_id", schoolId).not("home_room_id", "is", null),
    supabase.rpc("resolve_school_room_custodians", { p_school_id: schoolId }),
  ]);
  const loadError =
    roomsResult.error ||
    itemsResult.error ||
    custodiansResult.error ||
    verificationsResult.error ||
    assignmentsResult.error ||
    homeRoomClassesResult.error ||
    resolutionResult.error;
  if (loadError) throw new Error(`Unable to load room inventory workspace: ${loadError.message}`);

  const rooms = (roomsResult.data ?? []) as Array<{ id: string; room_code: string; display_name: string; block_name: string | null; status: string }>;
  const items = (itemsResult.data ?? []) as Array<{ id: string; room_id: string; item_name: string; ownership: string; quantity: number; condition: string; asset_number: string | null; notes: string | null; status: string; version: number }>;
  const custodians = (custodiansResult.data ?? []) as Array<{ room_id: string; staff_member_id: string; effective_from: string; effective_to: string | null }>;
  const verifications = (verificationsResult.data ?? []) as Array<{ id: string; room_id: string; verified_on: string; verification_status: string; verified_item_count: number; notes: string | null; created_at: string }>;
  const assignments = (assignmentsResult.data ?? []) as Array<{ staff_member_id: string; effective_from: string; effective_to: string | null }>;
  const homeRoomClasses = (homeRoomClassesResult.data ?? []) as Array<{ id: string; home_room_id: string; class_code: string; display_name: string; register_teacher_staff_id: string | null }>;
  const resolutions = (resolutionResult.data ?? []) as CustodianResolution[];

  const currentCustodians = custodians.filter((c) => !c.effective_to || c.effective_to >= today);
  const assignableIds = [
    ...new Set([
      ...assignments.filter((a) => a.effective_from <= today && (!a.effective_to || a.effective_to >= today)).map((a) => a.staff_member_id),
      ...currentCustodians.map((c) => c.staff_member_id),
    ]),
  ];
  const teacherIds = homeRoomClasses.map((c) => c.register_teacher_staff_id).filter((id): id is string => Boolean(id));
  const staffIds = [...new Set([...assignableIds, ...teacherIds])];
  const staffResult = staffIds.length
    ? await supabase.from("staff_members").select("id,first_name,last_name,status").in("id", staffIds)
    : { data: [] as Array<{ id: string; first_name: string; last_name: string; status: string }>, error: null };
  if (staffResult.error) throw new Error(`Unable to load room inventory workspace: ${staffResult.error.message}`);
  const staffRows = staffResult.data ?? [];
  const staffNames = new Map(staffRows.map((s) => [s.id, `${s.first_name} ${s.last_name}`]));

  const latestVerification = new Map<string, (typeof verifications)[number]>();
  for (const v of verifications) if (!latestVerification.has(v.room_id)) latestVerification.set(v.room_id, v);
  const itemCounts = new Map<string, number>();
  for (const i of items) itemCounts.set(i.room_id, (itemCounts.get(i.room_id) ?? 0) + 1);
  const custodianByRoom = new Map(currentCustodians.map((c) => [c.room_id, c]));
  const resolutionByRoom = new Map(resolutions.map((r) => [r.room_id, r]));
  const classesByRoom = new Map<string, RoomHomeRoomClass[]>();
  for (const c of homeRoomClasses) {
    const list = classesByRoom.get(c.home_room_id) ?? [];
    list.push({
      id: c.id,
      code: c.class_code,
      name: c.display_name,
      teacherId: c.register_teacher_staff_id,
      teacherName: c.register_teacher_staff_id ? staffNames.get(c.register_teacher_staff_id) ?? null : null,
    });
    classesByRoom.set(c.home_room_id, list);
  }
  const assignableSet = new Set(assignableIds);

  return {
    rooms: rooms.map((r) => {
      const manual = custodianByRoom.get(r.id);
      const resolution = resolutionByRoom.get(r.id);
      const inheritedId = resolution?.inherited_staff_member_id ?? null;
      const effectiveId = resolution?.staff_member_id ?? manual?.staff_member_id ?? null;
      const source: RoomCustodianSource = resolution?.source ?? (manual ? "manual" : "none");
      const v = latestVerification.get(r.id);
      return {
        id: r.id,
        code: r.room_code,
        name: r.display_name,
        block: r.block_name,
        status: r.status,
        custodianId: effectiveId,
        custodianName: effectiveId ? staffNames.get(effectiveId) ?? "Assigned staff" : null,
        custodianSource: source,
        custodianReason: resolution?.reason ?? (manual ? "explicit_custodian_assignment" : "no_home_room_class"),
        inheritedCustodianId: inheritedId,
        inheritedCustodianName: inheritedId ? staffNames.get(inheritedId) ?? null : null,
        manualEffectiveFrom: resolution?.manual_effective_from ?? null,
        homeRoomClasses: classesByRoom.get(r.id) ?? [],
        lastVerified: v?.verified_on ?? null,
        itemCount: itemCounts.get(r.id) ?? 0,
      };
    }) as RoomInventoryRoom[],
    items: items.map((i) => ({ id: i.id, roomId: i.room_id, name: i.item_name, ownership: i.ownership, quantity: i.quantity, condition: i.condition, assetNumber: i.asset_number, notes: i.notes, status: i.status, version: i.version })) as RoomInventoryItem[],
    verifications: verifications.map((v) => ({ id: v.id, roomId: v.room_id, verifiedOn: v.verified_on, status: v.verification_status, itemCount: v.verified_item_count, notes: v.notes })) as RoomInventoryVerification[],
    staff: staffRows
      .filter((s) => s.status === "active" && assignableSet.has(s.id))
      .map((s) => ({ id: s.id, name: `${s.first_name} ${s.last_name}` })) as RoomInventoryStaff[],
  };
}

