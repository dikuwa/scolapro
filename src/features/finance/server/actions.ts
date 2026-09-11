"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getUserContext } from "@/lib/auth/get-user-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type FinanceActionState = { success?: boolean; message?: string };
const financeRoles = new Set(["school_admin","principal","finance_officer","bursar"]);

async function financeMembership(schoolId: string) {
  const context = await getUserContext();
  if (!context.user) return null;
  return context.memberships.find((item) => item.schoolId === schoolId && financeRoles.has(item.roleKey)) ?? null;
}

const settingsSchema = z.object({
  schoolId: z.string().uuid(), bankName: z.string().trim().min(2).max(120), accountName: z.string().trim().min(2).max(160), accountNumber: z.string().trim().min(2).max(80),
  branchName: z.string().trim().max(120).optional(), branchCode: z.string().trim().max(60).optional(), accountType: z.string().trim().max(80).optional(),
  referenceInstructions: z.string().trim().max(500).optional(), paymentInstructions: z.string().trim().max(1000).optional(), active: z.boolean(),
});

export async function savePaymentSettings(_state: FinanceActionState, formData: FormData): Promise<FinanceActionState> {
  const parsed = settingsSchema.safeParse({ schoolId: formData.get("schoolId"), bankName: formData.get("bankName"), accountName: formData.get("accountName"), accountNumber: formData.get("accountNumber"), branchName: formData.get("branchName") || undefined, branchCode: formData.get("branchCode") || undefined, accountType: formData.get("accountType") || undefined, referenceInstructions: formData.get("referenceInstructions") || undefined, paymentInstructions: formData.get("paymentInstructions") || undefined, active: formData.get("active") === "on" });
  if (!parsed.success) return { message: "Enter the required bank details and keep each field within its allowed length." };
  if (!await financeMembership(parsed.data.schoolId)) return { message: "Finance administration access is required." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("save_school_payment_settings", { p_school_id: parsed.data.schoolId, p_bank_name: parsed.data.bankName, p_account_name: parsed.data.accountName, p_account_number: parsed.data.accountNumber, p_branch_name: parsed.data.branchName || null, p_branch_code: parsed.data.branchCode || null, p_account_type: parsed.data.accountType || null, p_reference_instructions: parsed.data.referenceInstructions || null, p_payment_instructions: parsed.data.paymentInstructions || null, p_active: parsed.data.active });
  if (error) return { message: "Banking details could not be saved. Check your access and try again." };
  revalidatePath("/school/settings"); revalidatePath("/school/finance");
  return { success: true, message: "School payment details saved." };
}

const paymentSchema = z.object({ schoolId: z.string().uuid(), learnerId: z.union([z.string().uuid(), z.literal("")]), reference: z.string().trim().min(2).max(120), method: z.enum(["bank_transfer","cash","card","mobile","other"]), amount: z.coerce.number().positive().max(100000000), paidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), bankReference: z.string().trim().max(160).optional(), note: z.string().trim().max(1000).optional() });
export async function recordPayment(_state: FinanceActionState, formData: FormData): Promise<FinanceActionState> {
  const parsed = paymentSchema.safeParse({ schoolId: formData.get("schoolId"), learnerId: formData.get("learnerId") || "", reference: formData.get("reference"), method: formData.get("method"), amount: formData.get("amount"), paidOn: formData.get("paidOn"), bankReference: formData.get("bankReference") || undefined, note: formData.get("note") || undefined });
  if (!parsed.success) return { message: "Enter a valid payment date, reference, method and positive amount." };
  if (!await financeMembership(parsed.data.schoolId)) return { message: "Finance administration access is required." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("record_finance_payment", { p_school_id: parsed.data.schoolId, p_learner_id: parsed.data.learnerId || null, p_payment_reference: parsed.data.reference, p_payment_method: parsed.data.method, p_amount: parsed.data.amount, p_paid_on: parsed.data.paidOn, p_bank_reference: parsed.data.bankReference || null, p_note: parsed.data.note || null });
  if (error) return { message: "Payment could not be recorded. Check the learner, reference and your finance access." };
  revalidatePath("/school/finance");
  return { success: true, message: "Payment recorded in received state." };
}
