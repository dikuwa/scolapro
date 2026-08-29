"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { parseCsv } from "@/features/imports/server/learner-csv";
import { getUserContext } from "@/lib/auth/get-user-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function validCsvFile(value: FormDataEntryValue | null): value is File {
  return value instanceof File && value.name.toLowerCase().endsWith(".csv") && value.size > 0 && value.size <= 2_000_000;
}

function boolValue(value: string | undefined): boolean {
  return ["1", "true", "yes", "y"].includes((value ?? "").trim().toLowerCase());
}

export async function stageGuardianCsv(formData: FormData) {
  const file = formData.get("file");
  if (!validCsvFile(file)) redirect("/school/imports?error=Choose+a+CSV+file+up+to+2MB");

  const context = await getUserContext();
  const membership = context.memberships[0];
  if (!context.user || !membership || membership.roleKey !== "school_admin") redirect("/school/imports?error=School+administrator+access+is+required");

  const text = await file.text();
  const parsedRows = parseCsv(text);
  if (!parsedRows.length) redirect("/school/imports?error=No+guardian+rows+were+found");

  const staged = parsedRows.map((row, index) => {
    const issues: { level: string; field: string; message: string }[] = [];
    const learnerAdmissionNumber = (row.learner_admission_number || row.admission_number || row.learner_number || "").trim().toUpperCase();
    const identityNumber = (row.identity_number || row.guardian_id_number || row.id_number || "").trim();
    const firstNames = (row.first_names || row.first_name || "").trim();
    const surname = (row.surname || row.last_name || "").trim();
    const relationshipType = (row.relationship_type || row.relationship || "guardian").trim().toLowerCase();
    const priority = Number((row.priority || "1").trim());

    if (!learnerAdmissionNumber) issues.push({ level: "error", field: "learner_admission_number", message: "Learner admission number is required." });
    if (!identityNumber) issues.push({ level: "error", field: "identity_number", message: "Guardian identity number is required for deterministic bulk matching." });
    if (!firstNames) issues.push({ level: "error", field: "first_names", message: "Guardian first names are required." });
    if (!surname) issues.push({ level: "error", field: "surname", message: "Guardian surname is required." });
    if (!relationshipType) issues.push({ level: "error", field: "relationship_type", message: "Relationship type is required." });
    if (!Number.isInteger(priority) || priority < 1 || priority > 20) issues.push({ level: "error", field: "priority", message: "Priority must be between 1 and 20." });

    return {
      row_number: index + 2,
      source: row,
      normalized: {
        learner_admission_number: learnerAdmissionNumber,
        identity_number: identityNumber,
        first_names: firstNames,
        surname,
        preferred_name: (row.preferred_name || "").trim(),
        relationship_type: relationshipType,
        email: (row.email || "").trim().toLowerCase(),
        mobile: (row.mobile || row.phone || "").trim(),
        whatsapp: (row.whatsapp || "").trim(),
        is_legal_guardian: boolValue(row.is_legal_guardian),
        is_emergency_contact: boolValue(row.is_emergency_contact),
        is_pickup_authorized: boolValue(row.is_pickup_authorized),
        priority: Number.isInteger(priority) ? priority : 1,
      },
      resolution: issues.length ? "error" : "review",
      issues,
    };
  });

  const supabase = await createSupabaseServerClient();
  const digest = createHash("sha256").update(text).digest("hex");
  const { data: batchId, error: batchError } = await supabase.rpc("create_import_batch", {
    p_school_id: membership.schoolId,
    p_import_type: "guardians",
    p_source_file_name: file.name,
    p_source_file_sha256: digest,
  });
  if (batchError || !batchId) redirect("/school/imports?error=Guardian+import+batch+could+not+be+created");

  const { error: rowsError } = await supabase.rpc("stage_import_rows", { p_batch_id: batchId, p_rows: staged });
  if (rowsError) redirect(`/school/imports?batch=${batchId}&error=Guardian+rows+could+not+be+staged`);
  const { error: reconcileError } = await supabase.rpc("reconcile_guardian_import_batch", { p_batch_id: batchId });
  if (reconcileError) redirect(`/school/imports?batch=${batchId}&error=Guardian+rows+were+staged+but+reconciliation+could+not+finish`);

  revalidatePath("/school/imports");
  redirect(`/school/imports?batch=${batchId}`);
}

export async function commitGuardianImport(formData: FormData) {
  const batchId = String(formData.get("batchId") ?? "");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("commit_guardian_import_batch", { p_batch_id: batchId });
  revalidatePath("/school/imports");
  revalidatePath("/learners");
  revalidatePath("/parent");
  redirect(`/school/imports?batch=${batchId}${error ? "&error=Guardian+import+could+not+be+committed" : "&success=Guardian+import+completed"}`);
}
