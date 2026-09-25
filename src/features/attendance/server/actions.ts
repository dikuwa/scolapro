"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { resolveAttendanceTeachingImpact } from "@/features/attendance/server/register";
import { getOfficialAttendanceSummary } from "@/features/attendance/server/official-summary";
import { getUserContext } from "@/lib/auth/get-user-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const FINALIZE_AUTHORIZED_ROLES = new Set(["principal", "deputy_principal", "school_admin"]);

const exceptionSchema = z.object({
  enrolment_id: z.string().uuid(),
  status: z.enum(["absent", "late", "excused", "unknown"]),
  reason_id: z.string().uuid().nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
});

const registerSchema = z.object({
  registerClassId: z.string().uuid(),
  attendanceDate: z.string().date(),
  clientMutationId: z.string().uuid(),
  replacesSubmissionId: z.string().uuid().nullable().optional(),
  source: z.enum(["online", "offline"]).default("online"),
  exceptions: z.array(exceptionSchema),
});

export type DailyRegisterState = {
  message?: string;
  success?: boolean;
};

const evidenceTypes = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const maxEvidenceBytes = 5 * 1024 * 1024;

function safeFilename(value: string) {
  return value.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").slice(-100) || "evidence";
}

export async function submitDailyRegister(
  _previousState: DailyRegisterState,
  formData: FormData,
): Promise<DailyRegisterState> {
  let parsedExceptions: unknown = [];
  try {
    parsedExceptions = JSON.parse(String(formData.get("exceptions") ?? "[]"));
  } catch {
    return { message: "The attendance changes could not be read. Refresh and try again." };
  }

  const parsed = registerSchema.safeParse({
    registerClassId: formData.get("registerClassId"),
    attendanceDate: formData.get("attendanceDate"),
    clientMutationId: formData.get("clientMutationId"),
    replacesSubmissionId: formData.get("replacesSubmissionId") || null,
    source: formData.get("source") || "online",
    exceptions: parsedExceptions,
  });

  if (!parsed.success) return { message: "Review the attendance entries and try again." };

  const context = await getUserContext();
  const allowedRoles = new Set(["school_admin", "principal", "deputy_principal", "hod", "teacher", "class_teacher"]);
  const canRecord = context.platformMemberships.some((item) => item.roleKey === "platform_admin")
    || context.memberships.some((item) => allowedRoles.has(item.roleKey));

  if (!context.user || !canRecord) return { message: "You do not have permission to record attendance." };

  for (const exception of parsed.data.exceptions) {
    const evidence = formData.get(`evidence-${exception.enrolment_id}`);
    if (!(evidence instanceof File) || evidence.size === 0) continue;
    if (!evidenceTypes.has(evidence.type)) return { message: `Evidence for one learner must be JPG, PNG, WebP or PDF.` };
    if (evidence.size > maxEvidenceBytes) return { message: "Attendance evidence files must be 5 MB or smaller." };
  }

  const supabase = await createSupabaseServerClient();

  const { data: registerSchool } = await supabase
    .from("register_classes")
    .select("school_id")
    .eq("id", parsed.data.registerClassId)
    .maybeSingle();
  if (!registerSchool) return { message: "The register class could not be found. Refresh and try again." };

  // Defence in depth: the calendar may mark the date NO_TEACHING. Capture is
  // blocked server-side so an accidental official register is never submitted
  // for a clearly non-teaching day, even if the UI gate were bypassed.
  const teachingDay = await resolveAttendanceTeachingImpact(registerSchool.school_id, parsed.data.attendanceDate);
  if (teachingDay.impact === "NO_TEACHING") {
    return { message: "This date is marked as a non-teaching day in the school calendar, so attendance can't be recorded." };
  }
  const { data: submissionId, error } = await supabase.rpc("submit_daily_register", {
    p_register_class_id: parsed.data.registerClassId,
    p_attendance_date: parsed.data.attendanceDate,
    p_exceptions: parsed.data.exceptions,
    p_note: null,
    p_client_mutation_id: parsed.data.clientMutationId,
    p_replaces_submission_id: parsed.data.replacesSubmissionId || null,
    p_source: parsed.data.source,
  });

  if (error || !submissionId) return { message: "The register could not be saved. Confirm the class and learner entries, then try again." };

  const { data: submission } = await supabase
    .from("attendance_register_submissions")
    .select("id,tenant_id,school_id")
    .eq("id", submissionId)
    .single();

  let evidenceFailures = 0;
  if (submission) {
    for (const exception of parsed.data.exceptions) {
      const evidence = formData.get(`evidence-${exception.enrolment_id}`);
      if (!(evidence instanceof File) || evidence.size === 0) continue;

      const path = `${submission.school_id}/${context.user.id}/${crypto.randomUUID()}-${safeFilename(evidence.name)}`;
      const bytes = await evidence.arrayBuffer();
      const { error: uploadError } = await supabase.storage.from("attendance-evidence").upload(path, bytes, {
        contentType: evidence.type,
        upsert: false,
      });

      if (uploadError) {
        evidenceFailures += 1;
        continue;
      }

      const { error: recordError } = await supabase.from("attendance_evidence").insert({
        tenant_id: submission.tenant_id,
        school_id: submission.school_id,
        register_submission_id: submission.id,
        enrolment_id: exception.enrolment_id,
        attendance_date: parsed.data.attendanceDate,
        storage_path: path,
        original_filename: evidence.name,
        mime_type: evidence.type,
        file_size: evidence.size,
        uploaded_by_user_id: context.user.id,
      });

      if (recordError) {
        evidenceFailures += 1;
        await supabase.storage.from("attendance-evidence").remove([path]);
      }
    }
  }

  // Absence reviews read the same authoritative daily register records, so the
  // dependent route must be invalidated alongside the register itself. Without
  // this the saved absences stay behind the previous absence-review payload.
  revalidatePath("/attendance");
  revalidatePath("/school/absence-reviews");
  revalidatePath("/");
  return evidenceFailures
    ? { success: true, message: `Attendance saved. ${evidenceFailures} evidence file${evidenceFailures === 1 ? "" : "s"} could not be attached.` }
    : { success: true, message: "Attendance register saved." };
}

