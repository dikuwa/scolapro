import { createSupabaseServerClient } from "@/lib/supabase/server";

export type SchoolPaymentSettings = {
  schoolId: string; bankName: string | null; accountName: string | null; accountNumber: string | null;
  branchName: string | null; branchCode: string | null; accountType: string | null;
  referenceInstructions: string | null; paymentInstructions: string | null; active: boolean;
};
export type FinanceLearner = { id: string; name: string; admissionNumber: string | null };
export type FinancePayment = { id: string; learnerId: string | null; learnerName: string | null; reference: string; method: string; amount: number; paidOn: string; bankReference: string | null; status: string };

export async function getSchoolPaymentSettings(schoolId: string): Promise<SchoolPaymentSettings | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("school_payment_settings").select("school_id,bank_name,account_name,account_number,branch_name,branch_code,account_type,reference_instructions,payment_instructions,active").eq("school_id", schoolId).maybeSingle();
  if (!data) return null;
  return { schoolId: data.school_id, bankName: data.bank_name, accountName: data.account_name, accountNumber: data.account_number, branchName: data.branch_name, branchCode: data.branch_code, accountType: data.account_type, referenceInstructions: data.reference_instructions, paymentInstructions: data.payment_instructions, active: data.active };
}

export async function getFinanceWorkspace(schoolId: string) {
  const supabase = await createSupabaseServerClient();
  const [{ data: settings }, { data: payments }] = await Promise.all([
    supabase.from("school_payment_settings").select("school_id,bank_name,account_name,account_number,branch_name,branch_code,account_type,reference_instructions,payment_instructions,active").eq("school_id", schoolId).maybeSingle(),
    supabase.from("finance_payments").select("id,learner_id,payment_reference,payment_method,amount,paid_on,bank_reference,status").eq("school_id", schoolId).order("paid_on", { ascending: false }).limit(50),
  ]);
  const paymentLearnerIds = [...new Set((payments ?? []).flatMap((row) => row.learner_id ? [row.learner_id] : []))];
  const { data: learnerRows, error: learnerLabelsError } = paymentLearnerIds.length
    ? await supabase.rpc("get_finance_payment_learner_labels", {
        p_school_id: schoolId,
        p_learner_ids: paymentLearnerIds,
      })
    : { data: [], error: null };
  if (learnerLabelsError) throw new Error("Unable to load finance learner labels.");
  const learnerRowsTyped = (learnerRows ?? []) as Array<{ learner_id: string; display_name: string }>;
  const names = new Map(
    learnerRowsTyped.map((row) => [row.learner_id, row.display_name]),
  );
  return {
    settings: settings ? { schoolId: settings.school_id, bankName: settings.bank_name, accountName: settings.account_name, accountNumber: settings.account_number, branchName: settings.branch_name, branchCode: settings.branch_code, accountType: settings.account_type, referenceInstructions: settings.reference_instructions, paymentInstructions: settings.payment_instructions, active: settings.active } as SchoolPaymentSettings : null,
    payments: (payments ?? []).map((row) => ({ id: row.id, learnerId: row.learner_id, learnerName: row.learner_id ? names.get(row.learner_id) ?? null : null, reference: row.payment_reference, method: row.payment_method, amount: Number(row.amount), paidOn: row.paid_on, bankReference: row.bank_reference, status: row.status })) as FinancePayment[],
  };
}
