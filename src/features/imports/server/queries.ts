import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function getImportWorkspace(schoolId: string, selectedBatchId?: string, includeArchived = false) {
  const supabase = await createSupabaseServerClient();
  let batchQuery = supabase
    .from("import_batches")
    .select("id,import_type,source_file_name,status,total_rows,valid_rows,warning_rows,error_rows,created_at,committed_at,archived_at")
    .eq("school_id", schoolId)
    .order("created_at", { ascending: false })
    .limit(includeArchived ? 30 : 15);

  if (!includeArchived) batchQuery = batchQuery.is("archived_at", null);
  const { data: batches } = await batchQuery;

  // A clean /school/imports URL is intentionally a clean workspace. Historical batches
  // remain available when history is explicitly opened, but the potentially large review
  // table opens only after the user explicitly selects a batch.
  const selectedId = selectedBatchId && (batches ?? []).some((batch) => batch.id === selectedBatchId)
    ? selectedBatchId
    : undefined;

  let rows: { id: string; row_number: number; source_data: Record<string,string>; normalized_data: Record<string,string>; resolution: string; matched_entity_type: string | null; matched_entity_id: string | null; issues: { level?: string; field?: string; message?: string }[] }[] = [];
  if (selectedId) {
    const { data } = await supabase
      .from("import_rows")
      .select("id,row_number,source_data,normalized_data,resolution,matched_entity_type,matched_entity_id,issues")
      .eq("batch_id", selectedId)
      .order("row_number")
      .limit(300);
    rows = (data ?? []) as typeof rows;
  }

  return {
    batches: batches ?? [],
    selectedBatch: (batches ?? []).find((batch) => batch.id === selectedId) ?? null,
    rows,
  };
}
