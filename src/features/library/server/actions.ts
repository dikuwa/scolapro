"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type LibraryActionState = { success?: boolean; message?: string };

const issueSchema = z.object({
  copyId: z.string().uuid(),
  borrowerType: z.enum(["learner", "staff"]),
  borrowerId: z.string().uuid(),
  dueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  notes: z.string().trim().max(500).optional(),
});

const returnSchema = z.object({
  loanId: z.string().uuid(),
  returnedCondition: z.enum(["new", "good", "fair", "poor", "damaged", "lost"]),
  notes: z.string().trim().max(500).optional(),
});

export async function issueLibraryResource(_state: LibraryActionState, formData: FormData): Promise<LibraryActionState> {
  const parsed = issueSchema.safeParse({
    copyId: String(formData.get("copyId") ?? ""),
    borrowerType: String(formData.get("borrowerType") ?? ""),
    borrowerId: String(formData.get("borrowerId") ?? ""),
    dueOn: String(formData.get("dueOn") ?? ""),
    notes: String(formData.get("notes") ?? ""),
  });
  if (!parsed.success) return { message: "Choose an available copy, borrower and valid due date." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("issue_learning_resource", {
    p_copy_id: parsed.data.copyId,
    p_learner_id: parsed.data.borrowerType === "learner" ? parsed.data.borrowerId : null,
    p_staff_member_id: parsed.data.borrowerType === "staff" ? parsed.data.borrowerId : null,
    p_due_on: parsed.data.dueOn || null,
    p_notes: parsed.data.notes || null,
  });
  if (error) return { message: "The resource could not be issued. Check that the copy and borrower are still eligible." };

  revalidatePath("/library");
  return { success: true, message: "Resource issued." };
}

export async function returnLibraryResource(_state: LibraryActionState, formData: FormData): Promise<LibraryActionState> {
  const parsed = returnSchema.safeParse({
    loanId: String(formData.get("loanId") ?? ""),
    returnedCondition: String(formData.get("returnedCondition") ?? ""),
    notes: String(formData.get("notes") ?? ""),
  });
  if (!parsed.success) return { message: "Choose a valid return condition." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("return_learning_resource", {
    p_loan_id: parsed.data.loanId,
    p_returned_condition: parsed.data.returnedCondition,
    p_notes: parsed.data.notes || null,
  });
  if (error) return { message: "The resource could not be returned. Refresh the page and try again." };

  revalidatePath("/library");
  return {
    success: true,
    message: parsed.data.returnedCondition === "lost" ? "Resource marked lost." : parsed.data.returnedCondition === "damaged" ? "Damaged return recorded." : "Resource returned.",
  };
}
