"use server";

import { createHash, randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getUserContext } from "@/lib/auth/get-user-context";
import { getNamibiaCalendarYear } from "@/lib/namibia-date";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const managerRoles = new Set(["school_admin", "principal", "deputy_principal"]);
const intakeMimeTypes = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);

async function requireAdmissionsManager() {
  const context = await getUserContext();
  const membership = context.memberships.find((item) => managerRoles.has(item.roleKey));
  if (!context.user || !membership) redirect("/?error=Admissions+manager+access+is+required");
  return { context, membership };
}

function cleanFileName(name: string) {
  const trimmed = name.trim().replace(/[^A-Za-z0-9._-]+/g, "-").replace(/-+/g, "-");
  return trimmed.slice(0, 120) || "source-document";
}

function candidateFromForm(formData: FormData) {
  const value = (name: string) => String(formData.get(name) ?? "").trim();
  return {
    first_names: value("first_names"),
    surname: value("surname"),
    preferred_name: value("preferred_name"),
    date_of_birth: value("date_of_birth"),
    sex: value("sex"),
    citizenship: value("citizenship"),
    home_language: value("home_language"),
    previous_school: value("previous_school"),
    last_grade: value("last_grade"),
    requested_grade_id: value("requested_grade_id"),
    guardian_1_name: value("guardian_1_name"),
    guardian_1_relationship: value("guardian_1_relationship"),
    guardian_1_contact: value("guardian_1_contact"),
    guardian_2_name: value("guardian_2_name"),
    guardian_2_relationship: value("guardian_2_relationship"),
    guardian_2_contact: value("guardian_2_contact"),
    siblings_at_school: value("siblings_at_school"),
    declarations: value("declarations"),
    document_checklist: value("document_checklist"),
  };
}

export async function stageScannedAdmissionApplication(formData: FormData) {
  const { context, membership } = await requireAdmissionsManager();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size <= 0) redirect("/school/admissions?error=Choose+a+source+application+file");
  if (file.size > 10 * 1024 * 1024 || !intakeMimeTypes.has(file.type)) {
    redirect("/school/admissions?error=Use+a+PDF,+JPEG,+PNG+or+WebP+file+up+to+10MB");
  }

  const year = Number(formData.get("academicYear") ?? getNamibiaCalendarYear());
  const supabase = await createSupabaseServerClient();
  const { data: jobId, error: jobError } = await supabase.rpc("create_admission_intake_job", {
    p_school_id: membership.schoolId,
    p_academic_year: year,
    p_source_kind: "scan",
    p_document_type: "application_form",
  });
  if (jobError || !jobId) redirect("/school/admissions?error=Admission+intake+job+could+not+be+created");

  const bytes = Buffer.from(await file.arrayBuffer());
  const digest = createHash("sha256").update(bytes).digest("hex");
  const storagePath = `${membership.schoolId}/${jobId}/${randomUUID()}-${cleanFileName(file.name)}`;
  const { error: uploadError } = await supabase.storage.from("document-intake-private").upload(storagePath, bytes, {
    contentType: file.type,
    upsert: false,
  });
  if (uploadError) {
    await supabase.from("document_intake_jobs").update({ status: "failed" }).eq("id", jobId);
    redirect(`/school/admissions?job=${jobId}&error=Source+artifact+could+not+be+uploaded`);
  }

  const { error: artifactError } = await supabase.rpc("register_document_intake_artifact", {
    p_job_id: jobId,
    p_artifact_kind: "application_form",
    p_storage_path: storagePath,
    p_file_name: file.name,
    p_mime_type: file.type,
    p_file_size_bytes: file.size,
    p_sha256: digest,
  });
  if (artifactError) {
    await supabase.storage.from("document-intake-private").remove([storagePath]);
    redirect(`/school/admissions?job=${jobId}&error=Source+artifact+metadata+could+not+be+registered`);
  }

  void context;
  revalidatePath("/school/admissions");
  redirect(`/school/admissions?job=${jobId}&success=Source+application+staged+for+review`);
}

export async function startOnlineAdmissionApplication(formData: FormData) {
  const { membership } = await requireAdmissionsManager();
  const year = Number(formData.get("academicYear") ?? getNamibiaCalendarYear());
  const supabase = await createSupabaseServerClient();
  const { data: jobId, error } = await supabase.rpc("create_admission_intake_job", {
    p_school_id: membership.schoolId,
    p_academic_year: year,
    p_source_kind: "online_form",
    p_document_type: "application_form",
  });
  if (error || !jobId) redirect("/school/admissions?error=Online+application+could+not+be+started");
  revalidatePath("/school/admissions");
  redirect(`/school/admissions?job=${jobId}&success=Online+application+started`);
}

export async function saveAdmissionIntakeCandidate(formData: FormData) {
  await requireAdmissionsManager();
  const jobId = String(formData.get("jobId") ?? "");
  if (!jobId) redirect("/school/admissions");
  const supabase = await createSupabaseServerClient();
  const candidate = candidateFromForm(formData);
  const confidence = Object.fromEntries(
    Object.entries(candidate)
      .filter(([, value]) => Boolean(value))
      .map(([key]) => [key, 1]),
  );
  const { error } = await supabase.rpc("save_admission_intake_candidate", {
    p_job_id: jobId,
    p_candidate_payload: candidate,
    p_field_confidence: confidence,
  });
  revalidatePath("/school/admissions");
  redirect(`/school/admissions?job=${jobId}${error ? "&error=Candidate+could+not+be+staged" : "&success=Candidate+saved.+Review+possible+matches+before+commit"}`);
}

export async function reviewAdmissionIntakeCandidate(formData: FormData) {
  await requireAdmissionsManager();
  const jobId = String(formData.get("jobId") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const selectedLearnerId = String(formData.get("selectedLearnerId") ?? "") || null;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("review_admission_intake_candidate", {
    p_job_id: jobId,
    p_decision: decision,
    p_selected_learner_id: selectedLearnerId,
  });
  revalidatePath("/school/admissions");
  redirect(`/school/admissions?job=${jobId}${error ? "&error=Review+decision+could+not+be+saved" : "&success=Review+decision+saved"}`);
}

export async function commitAdmissionIntake(formData: FormData) {
  await requireAdmissionsManager();
  const jobId = String(formData.get("jobId") ?? "");
  const supabase = await createSupabaseServerClient();
  const { data: applicationId, error } = await supabase.rpc("commit_admission_intake_job", { p_job_id: jobId });
  revalidatePath("/school/admissions");
  redirect(`/school/admissions?job=${jobId}${error ? "&error=Reviewed+intake+could+not+be+committed" : `&success=Admission+application+created&application=${applicationId}`}`);
}

export async function decideAdmissionApplication(formData: FormData) {
  await requireAdmissionsManager();
  const applicationId = String(formData.get("applicationId") ?? "");
  const status = String(formData.get("status") ?? "");
  const note = String(formData.get("decisionNote") ?? "").trim();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("decide_admission_application", {
    p_application_id: applicationId,
    p_status: status,
    p_decision_note: note || null,
  });
  revalidatePath("/school/admissions");
  redirect(`/school/admissions${error ? "?error=Admission+decision+could+not+be+saved" : "?success=Admission+decision+saved"}`);
}
