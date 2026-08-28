import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function getImportWorkspace(schoolId: string, selectedBatchId?: string) {
  const supabase = await createSupabaseServerClient();
  const { data: batches } = await supabase.from("import_batches").select("id,import_type,source_file_name,status,total_rows,valid_rows,warning_rows,error_rows,created_at,committed_at").eq("school_id", schoolId).order("created_at", { ascending: false }).limit(15);
  const selectedId = selectedBatchId && (batches ?? []).some((batch) => batch.id === selectedBatchId) ? selectedBatchId : batches?.[0]?.id;
  let rows: { id: string; row_number: number; source_data: Record<string,string>; normalized_data: Record<string,string>; resolution: string; matched_entity_type: string | null; matched_entity_id: string | null; issues: { level?: string; field?: string; message?: string }[] }[] = [];
  if (selectedId) {
    const { data } = await supabase.from("import_rows").select("id,row_number,source_data,normalized_data,resolution,matched_entity_type,matched_entity_id,issues").eq("batch_id", selectedId).order("row_number").limit(300);
    rows = (data ?? []) as typeof rows;
  }
  return { batches: batches ?? [], selectedBatch: (batches ?? []).find((batch) => batch.id === selectedId) ?? null, rows };
}