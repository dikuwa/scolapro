"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type SchoolRoom = {
  id: string;
  code: string;
  name: string;
  block: string | null;
  capacity: number | null;
  status: "active" | "inactive";
};

export type RoomActionState = { success?: boolean; message?: string; fieldErrors?: Record<string, string[]> };

export async function listSchoolRooms(schoolId: string): Promise<SchoolRoom[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("school_rooms").select("id,room_code,display_name,block_name,capacity,status").eq("school_id", schoolId).order("display_name");
  if (error) throw new Error("Unable to load school rooms.");
  return (data ?? []).map((item) => ({ id: item.id, code: item.room_code, name: item.display_name, block: item.block_name, capacity: item.capacity, status: item.status as "active" | "inactive" }));
}

const roomSchema = z.object({
  schoolId: z.string().uuid(),
  roomId: z.string().uuid().optional().or(z.literal("")),
  code: z.string().trim().min(1, "Room code is required."),
  name: z.string().trim().min(1, "Room name is required."),
  block: z.string().trim().optional(),
  capacity: z.string().trim().optional(),
  status: z.enum(["active", "inactive"]),
});

export async function saveRoom(_state: RoomActionState, formData: FormData): Promise<RoomActionState> {
  const parsed = roomSchema.safeParse({
    schoolId: String(formData.get("schoolId") ?? ""),
    roomId: String(formData.get("roomId") ?? ""),
    code: String(formData.get("code") ?? ""),
    name: String(formData.get("name") ?? ""),
    block: String(formData.get("block") ?? ""),
    capacity: String(formData.get("capacity") ?? ""),
    status: String(formData.get("status") ?? "active"),
  });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };
  const capacity = parsed.data.capacity ? Number(parsed.data.capacity) : null;
  if (capacity !== null && (!Number.isInteger(capacity) || capacity <= 0)) return { fieldErrors: { capacity: ["Capacity must be a positive whole number."] } };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("upsert_school_room", {
    p_school_id: parsed.data.schoolId,
    p_room_id: parsed.data.roomId || null,
    p_room_code: parsed.data.code,
    p_display_name: parsed.data.name,
    p_block_name: parsed.data.block || null,
    p_capacity: capacity,
    p_status: parsed.data.status,
    p_notes: null,
  });
  if (error) return { message: error.message.includes("duplicate") ? "That room code is already in use." : error.message };
  revalidatePath("/school/setup");
  revalidatePath("/timetable");
  return { success: true, message: parsed.data.roomId ? "Room updated." : "Room added." };
}

export async function removeRoom(formData: FormData) {
  const roomId = String(formData.get("roomId") ?? "");
  if (!z.string().uuid().safeParse(roomId).success) return;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("delete_school_room", { p_room_id: roomId });
  revalidatePath("/school/setup");
  revalidatePath("/timetable");
  if (error) return { success: false, message: error.message };
  return { success: true, message: "Room deleted." };
}
