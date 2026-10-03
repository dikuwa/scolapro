"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getUserContext } from "@/lib/auth/get-user-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type StaffLeaveActionState = {
  success?: boolean;
  message?: string;
  fieldErrors?: Record<string, string[] | undefined>;
};

function finish(message: string): StaffLeaveActionState {
  revalidatePath("/staff/leave");
  revalidatePath("/staff");
  revalidatePath("/calendar");
  revalidatePath("/timetable");
  return { success: true, message };
}

const managerRoles = new Set(["school_admin", "principal", "deputy_principal"]);

async function canManageSchoolLeave(schoolId: string) {
  const context = await getUserContext();
  return Boolean(
    context.user && (
      context.platformMemberships.some((item) => item.roleKey === "platform_admin") ||
      context.memberships.some((item) => item.schoolId === schoolId && managerRoles.has(item.roleKey))
    )
  );
}

const requestSchema = z.object({
  schoolId: z.string().uuid(),
  leaveTypeId: z.string().uuid(),
  startsOn: z.string().date(),
  endsOn: z.string().date(),
  requestedUnits: z.coerce.number().positive().max(366),
  reason: z.string().trim().max(1000).optional(),
}).superRefine((value, ctx) => {
  if (value.endsOn < value.startsOn) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endsOn"], message: "End date cannot be before start date." });
  }
});

export async function submitStaffLeave(
  _state: StaffLeaveActionState,
  formData: FormData,
): Promise<StaffLeaveActionState> {
  const parsed = requestSchema.safeParse({
    schoolId: formData.get("schoolId"),
    leaveTypeId: formData.get("leaveTypeId"),
    startsOn: formData.get("startsOn"),
    endsOn: formData.get("endsOn"),
    requestedUnits: formData.get("requestedUnits"),
    reason: String(formData.get("reason") ?? ""),
  });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("submit_staff_leave_request", {
    p_school_id: parsed.data.schoolId,
    p_leave_type_id: parsed.data.leaveTypeId,
    p_starts_on: parsed.data.startsOn,
    p_ends_on: parsed.data.endsOn,
    p_requested_units: parsed.data.requestedUnits,
    p_reason: parsed.data.reason || null,
  });
  if (error) {
    if (
      error.message.includes("overlapping") ||
      error.message.includes("current staff-linked") ||
      error.message.includes("effective school placement") ||
      error.message.includes("Active leave type")
    ) return { message: error.message };
    return { message: "Leave request could not be submitted." };
  }
  return finish("Leave request submitted for review.");
}

const typeSchema = z.object({
  schoolId: z.string().uuid(),
  code: z.string().trim().min(1).max(40),
  displayName: z.string().trim().min(1).max(120),
  tracksBalance: z.enum(["yes", "no"]),
  evidenceRequirement: z.enum(["none", "optional", "required"]),
  sourceReference: z.string().trim().max(500).optional(),
  active: z.enum(["yes", "no"]),
}).superRefine((value, ctx) => {
  if (value.tracksBalance === "yes" && !value.sourceReference) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["sourceReference"], message: "Tracked leave types require a verified source reference." });
  }
});

export async function configureStaffLeaveType(
  _state: StaffLeaveActionState,
  formData: FormData,
): Promise<StaffLeaveActionState> {
  const parsed = typeSchema.safeParse({
    schoolId: formData.get("schoolId"),
    code: formData.get("code"),
    displayName: formData.get("displayName"),
    tracksBalance: formData.get("tracksBalance"),
    evidenceRequirement: formData.get("evidenceRequirement"),
    sourceReference: String(formData.get("sourceReference") ?? ""),
    active: formData.get("active"),
  });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };
  if (!(await canManageSchoolLeave(parsed.data.schoolId))) return { message: "You do not have permission to configure leave types." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("configure_staff_leave_type", {
    p_school_id: parsed.data.schoolId,
    p_code: parsed.data.code,
    p_display_name: parsed.data.displayName,
    p_tracks_balance: parsed.data.tracksBalance === "yes",
    p_evidence_requirement: parsed.data.evidenceRequirement,
    p_source_reference: parsed.data.sourceReference || null,
    p_active: parsed.data.active === "yes",
  });
  if (error) return { message: error.message || "Leave type could not be saved." };
  return finish("Leave type saved.");
}

const decisionSchema = z.object({
  requestId: z.string().uuid(),
  decision: z.enum(["approve", "reject"]),
  approvedUnits: z.coerce.number().positive().max(366).optional(),
  note: z.string().trim().max(1000).optional(),
}).superRefine((value, ctx) => {
  if (value.decision === "approve" && !value.approvedUnits) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["approvedUnits"], message: "Approved units are required." });
  }
});

