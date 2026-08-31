import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function getImportWorkspace(
  schoolId: string,
  selectedBatchId?: string,
  includeArchived = false,
  requestedRowPage = 1,
  rowPageSize = 50,
) {
  const supabase = await createSupabaseServerClient();
  let batchQuery = supabase
    .from("import_batches")
    .select("id,import_type,source_file_name,status,total_rows,valid_rows,warning_rows,error_rows,created_at,committed_at,archived_at")
    .eq("school_id", schoolId)
    .order("created_at", { ascending: false })
    .limit(includeArchived ? 30 : 15);

  if (!includeArchived) batchQuery = batchQuery.is("archived_at", null);
  const { data: batches, error: batchError } = await batchQuery;
  if (batchError) throw new Error("Unable to load import batches.");

  // A clean /school/imports URL is intentionally a clean workspace. Historical batches
  // remain available when history is explicitly opened, but the review table opens only
  // after the user explicitly selects a batch.
  const selectedId = selectedBatchId && (batches ?? []).some((batch) => batch.id === selectedBatchId)
    ? selectedBatchId
    : undefined;

  const safePageSize = Math.min(100, Math.max(10, Math.trunc(rowPageSize) || 50));
  let safePage = Math.max(1, Math.trunc(requestedRowPage) || 1);
  let rows: { id: string; row_number: number; source_data: Record<string,string>; normalized_data: Record<string,string>; resolution: string; matched_entity_type: string | null; matched_entity_id: string | null; issues: { level?: string; field?: string; message?: string }[] }[] = [];
  let rowCount = 0;
  let unresolvedRowCount = 0;

  if (selectedId) {
    const from = (safePage - 1) * safePageSize;
    const to = from + safePageSize - 1;
    const [pageResult, unresolvedResult] = await Promise.all([
      supabase
        .from("import_rows")
        .select("id,row_number,source_data,normalized_data,resolution,matched_entity_type,matched_entity_id,issues", { count: "exact" })
        .eq("batch_id", selectedId)
        .order("row_number")
        .range(from, to),
      supabase
        .from("import_rows")
        .select("id", { count: "exact", head: true })
        .eq("batch_id", selectedId)
        .in("resolution", ["review", "error"]),
    ]);
    if (pageResult.error || unresolvedResult.error) throw new Error("Unable to load import review rows.");

    rowCount = pageResult.count ?? 0;
    unresolvedRowCount = unresolvedResult.count ?? 0;
    const pageCount = Math.max(1, Math.ceil(rowCount / safePageSize));

    // A stale/manual page number should never make a non-empty batch look empty.
    if (rowCount > 0 && safePage > pageCount) {
      safePage = pageCount;
      const lastFrom = (safePage - 1) * safePageSize;
      const { data, error } = await supabase
        .from("import_rows")
        .select("id,row_number,source_data,normalized_data,resolution,matched_entity_type,matched_entity_id,issues")
        .eq("batch_id", selectedId)
        .order("row_number")
        .range(lastFrom, lastFrom + safePageSize - 1);
      if (error) throw new Error("Unable to load import review rows.");
      rows = (data ?? []) as typeof rows;
    } else {
      rows = (pageResult.data ?? []) as typeof rows;
    }
  }

  return {
    batches: batches ?? [],
    selectedBatch: (batches ?? []).find((batch) => batch.id === selectedId) ?? null,
    rows,
    rowCount,
    unresolvedRowCount,
    rowPage: safePage,
    rowPageSize: safePageSize,
  };
}