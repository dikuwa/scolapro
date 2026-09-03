"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type MyDetentionSupervisionItem = {
  obligationId: string;
  schoolId: string;
  learnerId: string;
  learnerName: string;
  academicYear: number;
  triggeredOn: string;
  originalDueOn: string;
  dueOn: string;
  qualifyingLateCount: number;
  rolloverCount: number;
  status: string;
  completedAt: string | null;
  resolutionNote: string | null;
  canComplete: boolean;
};

export type MyDetentionSupervisionPage = {
  items: MyDetentionSupervisionItem[];
  page: number;
  pageSize: number;
  totalCount: number;
  includeResolved: boolean;
};

type RpcRow = {
  obligation_id: string;
  school_id: string;
  learner_id: string;
  learner_first_names: string;
  learner_surname: string;
  academic_year: number;
  triggered_on: string;
  original_due_on: string;
  due_on: string;
  qualifying_late_count: number;
  rollover_count: number;
  status: string;
  completed_at: string | null;
  resolution_note: string | null;
  can_complete: boolean;
  total_count: number;
};

export async function getMyDetentionSupervision(input: {
  includeResolved?: boolean;
  page?: number;
  pageSize?: number;
} = {}): Promise<MyDetentionSupervisionPage> {
  const includeResolved = Boolean(input.includeResolved);
  const page = Math.max(input.page ?? 1, 1);
  const pageSize = Math.min(Math.max(input.pageSize ?? 25, 1), 50);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("list_my_detention_supervision", {
    p_include_resolved: includeResolved,
    p_page: page,
    p_page_size: pageSize,
  });

  if (error) throw new Error("Unable to load your detention supervision assignments.");

  const rows = (data ?? []) as RpcRow[];
  return {
    items: rows.map((row) => ({
      obligationId: row.obligation_id,
      schoolId: row.school_id,
      learnerId: row.learner_id,
      learnerName: `${row.learner_first_names} ${row.learner_surname}`.trim(),
      academicYear: row.academic_year,
      triggeredOn: row.triggered_on,
      originalDueOn: row.original_due_on,
      dueOn: row.due_on,
      qualifyingLateCount: Number(row.qualifying_late_count),
      rolloverCount: Number(row.rollover_count),
      status: row.status,
      completedAt: row.completed_at,
      resolutionNote: row.resolution_note,
      canComplete: row.can_complete,
    })),
    page,
    pageSize,
    totalCount: Number(rows[0]?.total_count ?? 0),
    includeResolved,
  };
}

export type CompleteMyDetentionState = { success?: boolean; message?: string };

const completeSchema = z.object({
  obligationId: z.string().uuid(),
  note: z.string().trim().max(1000).optional(),
});

export async function completeMyDetentionAssignment(
  _state: CompleteMyDetentionState,
  formData: FormData,
): Promise<CompleteMyDetentionState> {
  const parsed = completeSchema.safeParse({
    obligationId: String(formData.get("obligationId") ?? ""),
    note: String(formData.get("note") ?? ""),
  });
  if (!parsed.success) return { message: "Unable to complete this detention assignment." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("resolve_late_detention", {
    p_obligation_id: parsed.data.obligationId,
    p_status: "completed",
    p_note: parsed.data.note || null,
  });

  if (error) return { message: error.message };
  revalidatePath("/my-detention-supervision");
  return { success: true, message: "Detention marked as completed." };
}
