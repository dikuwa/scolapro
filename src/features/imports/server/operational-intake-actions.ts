"use server";

import { createHash, randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getUserContext } from "@/lib/auth/get-user-context";
import { getNamibiaCalendarYear } from "@/lib/namibia-date";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { tabularFileToRows, validTabularFile } from "@/features/imports/server/tabular-file";

const leadershipRoles = new Set(["school_admin", "principal", "deputy_principal"]);
const sourceMimeTypes = new Set(["application/pdf","image/jpeg","image/png","image/webp"]);

async function requireOperationalManager(adapter: "calendar" | "timetable") {
  const context = await getUserContext();
  if (!context.user) redirect("/login");
  const membership = context.memberships.find((item) =>
    adapter === "calendar" ? leadershipRoles.has(item.roleKey) : item.roleKey === "school_admin",
  );
  if (!membership) redirect("/");
  return membership;
}

function cleanFileName(value: string) {
  return value.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/-+/g, "-").slice(0, 120) || "source";
}

function normalizedCalendarRow(row: Record<string,string>) {
  return {
    source_class: (row.source_class || row.source_scope || "school").trim().toLowerCase(),
    title: (row.title || row.event || row.event_title || "").trim(),
    category: (row.category || row.event_type || "event").trim(),
    starts_on: (row.starts_on || row.start_date || row.date || "").trim(),
    ends_on: (row.ends_on || row.end_date || row.starts_on || row.start_date || row.date || "").trim(),
    starts_at: (row.starts_at || row.start_time || "").trim(),
    ends_at: (row.ends_at || row.end_time || "").trim(),
    audience_scope: (row.audience_scope || "all_learners").trim(),
    audience_reference_id: (row.audience_reference_id || "").trim(),
    description: (row.description || row.notes || "").trim(),
    teaching_impact: (row.teaching_impact || "NORMAL").trim().toUpperCase(),
    bell_schedule_id: (row.bell_schedule_id || "").trim(),
  };
}

function normalizedTimetableRow(row: Record<string,string>) {
  return {
    teacher_employee_number: (row.teacher_employee_number || row.employee_number || row.teacher_code || row.teacher || "").trim().toUpperCase(),
    subject_code: (row.subject_code || row.subject || "").trim().toUpperCase(),
    class_code: (row.class_code || row.register_class || row.class || "").trim().toUpperCase(),
    group_code: (row.group_code || row.group || "").trim(),
    weekday: (row.weekday || row.day || "").trim(),
    period_number: (row.period_number || row.period || "").trim(),
    room_label: (row.room_label || row.room || "").trim(),
    cycle_code: (row.cycle_code || row.plan || row.week || "A").trim().toUpperCase(),
  };
}

async function stageStructured(adapter: "calendar" | "timetable", formData: FormData) {
  const membership = await requireOperationalManager(adapter);
  const file = formData.get("file");
  if (!validTabularFile(file)) redirect(`/school/imports/operations?adapter=${adapter}&error=Choose+a+CSV+or+Excel+file+up+to+5MB`);
  const rows = await tabularFileToRows(file);
  if (!rows.length) redirect(`/school/imports/operations?adapter=${adapter}&error=No+rows+were+found+in+the+source+file`);

  const supabase = await createSupabaseServerClient();
  const year = Number(formData.get("academicYear") ?? getNamibiaCalendarYear());
  const { data: jobId, error: jobError } = await supabase.rpc("create_operational_intake_job", {
    p_school_id: membership.schoolId,
    p_academic_year: year,
    p_intake_type: adapter,
    p_source_kind: "structured_import",
    p_document_type: adapter === "calendar" ? "calendar_structured_import" : "asc_structured_import",
  });
  if (jobError || !jobId) redirect(`/school/imports/operations?adapter=${adapter}&error=Intake+job+could+not+be+created`);

  const staged = rows.map((row, index) => ({
    row_number: index + 2,
    source: row,
    normalized: adapter === "calendar" ? normalizedCalendarRow(row) : normalizedTimetableRow(row),
  }));
  const { error } = await supabase.rpc("stage_operational_intake_rows", { p_job_id: jobId, p_rows: staged });
  revalidatePath("/school/imports/operations");
  redirect(`/school/imports/operations?adapter=${adapter}&job=${jobId}${error ? "&error=Rows+could+not+be+staged" : "&success=Rows+staged.+Review+every+decision+before+commit"}`);
}

export async function stageCalendarStructuredImport(formData: FormData) {
  return stageStructured("calendar", formData);
}

export async function stageTimetableStructuredImport(formData: FormData) {
  return stageStructured("timetable", formData);
}

