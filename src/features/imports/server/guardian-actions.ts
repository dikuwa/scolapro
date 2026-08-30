"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { fileSha256, tabularFileToRows, validTabularFile } from "@/features/imports/server/tabular-file";
import { getUserContext } from "@/lib/auth/get-user-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function boolValue(value: string | undefined): boolean {
  return ["1", "true", "yes", "y"].includes((value ?? "").trim().toLowerCase());
}

function normalizeInitials(value: string | undefined): string {
  return (value ?? "").replace(/[^A-Za-z]/g, "").toUpperCase().slice(0, 12);
}

export async function stageGuardianCsv(formData: FormData) {
  const file = formData.get("file");
  if (!validTabularFile(file)) redirect("/school/imports?error=Choose+a+CSV+or+Excel+file+up+to+5MB");

  const context = await getUserContext();
  const membership = context.memberships[0];
  if (!context.user || !membership || membership.roleKey !== "school_admin") redirect("/school/imports?error=School+administrator+access+is+required");

  const parsedRows = await tabularFileToRows(file);
  if (!parsedRows.length) redirect("/school/imports?error=No+guardian+rows+were+found.+Use+the+guardian+template+or+check+the+header+row");

  const staged = parsedRows.map((row, index) => {
    const issues: { level: string; field: string; message: string }[] = [];
    const learnerAdmissionNumber = (row.learner_admission_number || row.admission_number || row.learner_number || "").trim().toUpperCase();
    const identityNumber = (row.identity_number || row.guardian_id_number || row.id_number || "").trim();
    const firstNames = (row.guardian_first_names || row.first_names || row.first_name || "").trim();
    const initials = normalizeInitials(row.initials || row.initial || row.name_initials);
    const surname = (row.guardian_surname || row.surname || row.last_name || "").trim();
    const relationshipType = (row.relationship_type || row.relationship || "parent").trim().toLowerCase();
    const priority = Number((row.guardian_priority || row.priority || "1").trim());
    const email = (row.email || "").trim().toLowerCase();
    const mobile = (row.mobile || row.cell_number || row.phone || "").trim();
    const whatsapp = (row.whatsapp || "").trim();
    const homePhone = (row.home_telephone || row.home_phone || "").trim();
    const workPhone = (row.work_telephone || row.work_phone || "").trim();
    const physicalAddress = (row.residential_address || row.physical_address || "").trim();
    const postalAddress = (row.postal_address || "").trim();
    const workAddress = (row.work_address || "").trim();
    const hasMatchingEvidence = Boolean(identityNumber || email || mobile || whatsapp || homePhone || workPhone);

    if (!learnerAdmissionNumber) issues.push({ level: "error", field: "learner_admission_number", message: "Learner admission number is required." });
    if (!firstNames) issues.push({ level: "error", field: "first_names", message: "Guardian first names are required." });
    if (!surname) issues.push({ level: "error", field: "surname", message: "Guardian surname is required." });
    if (!relationshipType) issues.push({ level: "error", field: "relationship_type", message: "Relationship type is required." });
    if (!Number.isInteger(priority) || priority < 1 || priority > 20) issues.push({ level: "error", field: "priority", message: "Priority must be between 1 and 20." });
    if (!hasMatchingEvidence) issues.push({ level: "warning", field: "contact", message: "No identity number or contact evidence was supplied. Reconciliation may still reuse an exact guardian already linked to this learner; otherwise the row will be blocked." });
    if (!identityNumber && hasMatchingEvidence) issues.push({ level: "warning", field: "identity_number", message: "No identity number supplied. Reconciliation first checks the learner's existing exact-name guardian links, then contact evidence; ambiguous matches require review." });

    return {
      row_number: index + 2,
      source: row,
      normalized: {
        learner_admission_number: learnerAdmissionNumber,
        identity_number: identityNumber,
        first_names: firstNames,
        initials,
        surname,
        preferred_name: (row.preferred_name || "").trim(),
        relationship_type: relationshipType,
        email,
        mobile,
        whatsapp,
        home_phone: homePhone,
        work_phone: workPhone,
        physical_address: physicalAddress,
        postal_address: postalAddress,
        work_address: workAddress,
        is_legal_guardian: boolValue(row.is_legal_guardian || row.legal_guardian),
        is_emergency_contact: boolValue(row.is_emergency_contact || row.emergency_contact),
        is_pickup_authorized: boolValue(row.is_pickup_authorized || row.pickup_authorised || row.pickup_authorized),
        priority: Number.isInteger(priority) ? priority : 1,
      },
      resolution: issues.some((issue) => issue.level === "error") ? "error" : "review",
      issues,
    };
  });

  const supabase = await createSupabaseServerClient();
  const digest = await fileSha256(file);
  const { data: batchId, error: batchError } = await supabase.rpc("create_import_batch", {
    p_school_id: membership.schoolId,
    p_import_type: "guardians",
    p_source_file_name: file.name,
    p_source_file_sha256: digest,
  });
  if (batchError || !batchId) redirect("/school/imports?error=Guardian+import+batch+could+not+be+created");

  const { error: rowsError } = await supabase.rpc("stage_import_rows", { p_batch_id: batchId, p_rows: staged });
  if (rowsError) redirect("/school/imports?error=Guardian+rows+could+not+be+staged.+Start+over+or+check+the+template");
  const { error: reconcileError } = await supabase.rpc("reconcile_guardian_import_batch", { p_batch_id: batchId });
  if (reconcileError) redirect(`/school/imports?batch=${batchId}&error=Guardian+rows+were+staged+but+reconciliation+could+not+finish`);

  revalidatePath("/school/imports");
  redirect(`/school/imports?batch=${batchId}`);
}

export async function confirmMatchedGuardianImportRow(formData: FormData) {
  const rowId = String(formData.get("rowId") ?? "");
  const batchId = String(formData.get("batchId") ?? "");
  const guardianId = String(formData.get("guardianId") ?? "");
  const context = await getUserContext();
  const membership = context.memberships[0];
  if (!context.user || !membership || membership.roleKey !== "school_admin") redirect(`/school/imports?batch=${batchId}&error=School+administrator+access+is+required`);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("resolve_import_row", {
    p_import_row_id: rowId,
    p_resolution: "link",
    p_matched_entity_type: "guardian",
    p_matched_entity_id: guardianId,
    p_normalized_data: null,
  });
  revalidatePath("/school/imports");
  redirect(`/school/imports?batch=${batchId}${error ? "&error=Guardian+match+could+not+be+confirmed" : "&success=Existing+guardian+confirmed"}`);
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
