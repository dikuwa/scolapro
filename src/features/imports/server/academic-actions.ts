"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isSupportedImportFile, parseImportFile } from "@/features/imports/server/import-file";
import { getUserContext } from "@/lib/auth/get-user-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function stageAcademicStructureCsv(formData: FormData) {
  const file = formData.get("file");
  if (!isSupportedImportFile(file)) redirect("/school/imports?error=Choose+a+CSV+or+XLSX+file+up+to+2MB");

  const context = await getUserContext();
  const membership = context.memberships[0];
  if (!context.user || !membership || membership.roleKey !== "school_admin") redirect("/school/imports?error=School+administrator+access+is+required");

  const { rows: parsedRows, sourceBytes } = await parseImportFile(file);
  if (!parsedRows.length) redirect("/school/imports?error=No+academic+structure+rows+were+found");

  const currentYear = new Date().getFullYear();
  const allowedTypes = new Set(["grade", "class", "subject"]);
  const staged = parsedRows.map((row, index) => {
    const issues: { level: string; field: string; message: string }[] = [];
    const recordType = (row.record_type || row.type || "").trim().toLowerCase();
    const rawCode = recordType === "grade"
      ? row.code || row.grade_code
      : recordType === "class"
        ? row.code || row.class_code
        : recordType === "subject"
          ? row.code || row.subject_code
          : row.code;
    const code = (rawCode || "").trim().toUpperCase();
    const displayName = (row.display_name || row.name || "").trim();
    const rawYear = (row.academic_year || String(currentYear)).trim();
    const academicYear = Number(rawYear);
    const gradeCode = (row.grade_code || row.parent_grade_code || "").trim().toUpperCase();

    if (!allowedTypes.has(recordType)) issues.push({ level: "error", field: "record_type", message: "Record type must be grade, class or subject." });
    if (!code) issues.push({ level: "error", field: "code", message: "Code is required." });
    if (!displayName) issues.push({ level: "error", field: "display_name", message: "Display name is required." });
    if (!Number.isInteger(academicYear) || academicYear < 2000 || academicYear > 2200) issues.push({ level: "error", field: "academic_year", message: "Academic year must be between 2000 and 2200." });
    if (recordType === "class" && !gradeCode) issues.push({ level: "error", field: "grade_code", message: "Class rows require grade_code." });

    return {
      row_number: index + 2,
      source: row,
      normalized: {
        record_type: recordType,
        code,
        display_name: displayName,
        academic_year: Number.isInteger(academicYear) ? academicYear : 0,
        grade_code: gradeCode,
      },
      resolution: issues.length ? "error" : "review",
      issues,
    };
  });

  const supabase = await createSupabaseServerClient();
  const digest = createHash("sha256").update(sourceBytes).digest("hex");
  const { data: batchId, error: batchError } = await supabase.rpc("create_import_batch", {
    p_school_id: membership.schoolId,
    p_import_type: "academic_structure",
    p_source_file_name: file.name,
    p_source_file_sha256: digest,
  });
  if (batchError || !batchId) redirect("/school/imports?error=Academic+structure+import+batch+could+not+be+created");

  const { error: rowsError } = await supabase.rpc("stage_import_rows", { p_batch_id: batchId, p_rows: staged });
  if (rowsError) redirect(`/school/imports?batch=${batchId}&error=Academic+structure+rows+could+not+be+staged`);
  const { error: reconcileError } = await supabase.rpc("reconcile_academic_structure_import_batch", { p_batch_id: batchId });
  if (reconcileError) redirect(`/school/imports?batch=${batchId}&error=Academic+structure+rows+were+staged+but+reconciliation+could+not+finish`);

  revalidatePath("/school/imports");
  redirect(`/school/imports?batch=${batchId}`);
}

export async function commitAcademicStructureImport(formData: FormData) {
  const batchId = String(formData.get("batchId") ?? "");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("commit_academic_structure_import_batch", { p_batch_id: batchId });
  revalidatePath("/school/imports");
  revalidatePath("/academic-setup");
  revalidatePath("/timetable");
  redirect(`/school/imports?batch=${batchId}${error ? "&error=Academic+structure+import+could+not+be+committed" : "&success=Academic+structure+import+completed"}`);
}