export type FinalizeOfficialAttendanceSummaryInput = {
  schoolId: string;
  academicYear: number;
  mode: "week" | "term";
  date: string;
  termId?: string | null;
};

export type FinalizeOfficialAttendanceSummaryResult = {
  success: boolean;
  message?: string;
  revision?: number;
  scolaproReference?: string;
  verificationToken?: string;
  verificationPath?: string;
};

/**
 * Finalizes (or, when a finalized version already exists for the scope, issues a
 * new superseding revision of) the Official Attendance Summary.
 *
 * The authoritative summary is recomputed server-side so readiness and the frozen
 * data snapshot are never forged by the caller. The DB RPC independently
 * re-checks authority and readiness and writes the immutable revision.
 */
export async function finalizeOfficialAttendanceSummary(
  input: FinalizeOfficialAttendanceSummaryInput,
): Promise<FinalizeOfficialAttendanceSummaryResult> {
  const context = await getUserContext();
  const allowedRoles = new Set(["school_admin", "principal", "deputy_principal", "hod", "teacher", "class_teacher"]);
  const membership = context.memberships.find(
    (item) => item.schoolId === input.schoolId && allowedRoles.has(item.roleKey),
  );
  if (!context.user || !membership) {
    return { success: false, message: "You do not have permission to finalize this summary." };
  }
  if (!FINALIZE_AUTHORIZED_ROLES.has(membership.roleKey)) {
    return {
      success: false,
      message: "Only the Principal, Deputy Principal or School Admin may finalize the official attendance summary.",
    };
  }

  const summary = await getOfficialAttendanceSummary(
    input.schoolId,
    input.academicYear,
    input.mode,
    input.date,
    input.termId ?? null,
  );
  if (!summary.readiness.complete) {
    return {
      success: false,
      message: "All expected registers must be confirmed before this summary can be finalized.",
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("finalize_official_attendance_summary", {
    p_school_id: input.schoolId,
    p_academic_year: input.academicYear,
    p_mode: input.mode,
    p_scope_start: summary.scopeStart,
    p_scope_end: summary.scopeEnd,
    p_term_id: input.termId ?? null,
    p_data_snapshot: summary as unknown as Record<string, unknown>,
  });

  if (error) {
    console.error("official attendance summary finalize failed", error.message);
    const isReadiness = /readiness|confirmed|incomplete/i.test(error.message);
    return {
      success: false,
      message: isReadiness
        ? "All expected registers must be confirmed before this summary can be finalized."
        : "The official attendance summary could not be finalized. Try again.",
    };
  }

  const row = (Array.isArray(data) ? data[0] : data) as
    | { snapshot_id: string; revision: number; scolapro_reference: string; verification_token: string; verification_path: string }
    | undefined;
  if (!row) {
    return { success: false, message: "The official attendance summary could not be finalized. Try again." };
  }

  revalidatePath("/attendance");
  return {
    success: true,
    revision: row.revision,
    scolaproReference: row.scolapro_reference,
    verificationToken: row.verification_token,
    verificationPath: row.verification_path,
    message: row.revision > 1 ? `Revision ${row.revision} finalized.` : "Official attendance summary finalized.",
  };
}