export async function stageOperationalSourceArtifact(formData: FormData) {
  const adapter = String(formData.get("adapter") ?? "") as "calendar" | "timetable";
  if (!["calendar","timetable"].includes(adapter)) redirect("/school/imports/operations?error=Choose+a+valid+adapter");
  const membership = await requireOperationalManager(adapter);
  const file = formData.get("file");
  if (!(file instanceof File) || file.size<=0 || file.size>10*1024*1024 || !sourceMimeTypes.has(file.type)) {
    redirect(`/school/imports/operations?adapter=${adapter}&error=Use+a+PDF,+JPEG,+PNG+or+WebP+source+up+to+10MB`);
  }

  const supabase = await createSupabaseServerClient();
  const year = Number(formData.get("academicYear") ?? getNamibiaCalendarYear());
  const { data: jobId, error: jobError } = await supabase.rpc("create_operational_intake_job", {
    p_school_id: membership.schoolId,
    p_academic_year: year,
    p_intake_type: adapter,
    p_source_kind: "scan",
    p_document_type: adapter === "calendar" ? "calendar_source" : "printed_timetable",
  });
  if (jobError || !jobId) redirect(`/school/imports/operations?adapter=${adapter}&error=Source+intake+job+could+not+be+created`);

  const bytes = Buffer.from(await file.arrayBuffer());
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const storagePath = `${membership.schoolId}/${jobId}/${randomUUID()}-${cleanFileName(file.name)}`;
  const { error: uploadError } = await supabase.storage.from("document-intake-private").upload(storagePath, bytes, {
    contentType: file.type,
    upsert: false,
  });
  if (uploadError) redirect(`/school/imports/operations?adapter=${adapter}&job=${jobId}&error=Source+artifact+could+not+be+uploaded`);

  const { error: artifactError } = await supabase.rpc("register_document_intake_artifact", {
    p_job_id: jobId,
    p_artifact_kind: adapter === "calendar" ? "calendar_source" : "timetable_source",
    p_storage_path: storagePath,
    p_file_name: file.name,
    p_mime_type: file.type,
    p_file_size_bytes: file.size,
    p_sha256: sha256,
  });
  if (artifactError) {
    await supabase.storage.from("document-intake-private").remove([storagePath]);
    redirect(`/school/imports/operations?adapter=${adapter}&job=${jobId}&error=Source+artifact+metadata+could+not+be+registered`);
  }

  revalidatePath("/school/imports/operations");
  redirect(`/school/imports/operations?adapter=${adapter}&job=${jobId}&success=Source+artifact+staged.+Extraction+must+produce+reviewable+rows+before+commit`);
}

export async function reviewOperationalIntakeRow(formData: FormData) {
  const adapter = String(formData.get("adapter") ?? "") as "calendar" | "timetable";
  await requireOperationalManager(adapter);
  const rowId = String(formData.get("rowId") ?? "");
  const jobId = String(formData.get("jobId") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("review_operational_intake_row", { p_row_id: rowId, p_decision: decision });
  revalidatePath("/school/imports/operations");
  redirect(`/school/imports/operations?adapter=${adapter}&job=${jobId}${error ? "&error=Review+decision+could+not+be+saved" : "&success=Review+decision+saved"}`);
}

export async function correctOperationalIntakeRow(formData: FormData) {
  const adapter = String(formData.get("adapter") ?? "") as "calendar" | "timetable";
  await requireOperationalManager(adapter);
  const rowId = String(formData.get("rowId") ?? "");
  const jobId = String(formData.get("jobId") ?? "");
  const payload = adapter === "calendar" ? normalizedCalendarRow(Object.fromEntries(formData.entries()) as Record<string,string>) : normalizedTimetableRow(Object.fromEntries(formData.entries()) as Record<string,string>);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("correct_operational_intake_row", { p_row_id: rowId, p_normalized_payload: payload });
  revalidatePath("/school/imports/operations");
  redirect(`/school/imports/operations?adapter=${adapter}&job=${jobId}${error ? "&error=Corrected+row+could+not+be+saved" : "&success=Row+corrected.+Review+the+new+resolution"}`);
}

export async function commitOperationalIntakeJob(formData: FormData) {
  const adapter = String(formData.get("adapter") ?? "") as "calendar" | "timetable";
  await requireOperationalManager(adapter);
  const jobId = String(formData.get("jobId") ?? "");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("commit_operational_intake_job", { p_job_id: jobId });
  revalidatePath("/school/imports/operations");
  revalidatePath("/calendar");
  revalidatePath("/timetable");
  redirect(`/school/imports/operations?adapter=${adapter}&job=${jobId}${error ? "&error=Reviewed+intake+could+not+be+committed" : "&success=Reviewed+intake+committed+through+the+canonical+workspace"}`);
}
