"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createHash } from "node:crypto";
import { parseCsv, normalizeSex } from "@/features/imports/server/learner-csv";
import { getUserContext } from "@/lib/auth/get-user-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

async function requireSchoolAdmin() {
  const context = await getUserContext();
  const membership = context.memberships[0];
  if (!context.user || !membership || membership.roleKey !== "school_admin") redirect("/school/imports?error=School+administrator+access+is+required");
  return membership;
}

function validCsvFile(value: FormDataEntryValue | null): value is File {
  return value instanceof File && value.name.toLowerCase().endsWith(".csv") && value.size > 0 && value.size <= 2_000_000;
}

export async function stageLearnerCsv(formData: FormData) {
  const file = formData.get("file");
  if (!validCsvFile(file)) redirect("/school/imports?error=Choose+a+CSV+file+up+to+2MB");
  const membership = await requireSchoolAdmin();

  const text = await file.text();
  const parsedRows = parseCsv(text);
  if (!parsedRows.length) redirect("/school/imports?error=No+learner+rows+were+found");
  const supabase = await createSupabaseServerClient();
  const year = new Date().getFullYear();
  const [{ data: grades }, { data: classes }] = await Promise.all([
    supabase.from("grades").select("id,grade_code,display_name").eq("school_id", membership.schoolId).eq("academic_year", year),
    supabase.from("register_classes").select("id,class_code,display_name,grade_id").eq("school_id", membership.schoolId).eq("academic_year", year),
  ]);
  const gradeMap = new Map((grades ?? []).flatMap((grade) => [[grade.grade_code.toUpperCase(), grade], [grade.display_name.toUpperCase(), grade]]));
  const classMap = new Map((classes ?? []).flatMap((item) => [[item.class_code.toUpperCase(), item], [item.display_name.toUpperCase(), item]]));
  const staged = parsedRows.map((row, index) => {
    const issues: { level: string; field: string; message: string }[] = [];
    const grade = gradeMap.get((row.grade_code || row.grade || "").toUpperCase());
    const registerClass = classMap.get((row.class_code || row.register_class || row.class || "").toUpperCase());
    if (!row.first_names && !row.first_name) issues.push({ level: "error", field: "first_names", message: "First names are required." });
    if (!row.surname && !row.last_name) issues.push({ level: "error", field: "surname", message: "Surname is required." });
    if (!grade) issues.push({ level: "error", field: "grade_code", message: "Grade does not match the current school setup." });
    if (!registerClass) issues.push({ level: "error", field: "class_code", message: "Register class does not match the current school setup." });
    if (grade && registerClass && registerClass.grade_id !== grade.id) issues.push({ level: "error", field: "class_code", message: "Register class does not belong to the selected grade." });
    const normalized = {
      first_names: row.first_names || row.first_name || "",
      surname: row.surname || row.last_name || "",
      preferred_name: row.preferred_name || "",
      date_of_birth: row.date_of_birth || row.dob || "",
      sex: normalizeSex(row.sex || row.gender || ""),
      national_id: row.national_id || row.id_number || "",
      birth_certificate_number: row.birth_certificate_number || row.birth_certificate || "",
      academic_year: Number(row.academic_year || year),
      grade_id: grade?.id ?? "",
      register_class_id: registerClass?.id ?? "",
      admission_number: (row.admission_number || "").toUpperCase(),
      enrolled_from: row.enrolled_from || new Date().toISOString().slice(0, 10),
    };
    return { row_number: index + 2, source: row, normalized, resolution: issues.some((issue) => issue.level === "error") ? "error" : "create", issues };
  });

  const digest = createHash("sha256").update(text).digest("hex");
  const { data: batchId, error: batchError } = await supabase.rpc("create_import_batch", { p_school_id: membership.schoolId, p_import_type: "learners", p_source_file_name: file.name, p_source_file_sha256: digest });
  if (batchError || !batchId) redirect("/school/imports?error=Import+batch+could+not+be+created");
  const { error: rowsError } = await supabase.rpc("stage_import_rows", { p_batch_id: batchId, p_rows: staged });
  if (rowsError) redirect("/school/imports?error=CSV+rows+could+not+be+staged");
  const { error: reconcileError } = await supabase.rpc("reconcile_learner_import_batch", { p_batch_id: batchId });
  if (reconcileError) redirect(`/school/imports?batch=${batchId}&error=Rows+were+staged+but+reconciliation+could+not+finish`);
  revalidatePath("/school/imports");
  redirect(`/school/imports?batch=${batchId}`);
}