export async function decideStaffLeave(
  _state: StaffLeaveActionState,
  formData: FormData,
): Promise<StaffLeaveActionState> {
  const rawApprovedUnits = String(formData.get("approvedUnits") ?? "").trim();
  const parsed = decisionSchema.safeParse({
    requestId: formData.get("requestId"),
    decision: formData.get("decision"),
    approvedUnits: rawApprovedUnits ? rawApprovedUnits : undefined,
    note: String(formData.get("note") ?? ""),
  });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("decide_staff_leave_request", {
    p_request_id: parsed.data.requestId,
    p_decision: parsed.data.decision,
    p_approved_units: parsed.data.decision === "approve" ? parsed.data.approvedUnits ?? null : null,
    p_note: parsed.data.note || null,
  });
  if (error) {
    if (
      error.message.includes("own leave") ||
      error.message.includes("Required leave evidence") ||
      error.message.includes("Approved leave units cannot exceed requested units") ||
      error.message.includes("Only submitted")
    ) return { message: error.message };
    return { message: "Leave decision could not be saved." };
  }
  return finish(parsed.data.decision === "approve" ? "Leave approved and operational absence recorded." : "Leave request rejected.");
}

const cancelSchema = z.object({
  requestId: z.string().uuid(),
  reason: z.string().trim().min(2).max(1000),
});

export async function cancelStaffLeave(
  _state: StaffLeaveActionState,
  formData: FormData,
): Promise<StaffLeaveActionState> {
  const parsed = cancelSchema.safeParse({
    requestId: formData.get("requestId"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("cancel_staff_leave_request", {
    p_request_id: parsed.data.requestId,
    p_reason: parsed.data.reason,
  });
  if (error) return { message: error.message || "Leave request could not be cancelled." };
  return finish("Leave request cancelled. Historical approval and ledger history were retained.");
}

const ledgerSchema = z.object({
  schoolId: z.string().uuid(),
  staffMemberId: z.string().uuid(),
  leaveTypeId: z.string().uuid(),
  entryKind: z.enum(["opening", "accrual", "adjustment"]),
  unitsDelta: z.coerce.number().refine((value) => value !== 0 && Math.abs(value) <= 1000, "Enter a non-zero value within 1000 units."),
  effectiveOn: z.string().date(),
  note: z.string().trim().max(1000).optional(),
  sourceReference: z.string().trim().min(2).max(500),
});

export async function postStaffLeaveLedgerEntry(
  _state: StaffLeaveActionState,
  formData: FormData,
): Promise<StaffLeaveActionState> {
  const parsed = ledgerSchema.safeParse({
    schoolId: formData.get("schoolId"),
    staffMemberId: formData.get("staffMemberId"),
    leaveTypeId: formData.get("leaveTypeId"),
    entryKind: formData.get("entryKind"),
    unitsDelta: formData.get("unitsDelta"),
    effectiveOn: formData.get("effectiveOn"),
    note: String(formData.get("note") ?? ""),
    sourceReference: formData.get("sourceReference"),
  });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };
  if (!(await canManageSchoolLeave(parsed.data.schoolId))) return { message: "You do not have permission to post leave ledger entries." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("post_staff_leave_ledger_entry", {
    p_school_id: parsed.data.schoolId,
    p_staff_member_id: parsed.data.staffMemberId,
    p_leave_type_id: parsed.data.leaveTypeId,
    p_entry_kind: parsed.data.entryKind,
    p_units_delta: parsed.data.unitsDelta,
    p_effective_on: parsed.data.effectiveOn,
    p_note: parsed.data.note || null,
    p_source_reference: parsed.data.sourceReference,
  });
  if (error) return { message: error.message || "Leave ledger entry could not be posted." };
  return finish("Leave ledger entry posted. Balance remains derived from ledger history.");
}

const evidenceSchema = z.object({
  schoolId: z.string().uuid(),
  requestId: z.string().uuid(),
});

export async function uploadStaffLeaveEvidence(
  _state: StaffLeaveActionState,
  formData: FormData,
): Promise<StaffLeaveActionState> {
  const parsed = evidenceSchema.safeParse({
    schoolId: formData.get("schoolId"),
    requestId: formData.get("requestId"),
  });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };

  const context = await getUserContext();
  if (!context.user) return { message: "Sign in again before uploading leave evidence." };

  const file = formData.get("evidence");
  if (!(file instanceof File) || file.size <= 0) return { fieldErrors: { evidence: ["Choose an evidence file."] } };
  if (file.size > 10 * 1024 * 1024) return { fieldErrors: { evidence: ["Evidence must be 10 MB or smaller."] } };
  if (!["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(file.type)) {
    return { fieldErrors: { evidence: ["Use PDF, JPG, PNG, or WebP evidence."] } };
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-120) || "evidence";
  const storagePath = `${parsed.data.schoolId}/${context.user.id}/${parsed.data.requestId}/${randomUUID()}-${safeName}`;
  const supabase = await createSupabaseServerClient();
  const { error: uploadError } = await supabase.storage.from("staff-leave-evidence").upload(storagePath, file, {
    contentType: file.type,
    upsert: false,
  });
  if (uploadError) return { message: "Private leave evidence could not be uploaded." };

  const { error: registerError } = await supabase.rpc("register_staff_leave_attachment", {
    p_request_id: parsed.data.requestId,
    p_storage_path: storagePath,
    p_file_name: file.name,
    p_mime_type: file.type,
    p_file_size_bytes: file.size,
  });
  if (registerError) {
    await supabase.storage.from("staff-leave-evidence").remove([storagePath]);
    return { message: registerError.message || "Leave evidence could not be registered." };
  }

  return finish("Private leave evidence uploaded.");
}
