import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getNamibiaDateKey } from "@/lib/namibia-date";

export type RoomInventoryRoom = { id:string; code:string; name:string; block:string|null; status:string; custodianId:string|null; custodianName:string|null; lastVerified:string|null; itemCount:number };
export type RoomInventoryItem = { id:string; roomId:string; name:string; ownership:string; quantity:number; condition:string; assetNumber:string|null; notes:string|null; status:string; version:number };
export type RoomInventoryVerification = { id:string; roomId:string; verifiedOn:string; status:string; itemCount:number; notes:string|null };
export type RoomInventoryStaff = { id:string; name:string };

export async function getRoomInventoryWorkspace(schoolId:string) {
  const supabase = await createSupabaseServerClient();
  const today = getNamibiaDateKey();
  const [roomsResult,itemsResult,custodiansResult,verificationsResult,assignmentsResult] = await Promise.all([
    supabase.from("school_rooms").select("id,room_code,display_name,block_name,status").eq("school_id",schoolId).order("block_name").order("display_name"),
    supabase.from("room_inventory_items").select("id,room_id,item_name,ownership,quantity,condition,asset_number,notes,status,version").eq("school_id",schoolId).order("item_name"),
    supabase.from("room_inventory_custodians").select("room_id,staff_member_id,effective_from,effective_to").eq("school_id",schoolId).lte("effective_from",today),
    supabase.from("room_inventory_verifications").select("id,room_id,verified_on,verification_status,verified_item_count,notes,created_at").eq("school_id",schoolId).order("created_at",{ascending:false}),
    supabase.from("staff_school_assignments").select("staff_member_id,effective_from,effective_to").eq("school_id",schoolId),
  ]);
  const loadError = roomsResult.error || itemsResult.error || custodiansResult.error || verificationsResult.error || assignmentsResult.error;
  if (loadError) throw new Error(`Unable to load room inventory workspace: ${loadError.message}`);

  const rooms = roomsResult.data ?? [];
  const items = itemsResult.data ?? [];
  const custodians = custodiansResult.data ?? [];
  const verifications = verificationsResult.data ?? [];
  const assignments = assignmentsResult.data ?? [];
  const currentCustodians=custodians.filter((c)=>!c.effective_to||c.effective_to>=today);
  const staffIds=[...new Set([...assignments.filter((a)=>a.effective_from<=today&&(!a.effective_to||a.effective_to>=today)).map((a)=>a.staff_member_id),...currentCustodians.map((c)=>c.staff_member_id)])];
  const staffResult=staffIds.length
    ? await supabase.from("staff_members").select("id,first_name,last_name,status").in("id",staffIds).eq("status","active")
    : {data:[] as Array<{id:string;first_name:string;last_name:string;status:string}>,error:null};
  if (staffResult.error) throw new Error(`Unable to load room inventory workspace: ${staffResult.error.message}`);
  const staffRows = staffResult.data ?? [];
  const staffNames=new Map(staffRows.map((s)=>[s.id,`${s.first_name} ${s.last_name}`]));
  const latestVerification=new Map<string,(typeof verifications)[number]>();
  for(const v of verifications) if(!latestVerification.has(v.room_id)) latestVerification.set(v.room_id,v);
  const itemCounts=new Map<string,number>(); for(const i of items) itemCounts.set(i.room_id,(itemCounts.get(i.room_id)??0)+1);
  const custodianByRoom=new Map(currentCustodians.map((c)=>[c.room_id,c]));
  return {
    rooms:rooms.map((r)=>{const c=custodianByRoom.get(r.id); const v=latestVerification.get(r.id); return {id:r.id,code:r.room_code,name:r.display_name,block:r.block_name,status:r.status,custodianId:c?.staff_member_id??null,custodianName:c?staffNames.get(c.staff_member_id)??"Assigned staff":null,lastVerified:v?.verified_on??null,itemCount:itemCounts.get(r.id)??0};}) as RoomInventoryRoom[],
    items:items.map((i)=>({id:i.id,roomId:i.room_id,name:i.item_name,ownership:i.ownership,quantity:i.quantity,condition:i.condition,assetNumber:i.asset_number,notes:i.notes,status:i.status,version:i.version})) as RoomInventoryItem[],
    verifications:verifications.map((v)=>({id:v.id,roomId:v.room_id,verifiedOn:v.verified_on,status:v.verification_status,itemCount:v.verified_item_count,notes:v.notes})) as RoomInventoryVerification[],
    staff:staffRows.map((s)=>({id:s.id,name:`${s.first_name} ${s.last_name}`})) as RoomInventoryStaff[],
  };
}
