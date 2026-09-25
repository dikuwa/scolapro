"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type CrcCustodyActionState = {
  message?: string;
  success?: boolean;
  fieldErrors?: Record<string, string[]>;
};

const custodyActionSchema = z.object({
  custodyId: z.string().uuid("Invalid custody record."),
  action: z.enum(["authorize", "dispatch", "receive", "acknowledge", "close"]),
});

const transitionRpc: Record<string, string> = {
  authorize: "authorize_crc_custody",
  dispatch: "dispatch_crc_custody",
  receive: "receive_crc_custody",
  acknowledge: "acknowledge_crc_custody",
  close: "close_crc_custody",
};

export async function transitionCrcCustody(
  _previousState: CrcCustodyActionState,
  formData: FormData,
): Promise<CrcCustodyActionState> {
  const parsed = custodyActionSchema.safeParse({
    custodyId: formData.get("custodyId"),
    action: formData.get("action"),
  });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc(transitionRpc[parsed.data.action], {
    p_custody_id: parsed.data.custodyId,
  });

  if (error) {
    return { message: "The custody record could not be updated. Review the required scope and try again." };
  }

  revalidatePath("/school/crc-custody");
  return { success: true, message: "CRC custody updated." };
}

const prepareSchema = z.object({
  learnerId: z.string().uuid("Choose a learner."),
  receivingSchoolId: z.string().uuid("Choose a receiving school."),
  receivingUserId: z.string().uuid("Choose a receiving custodian."),
  custodyNote: z.string().trim().max(2000, "Keep the note under 2000 characters.").optional(),
});

export async function prepareCrcCustody(
  _previousState: CrcCustodyActionState,
  formData: FormData,
): Promise<CrcCustodyActionState> {
  const parsed = prepareSchema.safeParse({
    learnerId: formData.get("learnerId"),
    receivingSchoolId: formData.get("receivingSchoolId"),
    receivingUserId: formData.get("receivingUserId"),
    custodyNote: formData.get("custodyNote"),
  });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("prepare_crc_custody", {
    p_learner_id: parsed.data.learnerId,
    p_receiving_school_id: parsed.data.receivingSchoolId,
    p_receiving_user_id: parsed.data.receivingUserId,
    p_custody_note: parsed.data.custodyNote || null,
  });

  if (error) {
    return { message: "The custody record could not be prepared. Confirm the learner enrolment and receiving custodian scope." };
  }

  revalidatePath("/school/crc-custody");
  return { success: true, message: "CRC custody prepared. School leadership must authorize it before dispatch." };
}

const requestSchema = z.object({
  learnerId: z.string().uuid("Choose a learner."),
  originSchoolId: z.union([z.string().uuid(), z.literal("")]).optional(),
  externalOriginName: z.string().trim().max(180).optional(),
  requestNote: z.string().trim().max(2000).optional(),
}).superRefine((value, ctx) => {
  const hasSchool = Boolean(value.originSchoolId);
  const hasExternal = Boolean(value.externalOriginName);
  if (hasSchool === hasExternal) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["originSchoolId"],
      message: "Choose one ScolaPro origin school or enter one external school.",
    });
  }
});

export async function requestCrcCustody(
  _previousState: CrcCustodyActionState,
  formData: FormData,
): Promise<CrcCustodyActionState> {
  const parsed = requestSchema.safeParse({
    learnerId: formData.get("learnerId"),
    originSchoolId: String(formData.get("originSchoolId") ?? ""),
    externalOriginName: String(formData.get("externalOriginName") ?? ""),
    requestNote: String(formData.get("requestNote") ?? ""),
  });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("request_crc_custody", {
    p_learner_id: parsed.data.learnerId,
    p_origin_school_id: parsed.data.originSchoolId || null,
    p_external_origin_name: parsed.data.externalOriginName || null,
    p_request_note: parsed.data.requestNote || null,
  });

  if (error) {
    return {
      message: error.message.includes("already")
        ? "An open CRC request already exists for this learner."
        : "The CRC request could not be created. Confirm the learner and origin school.",
    };
  }

  revalidatePath("/school/crc-custody");
  return { success: true, message: "CRC request created." };
}

const requestIdSchema = z.object({
  requestId: z.string().uuid("Invalid CRC request."),
});

export async function acceptCrcCustodyRequest(
  _previousState: CrcCustodyActionState,
  formData: FormData,
): Promise<CrcCustodyActionState> {
  const parsed = requestIdSchema.safeParse({ requestId: formData.get("requestId") });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("accept_crc_custody_request", {
    p_request_id: parsed.data.requestId,
  });
  if (error) return { message: "The request could not be accepted. Confirm origin-custodian authority." };

  revalidatePath("/school/crc-custody");
  return { success: true, message: "CRC request accepted and transfer prepared." };
}

export async function fulfillExternalCrcRequest(
  _previousState: CrcCustodyActionState,
  formData: FormData,
): Promise<CrcCustodyActionState> {
  const parsed = requestIdSchema.safeParse({ requestId: formData.get("requestId") });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("fulfill_external_crc_custody_request", {
    p_request_id: parsed.data.requestId,
  });
  if (error) return { message: "The external CRC request could not be marked fulfilled." };

  revalidatePath("/school/crc-custody");
  return { success: true, message: "External CRC request marked fulfilled." };
}

const escalationSchema = z.object({
  requestId: z.string().uuid("Invalid CRC request."),
  scopeKind: z.enum(["circuit", "region"]),
});

export async function escalateCrcCustodyRequest(
  _previousState: CrcCustodyActionState,
  formData: FormData,
): Promise<CrcCustodyActionState> {
  const parsed = escalationSchema.safeParse({
    requestId: formData.get("requestId"),
    scopeKind: formData.get("scopeKind"),
  });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("escalate_crc_custody_request", {
    p_request_id: parsed.data.requestId,
    p_scope_kind: parsed.data.scopeKind,
  });
  if (error) {
    return {
      message: error.message.includes("overdue")
        ? "Only overdue CRC requests can be escalated."
        : "The CRC request could not be escalated within the current network relationship.",
    };
  }

  revalidatePath("/school/crc-custody");
  return { success: true, message: `CRC request escalated to the ${parsed.data.scopeKind}.` };
}

const policySchema = z.object({
  schoolId: z.string().uuid(),
  responseDays: z.coerce.number().int().min(1).max(60),
});

export async function setCrcCustodyRequestPolicy(
  _previousState: CrcCustodyActionState,
  formData: FormData,
): Promise<CrcCustodyActionState> {
  const parsed = policySchema.safeParse({
    schoolId: formData.get("schoolId"),
    responseDays: formData.get("responseDays"),
  });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_crc_custody_request_policy", {
    p_school_id: parsed.data.schoolId,
    p_response_days: parsed.data.responseDays,
  });
  if (error) return { message: "The CRC request response policy could not be updated." };

  revalidatePath("/school/crc-custody");
  return { success: true, message: "CRC request response policy updated." };
}

const escalationAckSchema = z.object({
  escalationId: z.string().uuid("Invalid escalation."),
});

export async function acknowledgeCrcRequestEscalation(
  _previousState: CrcCustodyActionState,
  formData: FormData,
): Promise<CrcCustodyActionState> {
  const parsed = escalationAckSchema.safeParse({ escalationId: formData.get("escalationId") });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("acknowledge_crc_request_escalation", {
    p_escalation_id: parsed.data.escalationId,
  });
  if (error) return { message: "The CRC escalation could not be acknowledged." };

  revalidatePath("/network/crc-escalations");
  return { success: true, message: "CRC escalation acknowledged." };
}