export async function stageStaffCsv(formData: FormData) {
  const file = formData.get("file");
  if (!validCsvFile(file)) redirect("/school/imports?error=Choose+a+CSV+file+up+to+2MB");
  const membership = await requireSchoolAdmin();
  const text = await file.text();
  const parsedRows = parseCsv(text);
  if (!parsedRows.length) redirect("/school/imports?error=No+staff+rows+were+found");

  const today = new Date().toISOString().slice(0, 10);
  const allowedAssignmentTypes = new Set(["staff", "teacher", "management", "support", "temporary", "other"]);
  const staged = parsedRows.map((row, index) => {
    const issues: { level: string; field: string; message: string }[] = [];
    const employeeNumber = (row.employee_number || row.employee_no || row.staff_number || "").trim().toUpperCase();
    const firstName = (row.first_name || row.first_names || "").trim();
    const lastName = (row.last_name || row.surname || "").trim();
    const assignmentType = (row.assignment_type || row.staff_type || "staff").trim().toLowerCase();
    if (!employeeNumber) issues.push({ level: "error", field: "employee_number", message: "Employee number is required for deterministic staff identity." });
    if (!firstName) issues.push({ level: "error", field: "first_name", message: "First name is required." });
    if (!lastName) issues.push({ level: "error", field: "last_name", message: "Last name is required." });
    if (!allowedAssignmentTypes.has(assignmentType)) issues.push({ level: "error", field: "assignment_type", message: "Assignment type must be staff, teacher, management, support, temporary or other." });
    const normalized = {
      employee_number: employeeNumber,
      first_name: firstName,
      last_name: lastName,
      assignment_type: assignmentType,
      position_title: (row.position_title || row.position || row.job_title || "").trim(),
      effective_from: (row.effective_from || row.start_date || today).trim(),
    };
    return { row_number: index + 2, source: row, normalized, resolution: issues.some((issue) => issue.level === "error") ? "error" : "create", issues };
  });

  const supabase = await createSupabaseServerClient();
  const digest = createHash("sha256").update(text).digest("hex");
  const { data: batchId, error: batchError } = await supabase.rpc("create_import_batch", { p_school_id: membership.schoolId, p_import_type: "staff", p_source_file_name: file.name, p_source_file_sha256: digest });
  if (batchError || !batchId) redirect("/school/imports?error=Staff+import+batch+could+not+be+created");
  const { error: rowsError } = await supabase.rpc("stage_import_rows", { p_batch_id: batchId, p_rows: staged });
  if (rowsError) redirect(`/school/imports?batch=${batchId}&error=Staff+CSV+rows+could+not+be+staged`);
  const { error: reconcileError } = await supabase.rpc("reconcile_staff_import_batch", { p_batch_id: batchId });
  if (reconcileError) redirect(`/school/imports?batch=${batchId}&error=Staff+rows+were+staged+but+reconciliation+could+not+finish`);
  revalidatePath("/school/imports");
  redirect(`/school/imports?batch=${batchId}`);
}

export async function skipMatchedImportRow(formData: FormData) {
  const rowId = String(formData.get("rowId") ?? "");
  const batchId = String(formData.get("batchId") ?? "");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("resolve_import_row", {
    p_import_row_id: rowId,
    p_resolution: "skip",
    p_matched_entity_type: null,
    p_matched_entity_id: null,
    p_normalized_data: null,
  });
  revalidatePath("/school/imports");
  redirect(`/school/imports?batch=${batchId}${error ? "&error=Row+could+not+be+resolved" : ""}`);
}

export async function markLearnerImportReady(formData: FormData) {
  const batchId = String(formData.get("batchId") ?? "");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("mark_import_batch_ready", { p_batch_id: batchId });
  revalidatePath("/school/imports");
  redirect(`/school/imports?batch=${batchId}${error ? "&error=Batch+could+not+be+marked+ready" : ""}`);
}

export async function commitLearnerImport(formData: FormData) {
  const batchId = String(formData.get("batchId") ?? "");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("commit_learner_import_batch", { p_batch_id: batchId });
  revalidatePath("/school/imports"); revalidatePath("/learners");
  redirect(`/school/imports?batch=${batchId}${error ? "&error=Import+could+not+be+committed" : "&success=Import+completed"}`);
}

export async function commitStaffImport(formData: FormData) {
  const batchId = String(formData.get("batchId") ?? "");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("commit_staff_import_batch", { p_batch_id: batchId });
  revalidatePath("/school/imports"); revalidatePath("/staff"); revalidatePath("/timetable");
  redirect(`/school/imports?batch=${batchId}${error ? "&error=Staff+import+could+not+be+committed" : "&success=Staff+import+completed"}`);
}
