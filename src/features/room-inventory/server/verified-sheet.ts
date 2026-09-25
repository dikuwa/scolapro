import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type VerifiedRoomInventoryItem = {
  id: string;
  itemName: string;
  assetNumber: string | null;
  ownership: string;
  quantity: number;
  condition: string;
  notes: string | null;
  status: string;
  version: number;
};

export type VerifiedRoomInventorySheet = {
  verificationId: string;
  roomId: string;
  roomDisplayName: string;
  blockName: string | null;
  linkedClasses: Array<{ id: string; displayName: string }>;
  custodian: {
    source: "manual" | "inherited" | "ambiguous" | "none";
    staffMemberId: string | null;
    staffName: string | null;
  };
  verifiedOn: string;
  verificationStatus: "confirmed" | "exceptions_noted";
  verifiedItemCount: number;
  inventory: VerifiedRoomInventoryItem[];
  verificationNotes: string | null;
  finalizedAt: string;
  revision: number;
  scolaproReference: string;
  verificationToken: string;
  verificationPath: string;
};

type RpcRow = {
  verification_id: string;
  room_id: string;
  room_display_name: string;
  block_name: string | null;
  linked_classes: Array<{ id: string; display_name: string }> | null;
  custodian: {
    source?: "manual" | "inherited" | "ambiguous" | "none";
    staff_member_id?: string | null;
    staff_name?: string | null;
  } | null;
  verified_on: string;
  verification_status: "confirmed" | "exceptions_noted";
  verified_item_count: number;
  inventory: Array<{
    id: string;
    item_name: string;
    asset_number: string | null;
    ownership: string;
    quantity: number;
    condition: string;
    notes?: string | null;
    status: string;
    version: number;
  }> | null;
  verification_notes: string | null;
  finalized_at: string;
  revision: number;
  scolapro_reference: string;
  verification_token: string;
  verification_path: string;
};

export async function getVerifiedRoomInventorySheet(
  roomId: string,
): Promise<VerifiedRoomInventorySheet | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_verified_room_inventory_sheet", {
    p_room_id: roomId,
  });
  if (error) throw new Error(`Unable to load verified room inventory sheet: ${error.message}`);
  if (!data) return null;

  const row = data as RpcRow;
  return {
    verificationId: row.verification_id,
    roomId: row.room_id,
    roomDisplayName: row.room_display_name,
    blockName: row.block_name,
    linkedClasses: (row.linked_classes ?? []).map((item) => ({
      id: item.id,
      displayName: item.display_name,
    })),
    custodian: {
      source: row.custodian?.source ?? "none",
      staffMemberId: row.custodian?.staff_member_id ?? null,
      staffName: row.custodian?.staff_name ?? null,
    },
    verifiedOn: row.verified_on,
    verificationStatus: row.verification_status,
    verifiedItemCount: row.verified_item_count,
    inventory: (row.inventory ?? []).map((item) => ({
      id: item.id,
      itemName: item.item_name,
      assetNumber: item.asset_number,
      ownership: item.ownership,
      quantity: item.quantity,
      condition: item.condition,
      notes: item.notes ?? null,
      status: item.status,
      version: item.version,
    })),
    verificationNotes: row.verification_notes,
    finalizedAt: row.finalized_at,
    revision: row.revision,
    scolaproReference: row.scolapro_reference,
    verificationToken: row.verification_token,
    verificationPath: row.verification_path,
  };
}
