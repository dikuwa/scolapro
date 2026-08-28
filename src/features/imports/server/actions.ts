"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createHash } from "node:crypto";
import { parseCsv, normalizeSex } from "@/features/imports/server/learner-csv";
import { getUserContext } from "@/lib/auth/get-user-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function stageLearnerCsv(formData: FormData) {
  const file = formData.get("file");
  if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".csv") || file.size === 0 || file.size > 2_000_000) redirect("/school/imports?error=Choose+a+CSV+file+up+to+2MB");
  const context = await getUserContext();
  const membership = context.memberships[0];
  if (!context.user || !membership || membership.roleKey !== "school_admin") redirect("/school/imports?error=School+administrator+access+is+required");

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
  revalidatePath("/school/imports");
  redirect(`/school/imports?batch=${batchId}`);
}

export async function markLearnerImportReady(formData: FormData) {
  const batchId = String(formData.get("batchId") ?? "");
  const supabase = await createSupabaseServerClient();
  await supabase.rpc("mark_import_batch_ready", { p_batch_id: batchId });
  revalidatePath("/school/imports");
  redirect(`/school/imports?batch=${batchId}`);
}

export async function commitLearnerImport(formData: FormData) {
  const batchId = String(formData.get("batchId") ?? "");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("commit_learner_import_batch", { p_batch_id: batchId });
  revalidatePath("/school/imports"); revalidatePath("/learners");
  redirect(`/school/imports?batch=${batchId}${error ? "&error=Import+could+not+be+committed" : "&success=Import+completed"}`);
}
